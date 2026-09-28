use std::{
    sync::atomic::Ordering,
    time::{Duration, Instant},
};

use tree_sitter::{Language, Node, ParseOptions, ParseState, Parser, Point};

use crate::{
    ConfigParseResult, DiagnosticSeverity, EngineConfigFile, ParseContext, ParseResult,
    ScenarioDiagnostic, ScenarioNode, SourceDocument, SourceSpan,
};

mod goose;
mod k6;
mod locust;

const MAX_SOURCE_BYTES: usize = 2 * 1024 * 1024;
const MAX_DEPTH: usize = 64;
const PARSE_BUDGET: Duration = Duration::from_secs(2);

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum EngineSyntax {
    Locust,
    Goose,
    K6,
}

impl EngineSyntax {
    fn id(self) -> &'static str {
        match self {
            Self::Locust => "locust",
            Self::Goose => "goose",
            Self::K6 => "k6",
        }
    }
}

pub fn parse_locust(source: &SourceDocument, context: &ParseContext) -> ParseResult {
    parse_source(source, context, EngineSyntax::Locust)
}
pub fn parse_goose(source: &SourceDocument, context: &ParseContext) -> ParseResult {
    parse_source(source, context, EngineSyntax::Goose)
}
pub fn parse_k6(source: &SourceDocument, context: &ParseContext) -> ParseResult {
    parse_source(source, context, EngineSyntax::K6)
}

fn parse_source(
    source: &SourceDocument,
    context: &ParseContext,
    engine: EngineSyntax,
) -> ParseResult {
    let mut result = ParseResult {
        source: source.clone(),
        nodes: vec![],
        diagnostics: vec![],
        covered_ranges: vec![],
        support_percent: 0,
    };
    if source.content.is_empty() {
        return result;
    }
    let max_bytes = context.max_bytes.min(MAX_SOURCE_BYTES);
    if source.content.len() > max_bytes {
        result.diagnostics.push(error(
            "PARSE_SOURCE_TOO_LARGE",
            format!("Source exceeds the {max_bytes} byte parsing limit; its text remains intact."),
        ));
        result.nodes.push(native_node(
            source,
            engine.id(),
            0,
            source.content.len(),
            "Source exceeds the safe parser size limit.",
        ));
        return result;
    }
    if is_cancelled(context) {
        result.diagnostics.push(error(
            "PARSE_CANCELLED",
            "Parsing was cancelled; the original source remains available.",
        ));
        result.nodes.push(native_node(
            source,
            engine.id(),
            0,
            source.content.len(),
            "Parsing was cancelled.",
        ));
        return result;
    }

    let language: Language = match engine {
        EngineSyntax::Locust => tree_sitter_python::LANGUAGE.into(),
        EngineSyntax::Goose => tree_sitter_rust::LANGUAGE.into(),
        EngineSyntax::K6
            if source.language.eq_ignore_ascii_case("typescript")
                || source.file_name.ends_with(".ts") =>
        {
            tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into()
        }
        EngineSyntax::K6 => tree_sitter_javascript::LANGUAGE.into(),
    };
    let mut parser = Parser::new();
    if parser.set_language(&language).is_err() {
        result.diagnostics.push(error(
            "PARSE_GRAMMAR_UNAVAILABLE",
            "The bundled syntax grammar is incompatible with this Loom build.",
        ));
        result.nodes.push(native_node(
            source,
            engine.id(),
            0,
            source.content.len(),
            "The grammar could not parse this source.",
        ));
        return result;
    }
    let started = Instant::now();
    let cancel = context.cancellation.clone();
    let mut progress = move |_state: &ParseState| {
        started.elapsed() >= PARSE_BUDGET
            || cancel
                .as_ref()
                .is_some_and(|flag| flag.load(Ordering::Relaxed))
    };
    let options = ParseOptions::new().progress_callback(&mut progress);
    let input_bytes = source.content.as_bytes();
    let mut input = |byte_offset: usize, _position: Point| &input_bytes[byte_offset..];
    let Some(tree) = parser.parse_with_options(&mut input, None, Some(options)) else {
        let cancelled = is_cancelled(context);
        result.diagnostics.push(error(
            if cancelled {
                "PARSE_CANCELLED"
            } else {
                "PARSE_TIMEOUT"
            },
            if cancelled {
                "Parsing was cancelled; the original source remains available."
            } else {
                "Parsing exceeded the 2 second budget; the original source remains available."
            },
        ));
        result.nodes.push(native_node(
            source,
            engine.id(),
            0,
            source.content.len(),
            "Parsing did not complete.",
        ));
        return result;
    };
    let root = tree.root_node();
    if exceeds_tree_depth(root, MAX_DEPTH) {
        result.diagnostics.push(error(
            "PARSE_NESTING_LIMIT",
            "Source nesting exceeds the supported 64-level limit.",
        ));
        result.nodes.push(native_node(
            source,
            engine.id(),
            0,
            source.content.len(),
            "Source is too deeply nested for safe visualization.",
        ));
        return result;
    }
    if root.has_error() {
        result.diagnostics.push(ScenarioDiagnostic { code: "PARSE_SYNTAX_ERROR".into(), severity: DiagnosticSeverity::Error, message: "The source contains syntax errors. Recognizable sections are shown without changing the original text.".into(), span: Some(SourceSpan { file_id: source.id.clone(), start_offset: root.start_byte(), end_offset: root.end_byte() }) });
    }
    collect_nodes(
        root,
        source,
        engine,
        &mut result.nodes,
        &mut result.covered_ranges,
    );
    if root.has_error() && !result.nodes.iter().any(|node| matches!(node, ScenarioNode::Native { span, .. } if span.start_offset == 0 && span.end_offset == source.content.len())) {
        result.nodes.push(native_node(source, engine.id(), 0, source.content.len(), "Malformed source is retained as a native source block."));
    }
    if result.nodes.is_empty() && !source.content.trim().is_empty() {
        result.nodes.push(native_node(
            source,
            engine.id(),
            0,
            source.content.len(),
            "No supported construct was recognized; original source is retained.",
        ));
    }
    result.support_percent = coverage_percent(source.content.len(), &result.covered_ranges);
    result
}

