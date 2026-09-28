use async_trait::async_trait;
use runtime_manager::{
    Arch, Artifact, ArtifactProvider, DownloadProgress, InstallError, InstallSelection, K6Consent,
    Os, PlatformKey, ProcessOutput, ProcessRunner, RuntimeId, RuntimeManager,
};
use std::{
    collections::BTreeMap,
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};
use tempfile::tempdir;
use tokio_util::sync::CancellationToken;

#[derive(Default)]
struct FakeArtifacts(Mutex<Vec<RuntimeId>>);

#[async_trait]
impl ArtifactProvider for FakeArtifacts {
    async fn fetch(
        &self,
        runtime: RuntimeId,
        artifact: &'static Artifact,
        destination: &Path,
        progress: Option<tokio::sync::mpsc::UnboundedSender<DownloadProgress>>,
        _cancel: CancellationToken,
    ) -> Result<(), InstallError> {
        self.0.lock().unwrap().push(runtime);
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        if let Some(progress) = progress {
            let _ = progress.send(DownloadProgress {
                runtime,
                stage: "download".into(),
                bytes_received: 10,
                total_bytes: Some(10),
                message: "fake download complete".into(),
            });
        }
        let executable = destination.join(artifact.executable_path);
        std::fs::create_dir_all(executable.parent().unwrap()).unwrap();
        std::fs::write(executable, b"test executable").unwrap();
        Ok(())
    }
}

#[derive(Default)]
struct FakeProcesses {
    calls: Mutex<Vec<(String, Vec<String>, BTreeMap<String, String>)>>,
    wrong_locust_probe: AtomicBool,
    fail_rustc_link: AtomicBool,
}

#[async_trait]
impl ProcessRunner for FakeProcesses {
    async fn run(
        &self,
        program: &Path,
        args: &[String],
        env: &BTreeMap<String, String>,
        _cancel: CancellationToken,
    ) -> Result<ProcessOutput, InstallError> {
        self.calls.lock().unwrap().push((
            program.to_string_lossy().into_owned(),
            args.to_vec(),
            env.clone(),
        ));
        let name = program.file_stem().unwrap().to_string_lossy();
        if ["python", "locust", "cargo", "rustc"].contains(&name.as_ref()) {
            std::fs::create_dir_all(program.parent().unwrap()).unwrap();
            std::fs::write(program, b"probe executable").unwrap();
        }
        let fails_link = name == "rustc"
            && args.iter().any(|arg| arg == "-o")
            && self.fail_rustc_link.load(Ordering::SeqCst);
        if name == "rustc" {
            if let Some(output_index) = args
                .iter()
                .position(|arg| arg == "-o")
                .and_then(|index| args.get(index + 1))
            {
                std::fs::write(output_index, b"linked executable").unwrap();
            }
        }
        let output = if name.contains("python") {
            "Python 3.12.14"
        } else if name.contains("locust") && self.wrong_locust_probe.load(Ordering::SeqCst) {
            "locust 2.46.60"
        } else if name.contains("locust") {
            "locust 2.46.6"
        } else if name == "cargo" {
            "cargo 1.98.1"
        } else if name == "rustc" {
            "rustc 1.98.1"
        } else {
            "k6 v2.3.0"
        };
        Ok(ProcessOutput {
            success: !fails_link,
            code: Some(if fails_link { 1 } else { 0 }),
            stdout: output.into(),
            stderr: String::new(),
        })
    }
}

fn manager(root: &Path, artifacts: Arc<FakeArtifacts>) -> RuntimeManager {
    RuntimeManager::with_dependencies(
        root,
        PlatformKey::current(),
        artifacts,
        Arc::new(FakeProcesses::default()),
    )
}

#[tokio::test]
async fn k6_is_not_resolved_or_fetched_without_separate_consent() {
    let temp = tempdir().unwrap();
    let artifacts = Arc::new(FakeArtifacts::default());
    let result = manager(temp.path(), artifacts.clone())
        .install(
            InstallSelection {
                locust: false,
                goose: false,
                k6: true,
            },
            None,
            CancellationToken::new(),
        )
        .await;

    assert!(result.results[&RuntimeId::K6].is_err());
    assert!(artifacts.0.lock().unwrap().is_empty());
}

