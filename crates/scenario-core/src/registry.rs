use std::collections::BTreeMap;

use crate::generators::{generate_goose, generate_k6, generate_locust};
use crate::parsers::{parse_engine_config, parse_goose, parse_k6, parse_locust};
use crate::{
    ConfigParseResult, EngineAdapterMetadata, EngineBundle, EngineConfigFile, LicenseTier,
    ParseContext, ParseResult, ScenarioDiagnostic, ScenarioDocument, SourceDocument,
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
        let mut compatible_node_kinds = vec![
            "request".into(),
            "wait".into(),
            "loop".into(),
            "native".into(),
        ];
        if id == "k6" {
            compatible_node_kinds.extend(["check".into(), "group".into()]);
        }

        Self(EngineAdapterMetadata {
            id: id.into(),
            display_name: display_name.into(),
            license_tier: tier,
            source_kinds: vec![language.into()],
            config_kinds: configs.iter().map(|kind| (*kind).into()).collect(),
            compatible_node_kinds,
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
}

impl ScenarioEngineAdapter for ReservedAdapter {
    fn metadata(&self) -> EngineAdapterMetadata {
        self.0.clone()
    }

    fn parse_script(&self, source: &SourceDocument, context: &ParseContext) -> ParseResult {
        match self.0.id.as_str() {
            "locust" => parse_locust(source, context),
            "goose" => parse_goose(source, context),
            "k6" => parse_k6(source, context),
            _ => unreachable!("built-in adapter id is fixed"),
        }
    }

    fn parse_config(&self, source: &EngineConfigFile) -> ConfigParseResult {
        parse_engine_config(&self.0.id, source)
    }

    fn generate(
        &self,
        document: &ScenarioDocument,
    ) -> Result<EngineBundle, Vec<ScenarioDiagnostic>> {
        match self.0.id.as_str() {
            "locust" => generate_locust(document),
            "goose" => generate_goose(document),
            "k6" => generate_k6(document),
            _ => unreachable!("built-in adapter id is fixed"),
        }
    }

    fn validate(&self, document: &ScenarioDocument) -> Vec<ScenarioDiagnostic> {
        crate::validate_scenario_document(document)
    }
}
