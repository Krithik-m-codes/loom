use crate::{ScenarioDocument, ScenarioNode};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ScenarioError {
    #[error("invalid scenario JSON: {0}")]
    InvalidJson(#[from] serde_json::Error),
    #[error("unsupported scenario schema version {0}")]
    UnsupportedVersion(u32),
}

pub fn migrate_scenario_document(raw: &str) -> Result<ScenarioDocument, ScenarioError> {
    let value: serde_json::Value = serde_json::from_str(raw)?;
    let version = value
        .get("schemaVersion")
        .and_then(serde_json::Value::as_u64)
        .unwrap_or(1) as u32;
    if version != 1 {
        return Err(ScenarioError::UnsupportedVersion(version));
    }
    Ok(serde_json::from_value(value)?)
}

pub fn migrate_visual_nodes(raw: &str) -> Result<ScenarioDocument, ScenarioError> {
    let legacy: Vec<serde_json::Value> = serde_json::from_str(raw)?;
    let nodes: Vec<ScenarioNode> = legacy
        .iter()
        .enumerate()
        .filter_map(|(index, node)| {
            let id = node
                .get("id")
                .and_then(serde_json::Value::as_str)
                .map(ToOwned::to_owned)
                .unwrap_or_else(|| format!("migrated-{index}"));
            let node_type = node.get("type").and_then(serde_json::Value::as_str)?;
            if matches!(node_type, "http" | "request") {
                let method = node
                    .get("method")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("GET");
                let url = node
                    .get("url")
                    .or_else(|| node.get("path"))
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("/");
                Some(ScenarioNode::Request {
                    id,
                    engine_ids: vec!["locust".into(), "goose".into(), "k6".into()],
                    span: None,
                    method: method.into(),
                    url: url.into(),
                    headers: None,
                    body: None,
                })
            } else {
                None
            }
        })
        .collect();
    Ok(ScenarioDocument {
        schema_version: 1,
        engine_id: "locust".into(),
        project_id: String::new(),
        suite_id: String::new(),
        sources: Vec::new(),
        nodes,
        config_files: Vec::new(),
        legacy_payload: Some(raw.to_owned()),
    })
}
