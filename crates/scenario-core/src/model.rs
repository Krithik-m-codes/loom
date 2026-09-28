use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceSpan {
    pub file_id: String,
    pub start_offset: usize,
    pub end_offset: usize,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceDocument {
    pub id: String,
    pub file_name: String,
    pub language: String,
    pub content: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineConfigFile {
    pub id: String,
    pub file_name: String,
    pub format: String,
    pub content: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScenarioDiagnostic {
    pub code: String,
    pub severity: DiagnosticSeverity,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub span: Option<SourceSpan>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum DiagnosticSeverity {
    Error,
    Warning,
    Info,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParseContext {
    pub project_id: String,
    pub suite_id: String,
    pub max_bytes: usize,
    pub cancel_id: String,
    #[serde(skip)]
    pub cancellation: Option<std::sync::Arc<std::sync::atomic::AtomicBool>>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ScenarioNode {
    Request {
        id: String,
        #[serde(rename = "engineIds")]
        engine_ids: Vec<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        span: Option<SourceSpan>,
        method: String,
        url: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        headers: Option<std::collections::BTreeMap<String, String>>,
        #[serde(skip_serializing_if = "Option::is_none")]
        body: Option<String>,
    },
    Wait {
        id: String,
        #[serde(rename = "engineIds")]
        engine_ids: Vec<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        span: Option<SourceSpan>,
        seconds: f64,
    },
    Check {
        id: String,
        #[serde(rename = "engineIds")]
        engine_ids: Vec<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        span: Option<SourceSpan>,
        expression: String,
    },
    Group {
        id: String,
        #[serde(rename = "engineIds")]
        engine_ids: Vec<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        span: Option<SourceSpan>,
        label: String,
        children: Vec<ScenarioNode>,
    },
    Loop {
        id: String,
        #[serde(rename = "engineIds")]
        engine_ids: Vec<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        span: Option<SourceSpan>,
        label: String,
        children: Vec<ScenarioNode>,
        #[serde(skip_serializing_if = "Option::is_none")]
        iterations: Option<u64>,
    },
    Native {
        id: String,
        #[serde(rename = "engineIds")]
        engine_ids: Vec<String>,
        span: SourceSpan,
        reason: String,
    },
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScenarioDocument {
    pub schema_version: u32,
    pub engine_id: String,
    pub project_id: String,
    pub suite_id: String,
    pub sources: Vec<SourceDocument>,
    pub nodes: Vec<ScenarioNode>,
    pub config_files: Vec<EngineConfigFile>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub legacy_payload: Option<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParseResult {
    pub source: SourceDocument,
    pub nodes: Vec<ScenarioNode>,
    pub diagnostics: Vec<ScenarioDiagnostic>,
    pub covered_ranges: Vec<SourceSpan>,
    pub support_percent: u8,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigParseResult {
    pub source: EngineConfigFile,
    pub recognized: serde_json::Value,
    pub diagnostics: Vec<ScenarioDiagnostic>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineBundle {
    pub engine_id: String,
    pub files: Vec<EngineFile>,
    pub diagnostics: Vec<ScenarioDiagnostic>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineFile {
    pub path: String,
    pub content: String,
    pub role: EngineFileRole,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum EngineFileRole {
    Script,
    Config,
    Manifest,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineAdapterMetadata {
    pub id: String,
    pub display_name: String,
    pub license_tier: LicenseTier,
    pub source_kinds: Vec<String>,
    pub config_kinds: Vec<String>,
    pub compatible_node_kinds: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum LicenseTier {
    Core,
    Plugin,
}
