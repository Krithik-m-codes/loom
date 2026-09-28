use runtime_manager::{InstallState, RuntimeId, RuntimeMetadata, RuntimeStore};
use std::fs;
use tempfile::tempdir;

fn stage(root: &std::path::Path, name: &str, executable: &str) -> std::path::PathBuf {
    let dir = root.join("staging").join(name);
    fs::create_dir_all(dir.join(std::path::Path::new(executable).parent().unwrap())).unwrap();
    fs::write(dir.join(executable), b"runtime executable").unwrap();
    dir
}

fn metadata(version: &str, executable_path: &str) -> RuntimeMetadata {
    RuntimeMetadata {
        version: version.to_string(),
        executable_path: executable_path.to_string(),
    }
}

#[test]
fn reports_missing_runtime_without_creating_active_state() {
    let root = tempdir().unwrap();
    let store = RuntimeStore::new(root.path());

    assert_eq!(
        store.status(RuntimeId::Locust).unwrap(),
        InstallState::Missing
    );
    assert_eq!(fs::read_dir(root.path()).unwrap().count(), 0);
}

#[test]
fn activates_staged_runtime_and_reports_its_executable() {
    let root = tempdir().unwrap();
    let store = RuntimeStore::new(root.path());
    let staged = stage(root.path(), "first", "bin/locust");

    let state = store
        .activate(RuntimeId::Locust, &staged, metadata("2.46.6", "bin/locust"))
        .unwrap();

    match state {
        InstallState::Ready { version, path } => {
            assert_eq!(version, "2.46.6");
            assert!(std::path::Path::new(&path).is_file());
        }
        other => panic!("unexpected state: {other:?}"),
    }
}

#[test]
fn failed_activation_preserves_the_previously_active_runtime() {
    let root = tempdir().unwrap();
    let store = RuntimeStore::new(root.path());
    let first = stage(root.path(), "first", "bin/locust");
    store
        .activate(RuntimeId::Locust, &first, metadata("2.46.6", "bin/locust"))
        .unwrap();
    let invalid = stage(root.path(), "invalid", "bin/not-the-executable");

    assert!(store
        .activate(
            RuntimeId::Locust,
            &invalid,
            metadata("2.47.0", "bin/locust")
        )
        .is_err());
    assert!(matches!(
        store.status(RuntimeId::Locust).unwrap(),
        InstallState::Ready { version, .. } if version == "2.46.6"
    ));
}

#[test]
fn repeated_activation_is_idempotent_for_the_same_version() {
    let root = tempdir().unwrap();
    let store = RuntimeStore::new(root.path());
    let first = stage(root.path(), "first", "bin/locust");
    let second = stage(root.path(), "second", "bin/locust");
    let pin = metadata("2.46.6", "bin/locust");
    store
        .activate(RuntimeId::Locust, &first, pin.clone())
        .unwrap();

    assert!(matches!(
        store.activate(RuntimeId::Locust, &second, pin).unwrap(),
        InstallState::Ready { version, .. } if version == "2.46.6"
    ));
    assert!(!second.exists());
}

#[test]
fn refuses_staging_directories_outside_runtime_root() {
    let root = tempdir().unwrap();
    let outside = tempdir().unwrap();
    let store = RuntimeStore::new(root.path());
    let staged = stage(outside.path(), "outside", "bin/locust");

    assert!(store
        .activate(RuntimeId::Locust, &staged, metadata("2.46.6", "bin/locust"))
        .is_err());
    assert_eq!(
        store.status(RuntimeId::Locust).unwrap(),
        InstallState::Missing
    );
}

#[test]
fn activates_an_existing_version_directory_without_moving_embedded_paths() {
    let root = tempdir().unwrap();
    let store = RuntimeStore::new(root.path());
    let version_dir = root
        .path()
        .join("runtimes/locust/versions/3.12.14-locust-2.46.6");
    fs::create_dir_all(version_dir.join("venv/Scripts")).unwrap();
    let executable = version_dir.join("venv/Scripts/locust.exe");
    fs::write(&executable, b"managed runtime").unwrap();

    let state = store
        .activate_existing(
            RuntimeId::Locust,
            &version_dir,
            RuntimeMetadata {
                version: "3.12.14-locust-2.46.6".into(),
                executable_path: "versions/3.12.14-locust-2.46.6/venv/Scripts/locust.exe".into(),
            },
        )
        .unwrap();

    assert!(executable.is_file());
    let canonical_executable = fs::canonicalize(&executable).unwrap();
    assert!(
        matches!(state, InstallState::Ready { path, .. } if path == canonical_executable.to_string_lossy())
    );
}