#[tokio::test]
async fn malformed_k6_consent_timestamp_is_rejected_before_resolution() {
    let temp = tempdir().unwrap();
    let artifacts = Arc::new(FakeArtifacts::default());
    let result = manager(temp.path(), artifacts.clone())
        .install(
            InstallSelection {
                locust: false,
                goose: false,
                k6: true,
            },
            Some(K6Consent::accepted("made-upTtimestamp")),
            CancellationToken::new(),
        )
        .await;

    assert!(result.results[&RuntimeId::K6].is_err());
    assert!(artifacts.0.lock().unwrap().is_empty());
}

#[tokio::test]
async fn k6_artifact_is_fetched_only_after_explicit_consent() {
    let temp = tempdir().unwrap();
    let artifacts = Arc::new(FakeArtifacts::default());
    let manager = manager(temp.path(), artifacts.clone());
    let _result = manager
        .install(
            InstallSelection {
                locust: false,
                goose: false,
                k6: true,
            },
            Some(K6Consent::accepted("2026-09-28T00:00:00Z")),
            CancellationToken::new(),
        )
        .await;

    assert_eq!(*artifacts.0.lock().unwrap(), vec![RuntimeId::K6]);
    let _ = manager
        .install(
            InstallSelection {
                locust: false,
                goose: false,
                k6: true,
            },
            Some(K6Consent::accepted("2026-09-28T01:00:00Z")),
            CancellationToken::new(),
        )
        .await;
    assert_eq!(artifacts.0.lock().unwrap().len(), 1);
    let consent = std::fs::read_to_string(temp.path().join("licenses/k6-consent.json")).unwrap();
    assert!(consent.contains("2026-09-28T01:00:00Z"));
    assert!(consent.contains("AGPL-3.0-only"));
}

#[tokio::test]
async fn locust_and_goose_are_independently_provisioned_and_persisted() {
    let temp = tempdir().unwrap();
    let artifacts = Arc::new(FakeArtifacts::default());
    let processes = Arc::new(FakeProcesses::default());
    let manager = RuntimeManager::with_dependencies(
        temp.path(),
        PlatformKey::current(),
        artifacts.clone(),
        processes.clone(),
    );
    let summary = manager
        .install(
            InstallSelection {
                locust: true,
                goose: true,
                k6: false,
            },
            None,
            CancellationToken::new(),
        )
        .await;

    assert!(
        matches!(&summary.results[&RuntimeId::Locust], Ok(runtime_manager::InstallState::Ready { version, .. }) if version == "cpython-3.12.14+20260924-locust-2.46.6"),
        "{:?}",
        summary.results
    );
    assert!(
        matches!(&summary.results[&RuntimeId::Goose], Ok(runtime_manager::InstallState::Ready { version, .. }) if version == "1.98.1")
    );
    assert_eq!(
        *artifacts.0.lock().unwrap(),
        vec![RuntimeId::Locust, RuntimeId::Goose]
    );
    let calls = processes.calls.lock().unwrap();
    assert!(calls
        .iter()
        .any(|(_, args, _)| args.iter().any(|arg| arg == "cpython-3.12.14+20260924")));
    assert!(calls.iter().any(|(_, args, env)| args
        .iter()
        .any(|arg| arg == "cpython-3.12.14+20260924")
        && env.contains_key("UV_PYTHON_INSTALL_DIR")));
    let root = temp.path().to_string_lossy();
    assert!(calls.iter().any(|(_, args, env)| {
        args.iter().any(|arg| arg == "--no-bin")
            && args.iter().any(|arg| arg == "--no-config")
            && env
                .get("UV_CACHE_DIR")
                .is_some_and(|path| path.starts_with(root.as_ref()))
            && env
                .get("UV_PYTHON_BIN_DIR")
                .is_some_and(|path| path.starts_with(root.as_ref()))
    }));
    assert!(calls
        .iter()
        .any(|(_, args, env)| args.iter().any(|arg| arg == "1.98.1")
            && env.contains_key("RUSTUP_HOME")
            && env.contains_key("CARGO_HOME")
            && env
                .get("RUSTUP_TOOLCHAIN")
                .is_some_and(|toolchain| toolchain == "1.98.1")
            && env
                .get("RUSTUP_HOME")
                .is_some_and(|home| home.contains("versions"))));
}

