mod goose;
mod k6;
mod locust;

use std::collections::BTreeMap;

use crate::{
    validate_scenario_document, ConfigParseResult, DiagnosticSeverity, EngineBundle,
    EngineConfigFile, EngineFile, EngineFileRole, ScenarioDiagnostic, ScenarioDocument,
    ScenarioNode, SourceDocument, SourceSpan,
};

const MAX_BUNDLE_BYTES: usize = 8 * 1024 * 1024;
const MAX_NODES: usize = 10_000;
const MAX_DEPTH: usize = 64;
const MAX_ARTIFACTS: usize = 128;

pub fn generate_locust(
    document: &ScenarioDocument,
) -> Result<EngineBundle, Vec<ScenarioDiagnostic>> {
    generate("locust", document)
}

pub fn generate_goose(
    document: &ScenarioDocument,
) -> Result<EngineBundle, Vec<ScenarioDiagnostic>> {
    generate("goose", document)
}

pub fn generate_k6(document: &ScenarioDocument) -> Result<EngineBundle, Vec<ScenarioDiagnostic>> {
    generate("k6", document)
}

fn generate(
    engine: &str,
    document: &ScenarioDocument,
) -> Result<EngineBundle, Vec<ScenarioDiagnostic>> {
    let limits = check_document_limits(document);
    if !limits.is_empty() {
        return Err(limits);
    }
    let mut diagnostics = validate_scenario_document(document);
    if document.engine_id != engine {
        diagnostics.push(error(
            "GENERATOR_ENGINE_MISMATCH",
            format!(
                "The scenario is for '{}', not '{engine}'.",
                document.engine_id
            ),
        ));
    }
    for node in &document.nodes {
        validate_compatibility(engine, node, &mut diagnostics);
    }
    let (files, mut config_diagnostics) = match diagnostics
        .iter()
        .any(|diagnostic| diagnostic.severity == DiagnosticSeverity::Error)
    {
        true => (Vec::new(), Vec::new()),
        false => {
            let mut files = generate_script(engine, document, &mut diagnostics);
            let configs = generate_configs(engine, &document.config_files);
            match configs {
                Ok((config_files, warnings)) => {
                    files.extend(config_files);
                    (files, warnings)
                }
                Err(errors) => {
                    diagnostics.extend(errors);
                    (Vec::new(), Vec::new())
                }
            }
        }
    };
    diagnostics.append(&mut config_diagnostics);
    if diagnostics
        .iter()
        .any(|diagnostic| diagnostic.severity == DiagnosticSeverity::Error)
    {
        return Err(diagnostics);
    }
    let mut output_paths = std::collections::BTreeSet::new();
    for file in &files {
        if !output_paths.insert(file.path.to_ascii_lowercase()) {
            diagnostics.push(error(
                "GENERATOR_PATH_DUPLICATE",
                format!("More than one generated artifact targets '{}'.", file.path),
            ));
        }
    }
    if files.iter().map(|file| file.content.len()).sum::<usize>() > MAX_BUNDLE_BYTES {
        return Err(vec![error(
            "GENERATOR_BUNDLE_TOO_LARGE",
            "Generated output exceeds the 8 MiB bundle limit.",
        )]);
    }
    if diagnostics
        .iter()
        .any(|diagnostic| diagnostic.severity == DiagnosticSeverity::Error)
    {
        return Err(diagnostics);
    }
    Ok(EngineBundle {
        engine_id: engine.into(),
        files,
        diagnostics,
    })
}

fn check_document_limits(document: &ScenarioDocument) -> Vec<ScenarioDiagnostic> {
    let total_bytes = document
        .sources
        .iter()
        .map(|source| source.content.len())
        .chain(
            document
                .config_files
                .iter()
                .map(|config| config.content.len()),
        )
        .chain(document.legacy_payload.iter().map(String::len))
        .fold(0usize, usize::saturating_add);
    if total_bytes > MAX_BUNDLE_BYTES {
        return vec![error(
            "GENERATOR_BUNDLE_TOO_LARGE",
            "Scenario sources, configs, and legacy data exceed the 8 MiB generation limit.",
        )];
    }
    if document.sources.len() + document.config_files.len() > MAX_ARTIFACTS {
        return vec![error(
            "GENERATOR_ARTIFACT_LIMIT",
            "A scenario may contain at most 128 source and config files.",
        )];
    }
    let mut stack: Vec<_> = document.nodes.iter().map(|node| (node, 1usize)).collect();
    let mut count = 0usize;
    while let Some((node, depth)) = stack.pop() {
        count += 1;
        if count > MAX_NODES {
            return vec![error(
                "GENERATOR_NODE_LIMIT",
                "A generated scenario may contain at most 10,000 nodes.",
            )];
        }
        if depth > MAX_DEPTH {
            return vec![error(
                "GENERATOR_NESTING_LIMIT",
                "Scenario nesting exceeds the supported 64-level limit.",
            )];
        }
        if let ScenarioNode::Group { children, .. } | ScenarioNode::Loop { children, .. } = node {
            stack.extend(children.iter().map(|child| (child, depth + 1)));
        }
    }
    Vec::new()
}