fn is_cancelled(context: &ParseContext) -> bool {
    context
        .cancellation
        .as_ref()
        .is_some_and(|flag| flag.load(Ordering::Relaxed))
}

fn collect_nodes(
    node: Node<'_>,
    source: &SourceDocument,
    engine: EngineSyntax,
    nodes: &mut Vec<ScenarioNode>,
    covered: &mut Vec<SourceSpan>,
) {
    let before = nodes.len();
    if let Some(visual) = parse_visual_call(node, source, engine, nodes, covered) {
        nodes.push(visual);
        return;
    }
    if is_call_like(node.kind()) {
        nodes.push(native_node(
            source,
            engine.id(),
            node.start_byte(),
            node.end_byte(),
            "Dynamic or unsupported call is preserved verbatim.",
        ));
        return;
    }
    let mut cursor = node.walk();
    for child in node.named_children(&mut cursor) {
        collect_nodes(child, source, engine, nodes, covered);
    }
    if matches!(node.kind(), "function_definition" | "function_item")
        && !nodes[before..].iter().any(is_visual_node)
        && node.end_byte() > node.start_byte()
    {
        nodes.truncate(before);
        nodes.push(native_node(source, engine.id(), node.start_byte(), node.end_byte(), "Function contains dynamic or unsupported behavior and is preserved as a complete source block."));
        return;
    }
    if nodes.len() == before && opaque_container(node.kind()) && node.end_byte() > node.start_byte()
    {
        nodes.push(native_node(
            source,
            engine.id(),
            node.start_byte(),
            node.end_byte(),
            "No supported action was recognized in this engine-native block.",
        ));
    }
}