#[tokio::test]
async fn a_bad_locust_probe_does_not_roll_back_a_successful_goose_install() {
    let temp = tempdir().unwrap();
    let artifacts = Arc::new(FakeArtifacts::default());
    let processes = Arc::new(FakeProcesses::default());
    processes.wrong_locust_probe.store(true, Ordering::SeqCst);
    let manager = RuntimeManager::with_dependencies(
        temp.path(),
        PlatformKey::current(),
        artifacts,
        processes,
    );
    let summary = manager
        .install(
            InstallSelection {
                locust: true,
                goose: true,
                k6: false,
            },
            None,
            CancellationToken::new(),
        )
        .await;

    assert!(summary.results[&RuntimeId::Locust].is_err());
    assert!(matches!(
        summary.results[&RuntimeId::Goose],
        Ok(runtime_manager::InstallState::Ready { .. })
    ));
    assert!(
        matches!(manager.resolve(RuntimeId::Goose), Ok(runtime_manager::ResolvedRuntime { version, .. }) if version == "1.98.1")
    );
}

#[tokio::test]
async fn failed_locust_install_can_be_retried_without_stale_partial_files() {
    let temp = tempdir().unwrap();
    let artifacts = Arc::new(FakeArtifacts::default());
    let processes = Arc::new(FakeProcesses::default());
    processes.wrong_locust_probe.store(true, Ordering::SeqCst);
    let manager = RuntimeManager::with_dependencies(
        temp.path(),
        PlatformKey::current(),
        artifacts.clone(),
        processes.clone(),
    );
    let selection = InstallSelection {
        locust: true,
        goose: false,
        k6: false,
    };
    let failed = manager
        .install(selection, None, CancellationToken::new())
        .await;
    assert!(failed.results[&RuntimeId::Locust].is_err());
    assert!(!temp
        .path()
        .join("runtimes/locust/versions/cpython-3.12.14+20260924-locust-2.46.6")
        .exists());

    processes.wrong_locust_probe.store(false, Ordering::SeqCst);
    let retried = manager
        .install(selection, None, CancellationToken::new())
        .await;
    assert!(matches!(
        retried.results[&RuntimeId::Locust],
        Ok(runtime_manager::InstallState::Ready { .. })
    ));
    assert_eq!(artifacts.0.lock().unwrap().len(), 2);
}

#[tokio::test]
async fn reinstalling_an_active_pinned_runtime_reprobes_before_skipping_download() {
    let temp = tempdir().unwrap();
    let artifacts = Arc::new(FakeArtifacts::default());
    let processes = Arc::new(FakeProcesses::default());
    let manager = RuntimeManager::with_dependencies(
        temp.path(),
        PlatformKey::current(),
        artifacts.clone(),
        processes.clone(),
    );
    let selection = InstallSelection {
        locust: true,
        goose: false,
        k6: false,
    };
    let _ = manager
        .install(selection, None, CancellationToken::new())
        .await;
    let first_process_count = processes.calls.lock().unwrap().len();
    let _ = manager
        .install(selection, None, CancellationToken::new())
        .await;

    assert_eq!(artifacts.0.lock().unwrap().len(), 1);
    assert!(
        processes.calls.lock().unwrap().len() > first_process_count,
        "the active runtime must be probed before it is treated as ready"
    );
}

#[tokio::test]
async fn provisioning_reports_component_progress_to_the_caller() {
    let temp = tempdir().unwrap();
    let artifacts = Arc::new(FakeArtifacts::default());
    let processes = Arc::new(FakeProcesses::default());
    let manager = RuntimeManager::with_dependencies(
        temp.path(),
        PlatformKey::current(),
        artifacts,
        processes,
    );
    let (sender, mut receiver) = tokio::sync::mpsc::unbounded_channel::<DownloadProgress>();
    let _ = manager
        .install_with_progress(
            InstallSelection {
                locust: true,
                goose: false,
                k6: false,
            },
            None,
            Some(sender),
            CancellationToken::new(),
        )
        .await;
    let mut stages = Vec::new();
    while let Ok(progress) = receiver.try_recv() {
        stages.push(progress.stage);
    }

    assert!(stages.iter().any(|stage| stage == "download"));
    assert!(stages.iter().any(|stage| stage == "python"));
    assert!(stages.iter().any(|stage| stage == "probe"));
}