fn validate_compatibility(
    engine: &str,
    node: &ScenarioNode,
    diagnostics: &mut Vec<ScenarioDiagnostic>,
) {
    let (id, engine_ids) = match node {
        ScenarioNode::Request { id, engine_ids, .. }
        | ScenarioNode::Wait { id, engine_ids, .. }
        | ScenarioNode::Check { id, engine_ids, .. }
        | ScenarioNode::Group { id, engine_ids, .. }
        | ScenarioNode::Loop { id, engine_ids, .. }
        | ScenarioNode::Native { id, engine_ids, .. } => (id, engine_ids),
    };
    if !engine_ids.iter().any(|candidate| candidate == engine) {
        diagnostics.push(error(
            "GENERATOR_NODE_INCOMPATIBLE",
            format!("Node '{id}' is not compatible with {engine} and was not generated."),
        ));
    }
    match node {
        ScenarioNode::Check { .. } if engine != "k6" => diagnostics.push(error(
            "GENERATOR_NODE_INCOMPATIBLE",
            format!("Check nodes are not currently representable by {engine}."),
        )),
        ScenarioNode::Group { .. } if engine != "k6" => diagnostics.push(error(
            "GENERATOR_NODE_INCOMPATIBLE",
            format!("Group nodes are not currently representable by {engine}."),
        )),
        ScenarioNode::Loop {
            iterations: None, ..
        } => diagnostics.push(error(
            "GENERATOR_LOOP_UNBOUNDED",
            "An unbounded loop cannot be emitted safely; set a finite iteration count.",
        )),
        ScenarioNode::Group { children, .. } | ScenarioNode::Loop { children, .. } => {
            for child in children {
                validate_compatibility(engine, child, diagnostics);
            }
        }
        _ => {}
    }
}

fn generate_script(
    engine: &str,
    document: &ScenarioDocument,
    diagnostics: &mut Vec<ScenarioDiagnostic>,
) -> Vec<EngineFile> {
    let source_backed = !document.sources.is_empty();
    if source_backed && has_unspanned_visual(&document.nodes) {
        diagnostics.push(error(
            "GENERATOR_SOURCE_SPAN_MISSING",
            "Every edited node in an imported source must retain its source span. Convert the source to a new scenario before adding unanchored nodes.",
        ));
        return vec![];
    }

    if !source_backed {
        let generated = match engine {
            "locust" => locust::render_document(document),
            "goose" => goose::render_document(document),
            "k6" => k6::render_document(document),
            _ => unreachable!("only built-in engines call this function"),
        };
        return generated.unwrap_or_else(|diagnostic| {
            diagnostics.push(diagnostic);
            vec![]
        });
    }

    let sources: BTreeMap<_, _> = document
        .sources
        .iter()
        .map(|source| (source.id.clone(), source))
        .collect();
    let mut edits: BTreeMap<String, Vec<(SourceSpan, String)>> = BTreeMap::new();
    collect_edits(engine, &document.nodes, &sources, &mut edits, diagnostics);
    if diagnostics
        .iter()
        .any(|diagnostic| diagnostic.severity == DiagnosticSeverity::Error)
    {
        return vec![];
    }

    let mut files = Vec::new();
    for source in &document.sources {
        if !source_kind_matches(engine, source) {
            diagnostics.push(error(
                "GENERATOR_SOURCE_KIND_INVALID",
                format!(
                    "Source '{}' does not have a script extension supported by {engine}.",
                    source.file_name
                ),
            ));
            continue;
        }
        let mut content = source.content.clone();
        if let Some(replacements) = edits.get(&source.id) {
            let mut ordered = replacements.clone();
            ordered.sort_by_key(|(span, _)| span.start_offset);
            let mut patched = String::with_capacity(content.len());
            let mut cursor = 0usize;
            for (span, replacement) in ordered {
                patched.push_str(&content[cursor..span.start_offset]);
                patched.push_str(&replacement);
                cursor = span.end_offset;
            }
            patched.push_str(&content[cursor..]);
            content = patched;
        }
        let Some(path) = safe_source_path(engine, &source.file_name) else {
            diagnostics.push(error(
                "GENERATOR_PATH_UNSAFE",
                format!(
                    "Source path '{}' is not a safe project-relative file path.",
                    source.file_name
                ),
            ));
            continue;
        };
        files.push(EngineFile {
            path,
            content,
            role: EngineFileRole::Script,
        });
    }
    if engine == "goose" && !files.iter().any(|file| file.path == "Cargo.toml") {
        files.push(EngineFile {
            path: "Cargo.toml".into(),
            content: goose::manifest().into(),
            role: EngineFileRole::Manifest,
        });
    }
    if engine == "goose" && !files.iter().any(|file| file.path == "src/main.rs") {
        diagnostics.push(error(
            "GENERATOR_GOOSE_ENTRY_REQUIRED",
            "A Goose project needs a src/main.rs entry point; add or rename the main test source.",
        ));
    }
    files
}

