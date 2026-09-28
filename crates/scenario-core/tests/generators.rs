use scenario_core::{
    DiagnosticSeverity, EngineConfigFile, EngineFileRole, ScenarioDocument, ScenarioNode,
    ScenarioRegistry, SourceDocument, SourceSpan,
};

fn request(engine: &str) -> ScenarioNode {
    ScenarioNode::Request {
        id: "request-1".into(),
        engine_ids: vec![engine.into()],
        span: None,
        method: "GET".into(),
        url: "/health".into(),
        headers: None,
        body: None,
    }
}

fn document(engine: &str) -> ScenarioDocument {
    ScenarioDocument {
        schema_version: 1,
        engine_id: engine.into(),
        project_id: "project-1".into(),
        suite_id: "suite-1".into(),
        sources: vec![],
        nodes: vec![request(engine)],
        config_files: vec![],
        legacy_payload: None,
    }
}

fn generate(engine: &str, document: &ScenarioDocument) -> scenario_core::EngineBundle {
    ScenarioRegistry::builtins()
        .adapter(engine)
        .expect("built-in adapter")
        .generate(document)
        .expect("valid graph should generate")
}

fn file<'a>(bundle: &'a scenario_core::EngineBundle, path: &str) -> &'a str {
    bundle
        .files
        .iter()
        .find(|file| file.path == path)
        .map(|file| file.content.as_str())
        .expect("expected generated file")
}

#[test]
fn locust_generation_matches_the_checked_golden_script() {
    let bundle = generate("locust", &document("locust"));

    assert_eq!(bundle.engine_id, "locust");
    assert_eq!(
        file(&bundle, "locustfile.py"),
        "from locust import HttpUser, task\n\nclass LoomUser(HttpUser):\n    @task\n    def run_scenario(self):\n        self.client.get(\"/health\")\n"
    );
    assert_eq!(bundle.files[0].role, EngineFileRole::Script);
    let mut parser = tree_sitter::Parser::new();
    parser
        .set_language(&tree_sitter_python::LANGUAGE.into())
        .unwrap();
    assert!(!parser
        .parse(file(&bundle, "locustfile.py"), None)
        .unwrap()
        .root_node()
        .has_error());
}

#[test]
fn empty_locust_scenario_still_generates_valid_python() {
    let mut document = document("locust");
    document.nodes.clear();
    let bundle = generate("locust", &document);
    let source = file(&bundle, "locustfile.py");
    assert!(source.contains("def run_scenario(self):\n        pass\n"));
    let mut parser = tree_sitter::Parser::new();
    parser
        .set_language(&tree_sitter_python::LANGUAGE.into())
        .unwrap();
    assert!(!parser.parse(source, None).unwrap().root_node().has_error());
}

#[test]
fn goose_generation_matches_a_cargo_runnable_golden_project() {
    let bundle = generate("goose", &document("goose"));

    assert_eq!(
        file(&bundle, "Cargo.toml"),
        "[package]\nname = \"loom_scenario\"\nversion = \"0.1.0\"\nedition = \"2021\"\n\n[dependencies]\ngoose = \"=0.18.1\"\ntokio = { version = \"1\", features = [\"macros\", \"rt-multi-thread\"] }\n"
    );
    assert!(file(&bundle, "src/main.rs").contains("user.get(\"/health\").await?;"));
    assert_eq!(bundle.files[0].role, EngineFileRole::Manifest);
    let _: toml::Value = toml::from_str(file(&bundle, "Cargo.toml")).unwrap();
    let mut parser = tree_sitter::Parser::new();
    parser
        .set_language(&tree_sitter_rust::LANGUAGE.into())
        .unwrap();
    assert!(!parser
        .parse(file(&bundle, "src/main.rs"), None)
        .unwrap()
        .root_node()
        .has_error());
}