fn is_visual_node(node: &ScenarioNode) -> bool {
    matches!(
        node,
        ScenarioNode::Request { .. }
            | ScenarioNode::Wait { .. }
            | ScenarioNode::Check { .. }
            | ScenarioNode::Group { .. }
            | ScenarioNode::Loop { .. }
    )
}

fn parse_visual_call(
    node: Node<'_>,
    source: &SourceDocument,
    engine: EngineSyntax,
    nodes: &mut Vec<ScenarioNode>,
    covered: &mut Vec<SourceSpan>,
) -> Option<ScenarioNode> {
    if !is_call_like(node.kind()) {
        return None;
    }
    let text = node.utf8_text(source.content.as_bytes()).ok()?;
    let function = node
        .child_by_field_name("function")
        .and_then(|child| child.utf8_text(source.content.as_bytes()).ok())
        .unwrap_or(text);
    let args = node.child_by_field_name("arguments");
    let arg0 = args.and_then(|args| args.named_child(0));
    let literal = arg0.and_then(|arg| string_literal(arg, source));
    let mut method = match engine {
        EngineSyntax::Locust if function.contains("self.client.") => function
            .rsplit('.')
            .next()
            .unwrap_or("")
            .to_ascii_uppercase(),
        EngineSyntax::Goose if function.contains("user.") => function
            .rsplit('.')
            .next()
            .unwrap_or("")
            .to_ascii_uppercase(),
        EngineSyntax::K6 if function.contains("http.") => function
            .rsplit('.')
            .next()
            .unwrap_or("")
            .to_ascii_uppercase(),
        _ => String::new(),
    };
    let span = Some(SourceSpan {
        file_id: source.id.clone(),
        start_offset: node.start_byte(),
        end_offset: node.end_byte(),
    });
    let id = format!("{}-{}", source.id, node.start_byte());
    if matches!(
        method.as_str(),
        "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD"
    ) {
        let url = literal?;
        if let Some(range) = span.clone() {
            covered.push(range);
        }
        return Some(ScenarioNode::Request {
            id,
            engine_ids: vec![engine.id().into()],
            span,
            method,
            url,
            headers: None,
            body: None,
        });
    }
    method.clear();
    if engine == EngineSyntax::K6 && function.trim() == "sleep" {
        let seconds = arg0?
            .utf8_text(source.content.as_bytes())
            .ok()?
            .parse::<f64>()
            .ok()?;
        if !seconds.is_finite() || seconds < 0.0 {
            return None;
        }
        if let Some(range) = span.clone() {
            covered.push(range);
        }
        return Some(ScenarioNode::Wait {
            id,
            engine_ids: vec![engine.id().into()],
            span,
            seconds,
        });
    }
    if engine == EngineSyntax::K6 && function.trim() == "check" {
        if let Some(range) = span.clone() {
            covered.push(range);
        }
        return Some(ScenarioNode::Check {
            id,
            engine_ids: vec![engine.id().into()],
            span,
            expression: text.to_owned(),
        });
    }
    if engine == EngineSyntax::K6 && function.trim() == "group" {
        let label = literal?;
        let mut children = Vec::new();
        if let Some(callback) = args.and_then(|args| args.named_child(1)) {
            collect_nodes(callback, source, engine, &mut children, covered);
        }
        if let Some(range) = span.clone() {
            covered.push(range);
        }
        return Some(ScenarioNode::Group {
            id,
            engine_ids: vec![engine.id().into()],
            span,
            label,
            children,
        });
    }
    let _ = nodes;
    None
}

fn string_literal(node: Node<'_>, source: &SourceDocument) -> Option<String> {
    let raw = node.utf8_text(source.content.as_bytes()).ok()?.trim();
    if node.kind() == "template_string" || raw.starts_with('f') || raw.starts_with('F') {
        return None;
    }
    let quote_offset = raw.find(['\'', '"'])?;
    let quote = raw.as_bytes().get(quote_offset).copied()? as char;
    if !raw.ends_with(quote) || quote_offset + 1 > raw.len() - 1 {
        return None;
    }
    Some(raw[quote_offset + 1..raw.len() - 1].to_owned())
}

