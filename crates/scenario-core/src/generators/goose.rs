use crate::{EngineFileRole, ScenarioDocument, ScenarioNode};

use super::{error, quoted, quoted_owned};

const MANIFEST: &str = "[package]\nname = \"loom_scenario\"\nversion = \"0.1.0\"\nedition = \"2021\"\n\n[dependencies]\ngoose = \"=0.18.1\"\ntokio = { version = \"1\", features = [\"macros\", \"rt-multi-thread\"] }\n";

pub(super) fn manifest() -> &'static str {
    MANIFEST
}

pub(super) fn render_document(
    document: &ScenarioDocument,
) -> Result<Vec<crate::EngineFile>, crate::ScenarioDiagnostic> {
    let body = render_nodes(&document.nodes, 4)?;
    let source = format!(
        "use goose::prelude::*;\n\nasync fn loom_transaction(user: &mut GooseUser) -> TransactionResult {{\n{body}    Ok(())\n}}\n\n#[tokio::main]\nasync fn main() -> Result<(), GooseError> {{\n    GooseAttack::initialize()?\n        .register_scenario(scenario!(\"Loom Scenario\").register_transaction(transaction!(loom_transaction)))\n        .execute()\n        .await?;\n    Ok(())\n}}\n"
    );
    Ok(vec![
        crate::EngineFile {
            path: "Cargo.toml".into(),
            content: MANIFEST.into(),
            role: EngineFileRole::Manifest,
        },
        crate::EngineFile {
            path: "src/main.rs".into(),
            content: source,
            role: EngineFileRole::Script,
        },
    ])
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
            if headers.as_ref().is_some_and(|headers| !headers.is_empty()) {
                return Err(error(
                    "GENERATOR_HEADERS_UNSUPPORTED",
                    "Goose request headers require native source code and cannot be emitted from a visual request yet.",
                ));
            }
            let method = method.to_ascii_lowercase();
            let url = quoted("goose", url)?;
            match (method.as_str(), body) {
                ("get", None) => Ok(format!("let _ = user.get({url}).await?;")),
                ("head", None) => Ok(format!("let _ = user.head({url}).await?;")),
                ("delete", None) => Ok(format!("let _ = user.delete({url}).await?;")),
                ("put", None) => Ok(format!(
                    "let _ = user.request(GooseRequest::builder().method(GooseMethod::Put).path({url}).build()).await?;"
                )),
                ("patch", None) => Ok(format!(
                    "let _ = user.request(GooseRequest::builder().method(GooseMethod::Patch).path({url}).build()).await?;"
                )),
                ("post", Some(body)) => Ok(format!(
                    "let _ = user.post({url}, {}).await?;",
                    quoted_owned("goose", body)?
                )),
                _ => Err(error(
                    "GENERATOR_METHOD_UNSUPPORTED",
                    format!("Goose visual generation does not yet represent '{method}' with these request fields."),
                )),
            }
        }
        ScenarioNode::Wait { seconds, .. } => Ok(format!(
            "tokio::time::sleep(std::time::Duration::from_secs_f64({seconds:?})).await;"
        )),
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
                "for _ in 0..{count} {{\n{body}{} }}",
                " ".repeat(indentation)
            ))
        }
        ScenarioNode::Native { .. } => Err(error(
            "GENERATOR_NATIVE_SOURCE_REQUIRED",
            "Native code must reference an original source file to be preserved.",
        )),
        _ => Err(error(
            "GENERATOR_NODE_INCOMPATIBLE",
            "This node cannot be represented by Goose.",
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