fn collect_edits(
    engine: &str,
    nodes: &[ScenarioNode],
    sources: &BTreeMap<String, &SourceDocument>,
    edits: &mut BTreeMap<String, Vec<(SourceSpan, String)>>,
    diagnostics: &mut Vec<ScenarioDiagnostic>,
) {
    for node in nodes {
        let span = node_span(node);
        if let Some(span) = span {
            let Some(source) = sources.get(&span.file_id) else {
                diagnostics.push(error(
                    "GENERATOR_SOURCE_MISSING",
                    format!("Node source '{}' is missing.", span.file_id),
                ));
                continue;
            };
            if span.start_offset > span.end_offset
                || span.end_offset > source.content.len()
                || !source.content.is_char_boundary(span.start_offset)
                || !source.content.is_char_boundary(span.end_offset)
            {
                diagnostics.push(error(
                    "GENERATOR_SOURCE_SPAN_INVALID",
                    format!(
                        "Node source span for '{}' is outside valid UTF-8 boundaries.",
                        span.file_id
                    ),
                ));
                continue;
            }
            let rendered = if let ScenarioNode::Native { .. } = node {
                Ok(source.content[span.start_offset..span.end_offset].to_owned())
            } else {
                render_node(engine, node)
            };
            match rendered {
                Ok(rendered) => edits
                    .entry(span.file_id.clone())
                    .or_default()
                    .push((span.clone(), rendered)),
                Err(diagnostic) => diagnostics.push(diagnostic),
            }
        } else if let ScenarioNode::Group { children, .. } | ScenarioNode::Loop { children, .. } =
            node
        {
            if !children.is_empty() {
                collect_edits(engine, children, sources, edits, diagnostics);
            }
        }
    }

    for replacements in edits.values_mut() {
        replacements.sort_by_key(|(span, _)| span.start_offset);
        for pair in replacements.windows(2) {
            if pair[0].0.end_offset > pair[1].0.start_offset {
                diagnostics.push(error(
                    "GENERATOR_SPANS_OVERLAP",
                    "Edited source ranges overlap; no files were generated.",
                ));
            }
        }
    }
}

fn has_unspanned_visual(nodes: &[ScenarioNode]) -> bool {
    nodes.iter().any(|node| match node {
        ScenarioNode::Native { .. } => false,
        ScenarioNode::Request { span, .. }
        | ScenarioNode::Wait { span, .. }
        | ScenarioNode::Check { span, .. } => span.is_none(),
        ScenarioNode::Group { span: Some(_), .. } | ScenarioNode::Loop { span: Some(_), .. } => {
            false
        }
        ScenarioNode::Group { span: None, .. } | ScenarioNode::Loop { span: None, .. } => true,
    })
}

