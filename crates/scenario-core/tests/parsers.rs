use scenario_core::{
    parse_engine_config, parse_goose, parse_k6, parse_locust, EngineConfigFile, ParseContext,
    ScenarioNode, SourceDocument,
};

fn context() -> ParseContext {
    ParseContext {
        project_id: "project-1".into(),
        suite_id: "suite-1".into(),
        max_bytes: 2 * 1024 * 1024,
        cancel_id: "test-cancel".into(),
        cancellation: None,
    }
}

fn source(id: &str, name: &str, language: &str, content: &str) -> SourceDocument {
    SourceDocument {
        id: id.into(),
        file_name: name.into(),
        language: language.into(),
        content: content.into(),
    }
}

fn contains_request(nodes: &[ScenarioNode]) -> bool {
    nodes.iter().any(|node| match node {
        ScenarioNode::Request { .. } => true,
        ScenarioNode::Group { children, .. } | ScenarioNode::Loop { children, .. } => {
            contains_request(children)
        }
        _ => false,
    })
}

#[test]
fn locust_import_preserves_dynamic_helper_and_recognizes_static_requests() {
    let text = include_str!("fixtures/locust/dynamic_helpers.py");
    let parsed = parse_locust(
        &source("locust", "locustfile.py", "python", text),
        &context(),
    );
    assert_eq!(parsed.source.content, text);
    assert!(parsed.nodes.iter().any(|node| matches!(node, ScenarioNode::Native { reason, span, .. }
        if !reason.is_empty() && &text[span.start_offset..span.end_offset] == "def build_path(account_id: str) -> str:\n    # Dynamic helper intentionally remains an engine-native source block.\n    return f\"/accounts/{account_id}/events?cursor={next_cursor()}\"")));
    assert!(parsed
        .nodes
        .iter()
        .any(|node| matches!(node, ScenarioNode::Request { url, .. } if url == "/health")));
    assert!(parsed.support_percent < 100);
}

#[test]
fn goose_import_keeps_macro_generated_transactions_opaque() {
    let text = include_str!("fixtures/goose/macro_scenario.rs");
    let parsed = parse_goose(&source("goose", "src/main.rs", "rust", text), &context());
    assert_eq!(parsed.source.content, text);
    assert!(parsed
        .nodes
        .iter()
        .any(|node| matches!(node, ScenarioNode::Native { .. })));
}

#[test]
fn k6_typescript_import_keeps_dynamic_options_and_shows_supported_actions() {
    let text = include_str!("fixtures/k6/dynamic_scenario.ts");
    let parsed = parse_k6(&source("k6", "scenario.ts", "typescript", text), &context());
    assert_eq!(parsed.source.content, text);
    assert!(contains_request(&parsed.nodes));
    assert!(parsed
        .nodes
        .iter()
        .any(|node| matches!(node, ScenarioNode::Native { .. })));
}

#[test]
fn malformed_source_remains_visible_and_does_not_become_an_empty_flow() {
    let text = "from locust import HttpUser\nclass Broken(HttpUser)\n    def task(self)\n";
    let parsed = parse_locust(&source("bad", "locustfile.py", "python", text), &context());
    assert_eq!(parsed.source.content, text);
    assert!(!parsed.nodes.is_empty());
    assert!(parsed
        .diagnostics
        .iter()
        .any(|diagnostic| diagnostic.code == "PARSE_SYNTAX_ERROR"));
}

#[test]
fn source_above_requested_limit_is_rejected_without_losing_the_source() {
    let text = "# x\n".repeat(12);
    let mut options = context();
    options.max_bytes = 8;
    let parsed = parse_locust(&source("large", "locustfile.py", "python", &text), &options);
    assert_eq!(parsed.source.content, text);
    assert!(parsed
        .diagnostics
        .iter()
        .any(|diagnostic| diagnostic.code == "PARSE_SOURCE_TOO_LARGE"));
}

#[test]
fn locust_and_goose_configs_keep_unknown_options_and_report_precedence() {
    let locust = EngineConfigFile {
        id: "l".into(),
        file_name: "locust.conf".into(),
        format: "locust-conf".into(),
        content: "host=https://example.test\nusers=20\ncustom_extension=keep\n".into(),
    };
    let locust_result = parse_engine_config("locust", &locust);
    assert_eq!(locust_result.recognized["users"], 20);
    assert!(locust_result
        .diagnostics
        .iter()
        .any(|diagnostic| diagnostic.code == "CONFIG_UNKNOWN_KEY"));
    assert_eq!(locust_result.source.content, locust.content);

    let goose = EngineConfigFile {
        id: "g".into(),
        file_name: "loom-goose.toml".into(),
        format: "loom-goose-toml".into(),
        content: "users = 7\nhatch_rate = 2\n".into(),
    };
    let goose_result = parse_engine_config("goose", &goose);
    assert_eq!(goose_result.recognized["users"], 7);
    assert!(goose_result
        .diagnostics
        .iter()
        .any(|diagnostic| diagnostic.code == "GOOSE_PROFILE_NOT_NATIVE_CONFIG"));
}

