use crate::{EngineFileRole, ScenarioDocument, ScenarioNode};

use super::{error, quoted};

pub(super) fn render_document(
    document: &ScenarioDocument,
) -> Result<Vec<crate::EngineFile>, crate::ScenarioDiagnostic> {
    let body = render_nodes(&document.nodes, 2)?;
    Ok(vec![crate::EngineFile {
        path: "scenario.js".into(),
        content: format!(
            "import http from 'k6/http';\nimport {{ check, group, sleep }} from 'k6';\n\nexport default function () {{\n{body}}}\n"
        ),
        role: EngineFileRole::Script,
    }])
}

pub(super) fn render_node(
    node: &ScenarioNode,
    indentation: usize,
) -> Result<String, crate::ScenarioDiagnostic> {
    match node {
        ScenarioNode::Request {
            method,
            url,
            headers,
            body,
            ..
        } => {
            let method = method.to_ascii_lowercase();
            if !matches!(
                method.as_str(),
                "get" | "post" | "put" | "patch" | "delete" | "head"
            ) {
                return Err(error(
                    "GENERATOR_METHOD_UNSUPPORTED",
                    format!("k6 cannot represent the HTTP method '{method}'."),
                ));
            }
            if headers.as_ref().is_some_and(|headers| {
                headers.iter().any(|(key, value)| {
                    key.is_empty()
                        || key.contains(':')
                        || key.chars().any(char::is_control)
                        || value.chars().any(char::is_control)
                })
            }) {
                return Err(error(
                    "GENERATOR_HEADER_INVALID",
                    "Header names and values must not contain newlines or invalid separators.",
                ));
            }
            let url = quoted("k6", url)?;
            let mut args = vec![url];
            if let Some(body) = body {
                args.push(quoted("k6", body)?);
            }
            if let Some(headers) = headers.as_ref().filter(|headers| !headers.is_empty()) {
                let entries = headers
                    .iter()
                    .map(|(key, value)| Ok(format!("{key:?}: {}", quoted("k6", value)?)))
                    .collect::<Result<Vec<_>, crate::ScenarioDiagnostic>>()?;
                if body.is_none() {
                    args.push("undefined".into());
                }
                args.push(format!("{{ headers: {{{}}} }}", entries.join(", ")));
            }
            Ok(format!("http.{method}({});", args.join(", ")))
        }
        ScenarioNode::Wait { seconds, .. } => Ok(format!("sleep({seconds:?});")),
        ScenarioNode::Check { expression, .. } => Ok(expression.clone()),
        ScenarioNode::Group {
            label, children, ..
        } => {
            let label = quoted("k6", label)?;
            let body = render_nodes(children, indentation + 2)?;
            Ok(format!(
                "group({label}, () => {{\n{body}{} }});",
                " ".repeat(indentation)
            ))
        }
        ScenarioNode::Loop {
            iterations,
            children,
            ..
        } => {
            let count = iterations.ok_or_else(|| {
                error(
                    "GENERATOR_LOOP_UNBOUNDED",
                    "An unbounded loop cannot be emitted safely.",
                )
            })?;
            let body = render_nodes(children, indentation + 2)?;
            Ok(format!(
                "for (let i = 0; i < {count}; i++) {{\n{body}{} }}",
                " ".repeat(indentation)
            ))
        }
        ScenarioNode::Native { .. } => Err(error(
            "GENERATOR_NATIVE_SOURCE_REQUIRED",
            "Native code must reference an original source file to be preserved.",
        )),
    }
}

fn render_nodes(
    nodes: &[ScenarioNode],
    indentation: usize,
) -> Result<String, crate::ScenarioDiagnostic> {
    let prefix = " ".repeat(indentation);
    nodes
        .iter()
        .map(|node| render_node(node, indentation).map(|rendered| format!("{prefix}{rendered}\n")))
        .collect::<Result<Vec<_>, _>>()
        .map(|nodes| nodes.concat())
}
