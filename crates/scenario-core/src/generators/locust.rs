use crate::{EngineFileRole, ScenarioDocument, ScenarioNode};

use super::{error, quoted};

pub(super) fn render_document(
    document: &ScenarioDocument,
) -> Result<Vec<crate::EngineFile>, crate::ScenarioDiagnostic> {
    let body = if document.nodes.is_empty() {
        "        pass\n".to_owned()
    } else {
        render_nodes(&document.nodes, 8)?
    };
    Ok(vec![crate::EngineFile {
        path: "locustfile.py".into(),
        content: format!(
            "from locust import HttpUser, task\n\nclass LoomUser(HttpUser):\n    @task\n    def run_scenario(self):\n{body}"
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
                    format!("Locust cannot represent the HTTP method '{method}'."),
                ));
            }
            validate_headers(headers.as_ref())?;
            let url = quoted("locust", url)?;
            let mut options = Vec::new();
            if let Some(headers) = headers {
                let values = headers
                    .iter()
                    .map(|(key, value)| Ok(format!("{key:?}: {}", quoted("locust", value)?)))
                    .collect::<Result<Vec<_>, crate::ScenarioDiagnostic>>()?;
                options.push(format!("headers={{{}}}", values.join(", ")));
            }
            if let Some(body) = body {
                options.push(format!("data={}", quoted("locust", body)?));
            }
            let suffix = if options.is_empty() {
                String::new()
            } else {
                format!(", {}", options.join(", "))
            };
            Ok(format!("self.client.{method}({url}{suffix})"))
        }
        ScenarioNode::Wait { seconds, .. } => Ok(format!("__import__('time').sleep({seconds:?})")),
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
            let body = render_nodes(children, indentation + 4)?;
            Ok(format!(
                "for _ in range({count}):\n{body}{}pass",
                " ".repeat(indentation)
            ))
        }
        ScenarioNode::Native { .. } => Err(error(
            "GENERATOR_NATIVE_SOURCE_REQUIRED",
            "Native code must reference an original source file to be preserved.",
        )),
        _ => Err(error(
            "GENERATOR_NODE_INCOMPATIBLE",
            "This node cannot be represented by Locust.",
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

fn validate_headers(
    headers: Option<&std::collections::BTreeMap<String, String>>,
) -> Result<(), crate::ScenarioDiagnostic> {
    if headers.is_some_and(|headers| {
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
    Ok(())
}