#[test]
fn invalid_or_duplicate_config_keys_return_diagnostics_not_panics() {
    let config = EngineConfigFile {
        id: "k".into(),
        file_name: "config.json".into(),
        format: "json".into(),
        content: r#"{"vus":0,"vus":3,"mystery":true}"#.into(),
    };
    let parsed = parse_engine_config("k6", &config);
    assert!(parsed.recognized.is_null());
    assert!(parsed
        .diagnostics
        .iter()
        .any(|diagnostic| diagnostic.severity == scenario_core::DiagnosticSeverity::Error));
}

#[test]
fn locust_toml_profile_reports_known_values_and_keeps_unknown_options_in_source() {
    let config = EngineConfigFile {
        id: "locust-toml".into(),
        file_name: "pyproject.toml".into(),
        format: "toml".into(),
        content: "[tool.locust]\nusers = 4\nspawn_rate = 2\nthird_party_option = \"keep\"\n".into(),
    };
    let parsed = parse_engine_config("locust", &config);
    assert_eq!(parsed.recognized["users"], 4);
    assert_eq!(parsed.recognized["spawn-rate"], 2);
    assert!(parsed
        .diagnostics
        .iter()
        .any(|diagnostic| diagnostic.code == "CONFIG_UNKNOWN_KEY"));
    assert_eq!(parsed.source.content, config.content);
}

#[test]
fn duplicate_engine_options_are_reported_instead_of_being_silently_overwritten() {
    let locust = EngineConfigFile {
        id: "dup".into(),
        file_name: "locust.conf".into(),
        format: "locust-conf".into(),
        content: "users=2\nusers=3\n".into(),
    };
    let locust_parsed = parse_engine_config("locust", &locust);
    assert!(locust_parsed
        .diagnostics
        .iter()
        .any(|diagnostic| diagnostic.code == "CONFIG_PARSE_ERROR"));

    let goose = EngineConfigFile {
        id: "dup-goose".into(),
        file_name: "loom-goose.toml".into(),
        format: "loom-goose-toml".into(),
        content: "users=2\nusers=3\n".into(),
    };
    let goose_parsed = parse_engine_config("goose", &goose);
    assert!(goose_parsed
        .diagnostics
        .iter()
        .any(|diagnostic| diagnostic.code == "CONFIG_PARSE_ERROR"));
}

#[test]
fn k6_json_config_reports_unknown_keys_and_cli_precedence() {
    let config = EngineConfigFile {
        id: "k6".into(),
        file_name: "config.json".into(),
        format: "json".into(),
        content: r#"{"vus":5,"mystery":true}"#.into(),
    };
    let parsed = parse_engine_config("k6", &config);
    assert_eq!(parsed.recognized["vus"], 5);
    assert!(parsed
        .diagnostics
        .iter()
        .any(|diagnostic| diagnostic.code == "CONFIG_UNKNOWN_KEY"));
    assert!(parsed
        .diagnostics
        .iter()
        .any(|diagnostic| diagnostic.code == "ENGINE_OPTION_PRECEDENCE"));
}

#[test]
fn cancellation_and_excessive_nesting_return_visible_diagnostics() {
    let mut cancelled = context();
    cancelled.cancellation = Some(std::sync::Arc::new(std::sync::atomic::AtomicBool::new(
        true,
    )));
    let parsed = parse_k6(
        &source("cancel", "test.js", "javascript", "http.get('/health')"),
        &cancelled,
    );
    assert!(parsed
        .diagnostics
        .iter()
        .any(|diagnostic| diagnostic.code == "PARSE_CANCELLED"));
    assert!(!parsed.nodes.is_empty());

    let deeply_nested = format!("let result = {}1{};", "(".repeat(80), ")".repeat(80));
    let parsed = parse_k6(
        &source("nested", "test.js", "javascript", &deeply_nested),
        &context(),
    );
    assert!(parsed
        .diagnostics
        .iter()
        .any(|diagnostic| diagnostic.code == "PARSE_NESTING_LIMIT"));
    assert!(!parsed.nodes.is_empty());
}

#[test]
fn oversized_engine_configs_are_not_parsed_and_remain_verbatim() {
    let config = EngineConfigFile {
        id: "large-k6-config".into(),
        file_name: "config.json".into(),
        format: "json".into(),
        content: format!("{{\"extension\":\"{}\"}}", "x".repeat(2 * 1024 * 1024)),
    };

    let parsed = parse_engine_config("k6", &config);

    assert_eq!(parsed.source.content, config.content);
    assert!(parsed
        .diagnostics
        .iter()
        .any(|diagnostic| { diagnostic.code == "CONFIG_SOURCE_TOO_LARGE" }));
}

#[test]
fn a_ten_thousand_line_script_is_bounded_and_kept_verbatim() {
    let text = format!("{}\nclass User(HttpUser):\n    @task\n    def get_home(self):\n        self.client.get(\"/\")\n", "# fixture\n".repeat(10_000));
    let parsed = parse_locust(
        &source("large", "locustfile.py", "python", &text),
        &context(),
    );
    assert_eq!(parsed.source.content, text);
    assert!(contains_request(&parsed.nodes));
}

#[test]
fn every_engine_parser_accepts_empty_source_with_a_zero_support_report() {
    let empty = source("empty", "empty.py", "python", "");
    assert_eq!(parse_locust(&empty, &context()).support_percent, 0);
    assert_eq!(parse_goose(&empty, &context()).source.content, "");
    assert_eq!(parse_k6(&empty, &context()).source.content, "");
}