fn node_span(node: &ScenarioNode) -> Option<&SourceSpan> {
    match node {
        ScenarioNode::Request { span, .. }
        | ScenarioNode::Wait { span, .. }
        | ScenarioNode::Check { span, .. }
        | ScenarioNode::Group { span, .. }
        | ScenarioNode::Loop { span, .. } => span.as_ref(),
        ScenarioNode::Native { span, .. } => Some(span),
    }
}

fn render_node(engine: &str, node: &ScenarioNode) -> Result<String, ScenarioDiagnostic> {
    match engine {
        "locust" => locust::render_node(node, 0),
        "goose" => goose::render_node(node, 0),
        "k6" => k6::render_node(node, 0),
        _ => unreachable!("only built-in engines call this function"),
    }
}

fn generate_configs(
    engine: &str,
    configs: &[EngineConfigFile],
) -> Result<(Vec<EngineFile>, Vec<ScenarioDiagnostic>), Vec<ScenarioDiagnostic>> {
    let mut files = Vec::new();
    let mut warnings = Vec::new();
    let mut errors = Vec::new();
    for config in configs {
        let Some(path) = safe_relative_path(&config.file_name) else {
            errors.push(error(
                "GENERATOR_PATH_UNSAFE",
                format!(
                    "Config path '{}' is not a safe project-relative file path.",
                    config.file_name
                ),
            ));
            continue;
        };
        let ConfigParseResult {
            recognized,
            diagnostics,
            ..
        } = crate::parsers::parse_engine_config(engine, config);
        for diagnostic in diagnostics {
            match diagnostic.severity {
                DiagnosticSeverity::Error => errors.push(diagnostic),
                DiagnosticSeverity::Warning => warnings.push(diagnostic),
                DiagnosticSeverity::Info => {}
            }
        }
        if !errors.is_empty() {
            continue;
        }
        errors.extend(validate_profile(engine, &recognized));
        if !errors.is_empty() {
            continue;
        }
        if !config_format_matches(engine, &config.format) {
            errors.push(error(
                "GENERATOR_CONFIG_UNSUPPORTED",
                format!(
                    "Config format '{}' is unsupported by {engine}.",
                    config.format
                ),
            ));
            continue;
        }
        files.push(EngineFile {
            path,
            content: config.content.clone(),
            role: EngineFileRole::Config,
        });
    }
    if errors.is_empty() {
        Ok((files, warnings))
    } else {
        Err(errors)
    }
}

fn validate_profile(engine: &str, profile: &serde_json::Value) -> Vec<ScenarioDiagnostic> {
    let Some(values) = profile.as_object() else {
        return vec![];
    };
    let mut diagnostics = Vec::new();
    match engine {
        "locust" => {
            check_positive(&mut diagnostics, engine, values, "users", true);
            check_positive(&mut diagnostics, engine, values, "spawn-rate", false);
        }
        "goose" => {
            check_positive(&mut diagnostics, engine, values, "users", true);
            check_positive(&mut diagnostics, engine, values, "hatch_rate", false);
        }
        "k6" => {
            check_positive(&mut diagnostics, engine, values, "vus", true);
            check_positive(&mut diagnostics, engine, values, "iterations", true);
            if let Some(duration) = values.get("duration") {
                if duration
                    .as_str()
                    .is_none_or(|value| value.trim().is_empty())
                {
                    diagnostics.push(error(
                        "GENERATOR_PROFILE_INVALID",
                        "'duration' must be a non-empty duration string in the k6 profile.",
                    ));
                }
            }
        }
        _ => unreachable!(),
    }
    diagnostics
}

fn check_positive(
    diagnostics: &mut Vec<ScenarioDiagnostic>,
    engine: &str,
    values: &serde_json::Map<String, serde_json::Value>,
    key: &str,
    integer: bool,
) {
    let Some(value) = values.get(key) else {
        return;
    };
    let valid = if integer {
        value.as_u64().is_some_and(|value| value > 0)
    } else {
        value
            .as_f64()
            .is_some_and(|value| value.is_finite() && value > 0.0)
    };
    if !valid {
        diagnostics.push(error(
            "GENERATOR_PROFILE_INVALID",
            format!(
                "'{key}' must be a positive {} in the {engine} profile.",
                if integer { "integer" } else { "number" }
            ),
        ));
    }
}

fn config_format_matches(engine: &str, format: &str) -> bool {
    match engine {
        "locust" => matches!(format, "locust-conf" | "toml"),
        "goose" => format == "loom-goose-toml",
        "k6" => format == "json",
        _ => false,
    }
}

