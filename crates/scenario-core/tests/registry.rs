use scenario_core::{
    ConfigParseResult, EngineAdapterMetadata, EngineBundle, LicenseTier, ParseContext, ParseResult,
    ScenarioDiagnostic, ScenarioDocument, ScenarioEngineAdapter, ScenarioRegistry, SourceDocument,
};

struct ExampleAdapter;

impl ScenarioEngineAdapter for ExampleAdapter {
    fn metadata(&self) -> EngineAdapterMetadata {
        EngineAdapterMetadata {
            id: "example".into(),
            display_name: "Example".into(),
            license_tier: LicenseTier::Core,
            source_kinds: vec!["example".into()],
            config_kinds: vec![],
            compatible_node_kinds: vec!["request".into()],
        }
    }

    fn parse_script(&self, source: &SourceDocument, _: &ParseContext) -> ParseResult {
        ParseResult {
            source: source.clone(),
            nodes: vec![],
            diagnostics: vec![],
            covered_ranges: vec![],
            support_percent: 0,
        }
    }

    fn parse_config(&self, source: &scenario_core::EngineConfigFile) -> ConfigParseResult {
        ConfigParseResult {
            source: source.clone(),
            recognized: serde_json::Value::Null,
            diagnostics: vec![],
        }
    }

    fn generate(
        &self,
        document: &ScenarioDocument,
    ) -> Result<EngineBundle, Vec<ScenarioDiagnostic>> {
        Ok(EngineBundle {
            engine_id: document.engine_id.clone(),
            files: vec![],
            diagnostics: vec![],
        })
    }

    fn validate(&self, _: &ScenarioDocument) -> Vec<ScenarioDiagnostic> {
        vec![]
    }
}

#[test]
fn builtins_are_registered_and_new_adapters_need_no_canvas_registration() {
    let mut registry = ScenarioRegistry::builtins();
    let mut ids: Vec<_> = registry
        .metadata()
        .into_iter()
        .map(|metadata| metadata.id)
        .collect();
    ids.sort();
    assert_eq!(ids, ["goose", "k6", "locust"]);

    registry.register(Box::new(ExampleAdapter)).unwrap();
    assert_eq!(
        registry.adapter("example").unwrap().metadata().display_name,
        "Example"
    );
}
