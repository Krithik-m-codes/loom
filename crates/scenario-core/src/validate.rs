use std::collections::HashSet;

use crate::{DiagnosticSeverity, ScenarioDiagnostic, ScenarioDocument, ScenarioNode, SourceSpan};

pub fn validate_scenario_document(document: &ScenarioDocument) -> Vec<ScenarioDiagnostic> {
    let mut diagnostics = Vec::new();
    let mut node_ids = HashSet::new();
    if document.schema_version != 1 {
        diagnostics.push(error(
            "SCENARIO_VERSION_UNSUPPORTED",
            "This scenario schema version is not supported.",
        ));
    }
    for (field, value) in [
        ("engineId", document.engine_id.as_str()),
        ("projectId", document.project_id.as_str()),
        ("suiteId", document.suite_id.as_str()),
    ] {
        if value.trim().is_empty() {
            diagnostics.push(error(
                "SCENARIO_ID_REQUIRED",
                &format!("{field} must not be empty."),
            ));
        }
    }
    for node in &document.nodes {
        visit_node(node, document, &mut node_ids, &mut diagnostics);
    }
    diagnostics
}

fn visit_node(
    node: &ScenarioNode,
    document: &ScenarioDocument,
    node_ids: &mut HashSet<String>,
    diagnostics: &mut Vec<ScenarioDiagnostic>,
) {
    let (id, engine_ids, span) = match node {
        ScenarioNode::Request {
            id,
            engine_ids,
            span,
            method,
            url,
            ..
        } => {
            if method.trim().is_empty() || url.trim().is_empty() {
                diagnostics.push(error(
                    "SCENARIO_REQUEST_INVALID",
                    "Requests need a method and URL.",
                ));
            }
            (id, engine_ids, span.as_ref())
        }
        ScenarioNode::Wait {
            id,
            engine_ids,
            span,
            seconds,
        } => {
            if !seconds.is_finite() || *seconds < 0.0 {
                diagnostics.push(error(
                    "SCENARIO_WAIT_INVALID",
                    "Wait duration must be a finite, non-negative number.",
                ));
            }
            (id, engine_ids, span.as_ref())
        }
        ScenarioNode::Check {
            id,
            engine_ids,
            span,
            expression,
        } => {
            if expression.trim().is_empty() {
                diagnostics.push(error(
                    "SCENARIO_CHECK_INVALID",
                    "Checks need an expression.",
                ));
            }
            (id, engine_ids, span.as_ref())
        }
        ScenarioNode::Group {
            id,
            engine_ids,
            span,
            label,
            children,
        }
        | ScenarioNode::Loop {
            id,
            engine_ids,
            span,
            label,
            children,
            ..
        } => {
            if label.trim().is_empty() {
                diagnostics.push(error(
                    "SCENARIO_GROUP_INVALID",
                    "Groups and loops need a label.",
                ));
            }
            for child in children {
                visit_node(child, document, node_ids, diagnostics);
            }
            (id, engine_ids, span.as_ref())
        }
        ScenarioNode::Native {
            id,
            engine_ids,
            span,
            reason,
        } => {
            if reason.trim().is_empty() {
                diagnostics.push(error(
                    "SCENARIO_NATIVE_REASON_REQUIRED",
                    "Native source blocks need an explanation.",
                ));
            }
            (id, engine_ids, Some(span))
        }
    };
    if id.trim().is_empty() || !node_ids.insert(id.clone()) {
        diagnostics.push(error(
            "SCENARIO_NODE_ID_INVALID",
            "Scenario node IDs must be non-empty and unique.",
        ));
    }
    if engine_ids.is_empty() || engine_ids.iter().any(|engine| engine.trim().is_empty()) {
        diagnostics.push(error(
            "SCENARIO_ENGINE_COMPATIBILITY_REQUIRED",
            "Each node must name at least one compatible engine.",
        ));
    }
    if let Some(span) = span {
        validate_span(span, document, diagnostics);
    }
}

fn validate_span(
    span: &SourceSpan,
    document: &ScenarioDocument,
    diagnostics: &mut Vec<ScenarioDiagnostic>,
) {
    let Some(source) = document
        .sources
        .iter()
        .find(|source| source.id == span.file_id)
    else {
        diagnostics.push(error(
            "SCENARIO_SOURCE_MISSING",
            "A node references a source file that is not in this scenario.",
        ));
        return;
    };
    if span.start_offset > span.end_offset || span.end_offset > source.content.len() {
        diagnostics.push(error(
            "SCENARIO_SOURCE_SPAN_INVALID",
            "Source offsets must be ordered byte offsets inside the source file.",
        ));
    }
}

fn error(code: &str, message: &str) -> ScenarioDiagnostic {
    ScenarioDiagnostic {
        code: code.into(),
        severity: DiagnosticSeverity::Error,
        message: message.into(),
        span: None,
    }
}
