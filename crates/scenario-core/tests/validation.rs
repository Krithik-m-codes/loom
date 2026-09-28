use scenario_core::{validate_scenario_document, ScenarioDocument, ScenarioNode};

#[test]
fn invalid_wait_duration_is_reported_instead_of_entering_the_scenario_graph() {
    let document = ScenarioDocument {
        schema_version: 1,
        engine_id: "locust".into(),
        project_id: "project-1".into(),
        suite_id: "suite-1".into(),
        sources: vec![],
        nodes: vec![ScenarioNode::Wait {
            id: "wait-1".into(),
            engine_ids: vec!["locust".into()],
            span: None,
            seconds: -0.5,
        }],
        config_files: vec![],
        legacy_payload: None,
    };

    let diagnostics = validate_scenario_document(&document);
    assert!(diagnostics
        .iter()
        .any(|diagnostic| diagnostic.code == "SCENARIO_WAIT_INVALID"));
}
