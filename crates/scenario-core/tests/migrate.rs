use scenario_core::{migrate_visual_nodes, ScenarioNode};

#[test]
fn legacy_nodes_migrate_without_losing_unknown_json() {
    let raw = r#"[{"id":"old-1","type":"http","path":"/x","vendor":"keep-me"}]"#;
    let migrated = migrate_visual_nodes(raw).unwrap();
    assert_eq!(migrated.schema_version, 1);
    assert_eq!(migrated.legacy_payload.as_deref(), Some(raw));
    assert!(matches!(
        migrated.nodes.first().unwrap(),
        ScenarioNode::Request { .. }
    ));
}