#[tokio::test]
async fn cancelled_install_never_starts_artifact_acquisition() {
    let temp = tempdir().unwrap();
    let artifacts = Arc::new(FakeArtifacts::default());
    let cancel = CancellationToken::new();
    cancel.cancel();
    let result = manager(temp.path(), artifacts.clone())
        .install(
            InstallSelection {
                locust: true,
                goose: true,
                k6: false,
            },
            None,
            cancel,
        )
        .await;

    assert!(result.results.values().all(Result::is_err));
    assert!(artifacts.0.lock().unwrap().is_empty());
}

#[tokio::test]
async fn unsupported_platform_returns_component_error_without_fetching() {
    let temp = tempdir().unwrap();
    let artifacts = Arc::new(FakeArtifacts::default());
    let manager = RuntimeManager::with_dependencies(
        temp.path(),
        PlatformKey::new(Os::Windows, Arch::Arm64),
        artifacts.clone(),
        Arc::new(FakeProcesses::default()),
    );
    let result = manager
        .install(
            InstallSelection {
                locust: true,
                goose: true,
                k6: false,
            },
            None,
            CancellationToken::new(),
        )
        .await;

    assert!(result.results.values().all(Result::is_err));
    assert!(artifacts.0.lock().unwrap().is_empty());
}

#[tokio::test]
async fn concurrent_installs_for_the_same_runtime_are_serialized() {
    let temp = tempdir().unwrap();
    let artifacts = Arc::new(FakeArtifacts::default());
    let manager = manager(temp.path(), artifacts.clone());
    let selection = InstallSelection {
        locust: true,
        goose: false,
        k6: false,
    };
    let (first, second) = tokio::join!(
        manager.install(selection, None, CancellationToken::new()),
        manager.install(selection, None, CancellationToken::new()),
    );

    assert!(
        first.results[&RuntimeId::Locust].is_ok(),
        "first install: {:?}",
        first.results[&RuntimeId::Locust]
    );
    assert!(
        second.results[&RuntimeId::Locust].is_ok(),
        "second install: {:?}",
        second.results[&RuntimeId::Locust]
    );
    assert_eq!(artifacts.0.lock().unwrap().len(), 1);
}

#[tokio::test]
async fn separate_managers_sharing_runtime_data_serialize_the_same_install() {
    let temp = tempdir().unwrap();
    let artifacts = Arc::new(FakeArtifacts::default());
    let first_manager = manager(temp.path(), artifacts.clone());
    let second_manager = manager(temp.path(), artifacts.clone());
    let selection = InstallSelection {
        locust: true,
        goose: false,
        k6: false,
    };

    let (first, second) = tokio::join!(
        first_manager.install(selection, None, CancellationToken::new()),
        second_manager.install(selection, None, CancellationToken::new()),
    );

    assert!(
        first.results[&RuntimeId::Locust].is_ok(),
        "first install: {:?}",
        first.results[&RuntimeId::Locust]
    );
    assert!(
        second.results[&RuntimeId::Locust].is_ok(),
        "second install: {:?}",
        second.results[&RuntimeId::Locust]
    );
    assert_eq!(
        artifacts.0.lock().unwrap().len(),
        1,
        "only the manager that acquires the OS lock should fetch artifacts"
    );
}

#[tokio::test]
async fn goose_is_not_marked_ready_when_native_linker_prerequisites_are_missing() {
    let temp = tempdir().unwrap();
    let artifacts = Arc::new(FakeArtifacts::default());
    let processes = Arc::new(FakeProcesses::default());
    processes.fail_rustc_link.store(true, Ordering::SeqCst);
    let manager = RuntimeManager::with_dependencies(
        temp.path(),
        PlatformKey::current(),
        artifacts,
        processes,
    );
    let summary = manager
        .install(
            InstallSelection {
                locust: false,
                goose: true,
                k6: false,
            },
            None,
            CancellationToken::new(),
        )
        .await;

    let result = summary.results.get(&RuntimeId::Goose).unwrap();
    assert!(
        result.is_err(),
        "Goose must not report Ready when a minimal executable cannot be linked"
    );
    assert!(result
        .as_ref()
        .unwrap_err()
        .to_string()
        .contains("native linker"));
}