fn safe_source_path(engine: &str, path: &str) -> Option<String> {
    let path = safe_relative_path(path)?;
    if engine == "goose" && !path.starts_with("src/") && path.ends_with(".rs") {
        Some("src/main.rs".into())
    } else {
        Some(path)
    }
}

fn source_kind_matches(engine: &str, source: &SourceDocument) -> bool {
    let extension = source
        .file_name
        .rsplit_once('.')
        .map(|(_, extension)| extension);
    match engine {
        "locust" => {
            source.language.eq_ignore_ascii_case("python")
                && extension.is_some_and(|extension| extension.eq_ignore_ascii_case("py"))
        }
        "goose" => {
            source.language.eq_ignore_ascii_case("rust")
                && extension.is_some_and(|extension| extension.eq_ignore_ascii_case("rs"))
        }
        "k6" => {
            matches!(
                source.language.to_ascii_lowercase().as_str(),
                "javascript" | "typescript"
            ) && extension.is_some_and(|extension| {
                extension.eq_ignore_ascii_case("js") || extension.eq_ignore_ascii_case("ts")
            })
        }
        _ => false,
    }
}

fn safe_relative_path(path: &str) -> Option<String> {
    if path.trim().is_empty()
        || path.contains('\\')
        || path.starts_with('/')
        || path.chars().any(|character| {
            character.is_control() || matches!(character, '<' | '>' | ':' | '"' | '|' | '?' | '*')
        })
    {
        return None;
    }
    let components: Vec<_> = path.split('/').collect();
    if components.iter().any(|part| {
        if part.is_empty() || *part == "." || *part == ".." || part.ends_with(['.', ' ']) {
            return true;
        }
        let base = part
            .split('.')
            .next()
            .unwrap_or_default()
            .to_ascii_uppercase();
        matches!(base.as_str(), "CON" | "PRN" | "AUX" | "NUL")
            || (base.len() == 4
                && (base.starts_with("COM") || base.starts_with("LPT"))
                && base.as_bytes()[3].is_ascii_digit())
    }) {
        return None;
    }
    Some(path.to_owned())
}

pub(super) fn error(code: &str, message: impl Into<String>) -> ScenarioDiagnostic {
    ScenarioDiagnostic {
        code: code.into(),
        severity: DiagnosticSeverity::Error,
        message: message.into(),
        span: None,
    }
}

pub(super) fn escape_secret(
    engine: &str,
    value: &str,
) -> Result<Option<String>, ScenarioDiagnostic> {
    let Some(secret_name) = value
        .strip_prefix("{{loom_secret:")
        .and_then(|value| value.strip_suffix("}}"))
    else {
        return Ok(None);
    };
    if secret_name.is_empty()
        || !secret_name.bytes().enumerate().all(|(index, byte)| {
            byte == b'_'
                || byte.is_ascii_alphanumeric() && (index > 0 || byte.is_ascii_alphabetic())
        })
    {
        return Err(error(
            "GENERATOR_SECRET_REF_INVALID",
            "Secret references must use {{loom_secret:NAME}} with an environment-variable name.",
        ));
    }
    let expression = match engine {
        "locust" => format!("__import__('os').environ[{secret_name:?}]"),
        "goose" => format!("std::env::var({secret_name:?}).expect(\"Set {secret_name}\").as_str()"),
        "k6" => format!("__ENV.{secret_name}"),
        _ => unreachable!(),
    };
    Ok(Some(expression))
}

pub(super) fn quoted(engine: &str, value: &str) -> Result<String, ScenarioDiagnostic> {
    if let Some(expression) = escape_secret(engine, value)? {
        return Ok(expression);
    }
    if engine == "goose" {
        return Ok(format!("{value:?}"));
    }
    serde_json::to_string(value).map_err(|_| {
        error(
            "GENERATOR_LITERAL_INVALID",
            "A string literal could not be encoded.",
        )
    })
}

pub(super) fn quoted_owned(engine: &str, value: &str) -> Result<String, ScenarioDiagnostic> {
    if engine == "goose" {
        if let Some(expression) = escape_secret(engine, value)? {
            return Ok(expression
                .strip_suffix(".as_str()")
                .unwrap_or(&expression)
                .to_owned());
        }
    }
    quoted(engine, value)
}