fn is_call_like(kind: &str) -> bool {
    matches!(kind, "call" | "call_expression" | "macro_invocation")
}
fn opaque_container(kind: &str) -> bool {
    matches!(
        kind,
        "function_definition"
            | "class_definition"
            | "function_item"
            | "impl_item"
            | "export_statement"
            | "expression_statement"
            | "return_statement"
            | "let_declaration"
            | "macro_invocation"
    )
}

fn exceeds_tree_depth(node: Node<'_>, maximum: usize) -> bool {
    let mut stack = vec![(node, 0usize)];
    while let Some((current, depth)) = stack.pop() {
        if depth > maximum {
            return true;
        }
        let mut cursor = current.walk();
        stack.extend(
            current
                .named_children(&mut cursor)
                .map(|child| (child, depth + 1)),
        );
    }
    false
}

pub(crate) fn native_node(
    source: &SourceDocument,
    engine: &str,
    start: usize,
    end: usize,
    reason: &str,
) -> ScenarioNode {
    ScenarioNode::Native {
        id: format!("{}-native-{start}-{end}", source.id),
        engine_ids: vec![engine.into()],
        span: SourceSpan {
            file_id: source.id.clone(),
            start_offset: start,
            end_offset: end,
        },
        reason: reason.into(),
    }
}

fn coverage_percent(source_len: usize, spans: &[SourceSpan]) -> u8 {
    if source_len == 0 {
        return 0;
    }
    let mut ranges: Vec<_> = spans
        .iter()
        .map(|span| (span.start_offset, span.end_offset))
        .collect();
    ranges.sort_unstable();
    let (mut total, mut end) = (0usize, 0usize);
    for (start, next_end) in ranges {
        if next_end > end {
            total += next_end.saturating_sub(start.max(end));
            end = next_end;
        }
    }
    ((total.min(source_len) * 100) / source_len).min(99) as u8
}

pub fn parse_engine_config(engine: &str, source: &EngineConfigFile) -> ConfigParseResult {
    if source.content.len() > MAX_SOURCE_BYTES {
        return config_result(
            source,
            serde_json::Value::Null,
            vec![error(
                "CONFIG_SOURCE_TOO_LARGE",
                format!(
                    "Config exceeds the {MAX_SOURCE_BYTES} byte parsing limit; its text remains intact."
                ),
            )],
        );
    }
    match engine {
        "locust" => locust::parse_config(source),
        "goose" => goose::parse_config(source),
        "k6" => k6::parse_config(source),
        _ => ConfigParseResult {
            source: source.clone(),
            recognized: serde_json::Value::Null,
            diagnostics: vec![error(
                "CONFIG_ENGINE_UNKNOWN",
                format!("Unknown load-test engine '{engine}'."),
            )],
        },
    }
}

pub(crate) fn error(code: &str, message: impl Into<String>) -> ScenarioDiagnostic {
    ScenarioDiagnostic {
        code: code.into(),
        severity: DiagnosticSeverity::Error,
        message: message.into(),
        span: None,
    }
}
pub(crate) fn warning(code: &str, message: impl Into<String>) -> ScenarioDiagnostic {
    ScenarioDiagnostic {
        code: code.into(),
        severity: DiagnosticSeverity::Warning,
        message: message.into(),
        span: None,
    }
}
pub(crate) fn info(code: &str, message: impl Into<String>) -> ScenarioDiagnostic {
    ScenarioDiagnostic {
        code: code.into(),
        severity: DiagnosticSeverity::Info,
        message: message.into(),
        span: None,
    }
}

pub(crate) fn config_result(
    source: &EngineConfigFile,
    recognized: serde_json::Value,
    diagnostics: Vec<ScenarioDiagnostic>,
) -> ConfigParseResult {
    ConfigParseResult {
        source: source.clone(),
        recognized,
        diagnostics,
    }
}