#[test]
fn goose_emits_put_and_patch_with_the_documented_request_builder() {
    for (method, goose_method) in [("PUT", "GooseMethod::Put"), ("PATCH", "GooseMethod::Patch")] {
        let mut document = document("goose");
        document.nodes[0] = ScenarioNode::Request {
            id: "request-1".into(),
            engine_ids: vec!["goose".into()],
            span: None,
            method: method.into(),
            url: "/health".into(),
            headers: None,
            body: None,
        };
        let bundle = generate("goose", &document);
        let source = file(&bundle, "src/main.rs");
        assert!(source.contains(goose_method));
        assert!(source.contains(".path(\"/health\").build()).await?;"));
        let mut parser = tree_sitter::Parser::new();
        parser
            .set_language(&tree_sitter_rust::LANGUAGE.into())
            .unwrap();
        assert!(!parser.parse(source, None).unwrap().root_node().has_error());
    }
}

#[test]
fn goose_generation_uses_valid_rust_escapes_for_control_characters() {
    let mut document = document("goose");
    document.nodes[0] = ScenarioNode::Request {
        id: "request-1".into(),
        engine_ids: vec!["goose".into()],
        span: None,
        method: "POST".into(),
        url: "/nul\0path".into(),
        headers: None,
        body: Some("line1\nline2".into()),
    };
    let bundle = generate("goose", &document);
    let source = file(&bundle, "src/main.rs");
    assert!(source.contains(r#"user.post("/nul\0path", "line1\nline2").await?;"#));
    let mut parser = tree_sitter::Parser::new();
    parser
        .set_language(&tree_sitter_rust::LANGUAGE.into())
        .unwrap();
    assert!(!parser.parse(source, None).unwrap().root_node().has_error());
}

#[test]
fn k6_generation_matches_the_checked_golden_script() {
    let bundle = generate("k6", &document("k6"));

    assert_eq!(
        file(&bundle, "scenario.js"),
        "import http from 'k6/http';\nimport { check, group, sleep } from 'k6';\n\nexport default function () {\n  http.get(\"/health\");\n}\n"
    );
    assert_eq!(bundle.files[0].role, EngineFileRole::Script);
    let mut parser = tree_sitter::Parser::new();
    parser
        .set_language(&tree_sitter_javascript::LANGUAGE.into())
        .unwrap();
    assert!(!parser
        .parse(file(&bundle, "scenario.js"), None)
        .unwrap()
        .root_node()
        .has_error());
}

#[test]
fn untouched_native_source_is_emitted_byte_for_byte_for_all_engines() {
    for (engine, name, language, contents) in [
        (
            "locust",
            "locustfile.py",
            "python",
            "def helper():\n    return \"/health\"\n",
        ),
        (
            "goose",
            "src/main.rs",
            "rust",
            "async fn custom(user: &mut GooseUser) { /* keep exact */ }\n",
        ),
        (
            "k6",
            "scenario.js",
            "javascript",
            "export default function () {\n  customHelper();\n}\n",
        ),
    ] {
        let mut document = document(engine);
        document.sources.push(SourceDocument {
            id: "source-1".into(),
            file_name: name.into(),
            language: language.into(),
            content: contents.into(),
        });
        document.nodes = vec![ScenarioNode::Native {
            id: "native-1".into(),
            engine_ids: vec![engine.into()],
            span: SourceSpan {
                file_id: "source-1".into(),
                start_offset: 0,
                end_offset: contents.len(),
            },
            reason: "Dynamic source is preserved.".into(),
        }];

        let bundle = generate(engine, &document);
        assert_eq!(file(&bundle, name), contents, "{engine} source changed");
    }
}

#[test]
fn invalid_graphs_and_unsafe_config_paths_are_rejected_not_dropped() {
    let mut incompatible = document("k6");
    incompatible.nodes[0] = request("locust");
    let diagnostics = ScenarioRegistry::builtins()
        .adapter("k6")
        .unwrap()
        .generate(&incompatible)
        .unwrap_err();
    assert!(diagnostics.iter().any(|diagnostic| {
        diagnostic.severity == DiagnosticSeverity::Error
            && diagnostic.code == "GENERATOR_NODE_INCOMPATIBLE"
    }));

    let mut unsafe_config = document("locust");
    unsafe_config.config_files.push(EngineConfigFile {
        id: "cfg".into(),
        file_name: "../outside.conf".into(),
        format: "locust-conf".into(),
        content: "users=5\n".into(),
    });
    let diagnostics = ScenarioRegistry::builtins()
        .adapter("locust")
        .unwrap()
        .generate(&unsafe_config)
        .unwrap_err();
    assert!(diagnostics.iter().any(|diagnostic| {
        diagnostic.severity == DiagnosticSeverity::Error
            && diagnostic.code == "GENERATOR_PATH_UNSAFE"
    }));
}

#[test]
fn excessively_nested_graphs_are_rejected_before_recursive_processing() {
    let mut document = document("k6");
    let mut child = request("k6");
    for index in 0..80 {
        child = ScenarioNode::Group {
            id: format!("group-{index}"),
            engine_ids: vec!["k6".into()],
            span: None,
            label: format!("Group {index}"),
            children: vec![child],
        };
    }
    document.nodes = vec![child];
    let diagnostics = ScenarioRegistry::builtins()
        .adapter("k6")
        .unwrap()
        .generate(&document)
        .unwrap_err();
    assert!(diagnostics
        .iter()
        .any(|diagnostic| diagnostic.code == "GENERATOR_NESTING_LIMIT"));
}

#[test]
fn output_paths_must_be_unique_case_insensitively_for_cross_platform_projects() {
    let mut document = document("locust");
    document.config_files.push(EngineConfigFile {
        id: "config-1".into(),
        file_name: "LOCUSTFILE.PY".into(),
        format: "locust-conf".into(),
        content: "users=8\n".into(),
    });
    let diagnostics = ScenarioRegistry::builtins()
        .adapter("locust")
        .unwrap()
        .generate(&document)
        .unwrap_err();
    assert!(diagnostics
        .iter()
        .any(|diagnostic| diagnostic.code == "GENERATOR_PATH_DUPLICATE"));
}

#[test]
fn source_artifacts_cannot_replace_engine_manifests_or_use_wrong_extensions() {
    for (engine, file_name, language) in [
        ("goose", "Cargo.toml", "toml"),
        ("locust", "locustfile.js", "python"),
        ("k6", "scenario.py", "javascript"),
    ] {
        let mut document = document(engine);
        document.sources.push(SourceDocument {
            id: "source-1".into(),
            file_name: file_name.into(),
            language: language.into(),
            content: "// user source".into(),
        });
        document.nodes.clear();
        let diagnostics = ScenarioRegistry::builtins()
            .adapter(engine)
            .unwrap()
            .generate(&document)
            .unwrap_err();
        assert!(diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == "GENERATOR_SOURCE_KIND_INVALID"));
    }
}

#[test]
fn generated_literals_escape_injection_text_and_preserve_source_spans() {
    let mut document = document("k6");
    document.nodes[0] = ScenarioNode::Request {
        id: "request-1".into(),
        engine_ids: vec!["k6".into()],
        span: None,
        method: "GET".into(),
        url: "/quoted/\"\nthrow new Error('injected')".into(),
        headers: Some([("x-safe".into(), "line1 \"quoted\"".into())].into()),
        body: Some(r#"body " value"#.into()),
    };
    let bundle = generate("k6", &document);
    let script = file(&bundle, "scenario.js");
    assert!(script.contains("\\nthrow new Error"));
    assert!(!script.contains("\nthrow new Error('injected')"));
    assert!(script.contains(r#"line1 \"quoted\""#));
    assert!(script.contains(r#"body \" value"#));
}

#[test]
fn quotes_and_newlines_are_escaped_in_each_engine_native_literal() {
    for (engine, path) in [
        ("locust", "locustfile.py"),
        ("goose", "src/main.rs"),
        ("k6", "scenario.js"),
    ] {
        let mut document = document(engine);
        document.nodes[0] = ScenarioNode::Request {
            id: "request-1".into(),
            engine_ids: vec![engine.into()],
            span: None,
            method: "POST".into(),
            url: "/quoted/\"\nthrow new Error('injected')".into(),
            headers: None,
            body: Some("body \" quoted".into()),
        };
        let bundle = generate(engine, &document);
        let script = file(&bundle, path);
        assert!(
            script.contains(r#"\nthrow new Error('injected')"#),
            "{engine}"
        );
        assert!(
            !script.contains("\nthrow new Error('injected')"),
            "{engine}"
        );
        assert!(script.contains(r#"body \" quoted"#), "{engine}");
    }
}

#[test]
fn k6_group_labels_escape_quotes_and_newlines() {
    let mut document = document("k6");
    document.nodes[0] = ScenarioNode::Group {
        id: "group-1".into(),
        engine_ids: vec!["k6".into()],
        span: None,
        label: "user \"journey\"\nthrow new Error('injected')".into(),
        children: vec![request("k6")],
    };
    let bundle = generate("k6", &document);
    let script = file(&bundle, "scenario.js");
    assert!(script.contains(r#"user \"journey\"\nthrow new Error('injected')"#));
    assert!(!script.contains("\nthrow new Error('injected')"));
}

#[test]
fn adding_a_step_inside_a_source_backed_k6_group_regenerates_only_that_group() {
    let contents =
        "export default function () { group('old', () => { http.get('/old'); }); helper(); }\n";
    let start = contents.find("group('old'").unwrap();
    let end = contents.find(" }); helper()").unwrap() + 2;
    let mut document = document("k6");
    document.sources.push(SourceDocument {
        id: "source-1".into(),
        file_name: "scenario.js".into(),
        language: "javascript".into(),
        content: contents.into(),
    });
    document.nodes = vec![ScenarioNode::Group {
        id: "group-1".into(),
        engine_ids: vec!["k6".into()],
        span: Some(SourceSpan {
            file_id: "source-1".into(),
            start_offset: start,
            end_offset: end,
        }),
        label: "new".into(),
        children: vec![request("k6")],
    }];

    let bundle = generate("k6", &document);
    let script = file(&bundle, "scenario.js");
    assert!(script.contains("group(\"new\", () => {"));
    assert!(script.contains("http.get(\"/health\");"));
    assert!(script.ends_with(" helper(); }\n"));
    assert!(!script.contains("group('old'"));
}

#[test]
fn edits_patch_only_the_ast_byte_span_and_keep_surrounding_source_intact() {
    let contents = "// café should retain its UTF-8 bytes\nexport default function () { http.get('/old'); helper(); }\n";
    let start = contents.find("http.get('/old')").unwrap();
    let end = start + "http.get('/old')".len();
    let mut document = document("k6");
    document.sources.push(SourceDocument {
        id: "source-1".into(),
        file_name: "scenario.js".into(),
        language: "javascript".into(),
        content: contents.into(),
    });
    document.nodes[0] = ScenarioNode::Request {
        id: "request-1".into(),
        engine_ids: vec!["k6".into()],
        span: Some(SourceSpan {
            file_id: "source-1".into(),
            start_offset: start,
            end_offset: end,
        }),
        method: "POST".into(),
        url: "/new".into(),
        headers: None,
        body: Some("safe".into()),
    };

    let bundle = generate("k6", &document);
    let script = file(&bundle, "scenario.js");
    assert!(script.starts_with("// café should retain its UTF-8 bytes\n"));
    assert!(script.contains("http.post(\"/new\", \"safe\");"));
    assert!(script.ends_with(" helper(); }\n"));
    assert!(!script.contains("/old"));
}

#[test]
fn secret_references_remain_environment_lookups_not_secret_literals() {
    let mut document = document("k6");
    document.nodes[0] = ScenarioNode::Request {
        id: "request-1".into(),
        engine_ids: vec!["k6".into()],
        span: None,
        method: "GET".into(),
        url: "/profile".into(),
        headers: Some([("Authorization".into(), "{{loom_secret:API_TOKEN}}".into())].into()),
        body: None,
    };
    let bundle = generate("k6", &document);
    let script = file(&bundle, "scenario.js");
    assert!(script.contains("__ENV.API_TOKEN"));
    assert!(!script.contains("{{loom_secret:API_TOKEN}}"));
}

#[test]
fn secret_references_generate_valid_language_specific_expressions() {
    for (engine, path, expected) in [
        (
            "locust",
            "locustfile.py",
            "__import__('os').environ[\"API_TOKEN\"]",
        ),
        (
            "goose",
            "src/main.rs",
            "std::env::var(\"API_TOKEN\").expect(\"Set API_TOKEN\").as_str()",
        ),
        ("k6", "scenario.js", "__ENV.API_TOKEN"),
    ] {
        let mut document = document(engine);
        document.nodes[0] = ScenarioNode::Request {
            id: "request-1".into(),
            engine_ids: vec![engine.into()],
            span: None,
            method: "GET".into(),
            url: "{{loom_secret:API_TOKEN}}".into(),
            headers: None,
            body: None,
        };
        let bundle = generate(engine, &document);
        assert!(file(&bundle, path).contains(expected), "{engine}");
        assert!(!file(&bundle, path).contains("{{loom_secret:API_TOKEN}}"));
    }
}

#[test]
fn goose_post_secret_body_uses_an_owned_value_for_reqwest() {
    let mut document = document("goose");
    document.nodes[0] = ScenarioNode::Request {
        id: "request-1".into(),
        engine_ids: vec!["goose".into()],
        span: None,
        method: "POST".into(),
        url: "/login".into(),
        headers: None,
        body: Some("{{loom_secret:REQUEST_BODY}}".into()),
    };

    let bundle = generate("goose", &document);
    let source = file(&bundle, "src/main.rs");
    assert!(source.contains(
        "user.post(\"/login\", std::env::var(\"REQUEST_BODY\").expect(\"Set REQUEST_BODY\"))"
    ));
    assert!(!source.contains("REQUEST_BODY\").expect(\"Set REQUEST_BODY\").as_str()"));
}

#[test]
fn header_line_breaks_and_malformed_secret_references_fail_closed() {
    let mut document = document("k6");
    document.nodes[0] = ScenarioNode::Request {
        id: "request-1".into(),
        engine_ids: vec!["k6".into()],
        span: None,
        method: "GET".into(),
        url: "/profile".into(),
        headers: Some([("Authorization".into(), "line1\r\nX-Injected: yes".into())].into()),
        body: None,
    };
    let diagnostics = ScenarioRegistry::builtins()
        .adapter("k6")
        .unwrap()
        .generate(&document)
        .unwrap_err();
    assert!(diagnostics
        .iter()
        .any(|diagnostic| diagnostic.code == "GENERATOR_HEADER_INVALID"));

    if let ScenarioNode::Request { headers, .. } = &mut document.nodes[0] {
        headers
            .as_mut()
            .unwrap()
            .insert("Authorization".into(), "{{loom_secret:API-TOKEN}}".into());
    }
    let diagnostics = ScenarioRegistry::builtins()
        .adapter("k6")
        .unwrap()
        .generate(&document)
        .unwrap_err();
    assert!(diagnostics
        .iter()
        .any(|diagnostic| diagnostic.code == "GENERATOR_SECRET_REF_INVALID"));
}

#[test]
fn invalid_engine_numeric_profiles_are_rejected() {
    let mut document = document("k6");
    document.config_files.push(EngineConfigFile {
        id: "config-1".into(),
        file_name: "config.json".into(),
        format: "json".into(),
        content: r#"{"vus":"many"}"#.into(),
    });

    let diagnostics = ScenarioRegistry::builtins()
        .adapter("k6")
        .unwrap()
        .generate(&document)
        .unwrap_err();
    assert!(diagnostics.iter().any(|diagnostic| {
        diagnostic.severity == DiagnosticSeverity::Error
            && diagnostic.code == "GENERATOR_PROFILE_INVALID"
    }));
}

#[test]
fn engine_config_files_are_included_verbatim_in_the_preview_bundle() {
    for (engine, file_name, format, content) in [
        (
            "locust",
            "locust.conf",
            "locust-conf",
            "users=8\nspawn-rate=2\n",
        ),
        (
            "goose",
            "loom-goose.toml",
            "loom-goose-toml",
            "users = 8\nhatch_rate = 2\n",
        ),
        (
            "k6",
            "config.json",
            "json",
            "{\"vus\":8,\"duration\":\"10s\"}\n",
        ),
    ] {
        let mut document = document(engine);
        document.config_files.push(EngineConfigFile {
            id: "config-1".into(),
            file_name: file_name.into(),
            format: format.into(),
            content: content.into(),
        });
        let bundle = generate(engine, &document);
        let config = bundle
            .files
            .iter()
            .find(|file| file.path == file_name)
            .expect("config file is included");
        assert_eq!(config.content, content);
        assert_eq!(config.role, EngineFileRole::Config);
    }
}
