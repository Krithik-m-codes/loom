use std::collections::BTreeMap;

use crate::{
    ConfigParseResult, DiagnosticSeverity, EngineAdapterMetadata, EngineBundle, EngineConfigFile,
    LicenseTier, ParseContext, ParseResult, ScenarioDiagnostic, ScenarioDocument, ScenarioNode,
    SourceDocument,
};

pub trait ScenarioEngineAdapter: Send + Sync {
    fn metadata(&self) -> EngineAdapterMetadata;
    fn parse_script(&self, source: &SourceDocument, context: &ParseContext) -> ParseResult;
    fn parse_config(&self, source: &EngineConfigFile) -> ConfigParseResult;
    fn generate(
        &self,
        document: &ScenarioDocument,
    ) -> Result<EngineBundle, Vec<ScenarioDiagnostic>>;
    fn validate(&self, document: &ScenarioDocument) -> Vec<ScenarioDiagnostic>;
}

pub struct ScenarioRegistry {
    adapters: BTreeMap<String, Box<dyn ScenarioEngineAdapter>>,
}

impl ScenarioRegistry {
    pub fn new() -> Self {
        Self {
            adapters: BTreeMap::new(),
        }
    }

    pub fn builtins() -> Self {
        let mut registry = Self::new();
        registry
            .register(Box::new(ReservedAdapter::locust()))
            .expect("unique built-in id");
        registry
            .register(Box::new(ReservedAdapter::goose()))
            .expect("unique built-in id");
        registry
            .register(Box::new(ReservedAdapter::k6()))
            .expect("unique built-in id");
        registry
    }

    pub fn register(&mut self, adapter: Box<dyn ScenarioEngineAdapter>) -> Result<(), String> {
        let id = adapter.metadata().id;
        if self.adapters.contains_key(&id) {
            return Err(format!(
                "Scenario engine adapter is already registered: {id}"
            ));
        }
        self.adapters.insert(id, adapter);
        Ok(())
    }

    pub fn adapter(&self, id: &str) -> Option<&dyn ScenarioEngineAdapter> {
        self.adapters.get(id).map(Box::as_ref)
    }

    pub fn metadata(&self) -> Vec<EngineAdapterMetadata> {
        self.adapters
            .values()
            .map(|adapter| adapter.metadata())
            .collect()
    }
}

impl Default for ScenarioRegistry {
    fn default() -> Self {
        Self::new()
    }
}

struct ReservedAdapter(EngineAdapterMetadata);

impl ReservedAdapter {
    fn new(
        id: &str,
        display_name: &str,
        language: &str,
        configs: &[&str],
        tier: LicenseTier,
    ) -> Self {
        Self(EngineAdapterMetadata {
            id: id.into(),
            display_name: display_name.into(),
            license_tier: tier,
            source_kinds: vec![language.into()],
            config_kinds: configs.iter().map(|kind| (*kind).into()).collect(),
            compatible_node_kinds: vec![
                "request".into(),
                "wait".into(),
                "check".into(),
                "group".into(),
                "loop".into(),
                "native".into(),
            ],
        })
    }

    fn locust() -> Self {
        Self::new(
            "locust",
            "Locust",
            "python",
            &["locust-conf", "toml"],
            LicenseTier::Core,
        )
    }
    fn goose() -> Self {
        Self::new(
            "goose",
            "Goose",
            "rust",
            &["loom-goose-toml"],
            LicenseTier::Core,
        )
    }
    fn k6() -> Self {
        Self::new("k6", "k6", "javascript", &["json"], LicenseTier::Plugin)
    }

    fn unavailable(&self) -> ScenarioDiagnostic {
        ScenarioDiagnostic {
            code: "ADAPTER_NOT_READY".into(),
            severity: DiagnosticSeverity::Error,
            message: format!(
                "{} source parsing is not available yet.",
                self.0.display_name
            ),
            span: None,
        }
    }
}

impl ScenarioEngineAdapter for ReservedAdapter {
    fn metadata(&self) -> EngineAdapterMetadata {
        self.0.clone()
    }

    fn parse_script(&self, source: &SourceDocument, _: &ParseContext) -> ParseResult {
        let source_len = source.content.len();
        ParseResult {
            source: source.clone(),
            nodes: if source_len == 0 {
                vec![]
            } else {
                vec![ScenarioNode::Native {
                    id: format!("{}-native", source.id),
                    engine_ids: vec![self.0.id.clone()],
                    span: crate::SourceSpan {
                        file_id: source.id.clone(),
                        start_offset: 0,
                        end_offset: source_len,
                    },
                    reason: "This engine parser is not available yet; source is kept intact."
                        .into(),
                }]
            },
            diagnostics: vec![self.unavailable()],
            covered_ranges: vec![],
            support_percent: 0,
        }
    }

    fn parse_config(&self, source: &EngineConfigFile) -> ConfigParseResult {
        ConfigParseResult {
            source: source.clone(),
            recognized: serde_json::Value::Null,
            diagnostics: vec![self.unavailable()],
        }
    }

    fn generate(&self, _: &ScenarioDocument) -> Result<EngineBundle, Vec<ScenarioDiagnostic>> {
        Err(vec![self.unavailable()])
    }

    fn validate(&self, _: &ScenarioDocument) -> Vec<ScenarioDiagnostic> {
        vec![]
    }
}
