use runtime_manager::{
    Arch, ArtifactId, InstallState, ManifestError, Os, PlatformKey, RuntimeId, RuntimeManifest,
};

const SUPPORTED: [PlatformKey; 5] = [
    PlatformKey::new(Os::Windows, Arch::X64),
    PlatformKey::new(Os::MacOs, Arch::X64),
    PlatformKey::new(Os::MacOs, Arch::Arm64),
    PlatformKey::new(Os::Linux, Arch::X64),
    PlatformKey::new(Os::Linux, Arch::Arm64),
];

#[test]
fn resolves_verified_artifacts_for_every_supported_target() {
    for platform in SUPPORTED {
        for id in [
            ArtifactId::UvBootstrap,
            ArtifactId::RustupBootstrap,
            ArtifactId::K6,
        ] {
            let artifact = RuntimeManifest::artifact(id, platform).expect("supported artifact");
            assert!(
                artifact.url.starts_with("https://"),
                "{id:?} on {platform:?}"
            );
            assert!(!artifact.version.is_empty(), "{id:?} on {platform:?}");
            assert_eq!(artifact.sha256.len(), 64, "{id:?} on {platform:?}");
            assert!(
                artifact.sha256.bytes().all(|b| b.is_ascii_hexdigit()),
                "{id:?} on {platform:?}"
            );
            assert!(!artifact.license.is_empty(), "{id:?} on {platform:?}");
            assert!(!artifact.upstream.is_empty(), "{id:?} on {platform:?}");
            assert!(
                !artifact.executable_path.is_empty(),
                "{id:?} on {platform:?}"
            );
            assert!(
                !artifact.executable_path.starts_with('/'),
                "{id:?} on {platform:?}"
            );
            assert!(
                !artifact.executable_path.contains(".."),
                "{id:?} on {platform:?}"
            );
            assert!(
                !artifact.executable_path.contains(':'),
                "{id:?} on {platform:?}"
            );
        }
    }
}

#[test]
fn unsupported_architectures_fail_explicitly() {
    let unsupported = PlatformKey::new(Os::Windows, Arch::Arm64);
    assert_eq!(
        RuntimeManifest::artifact(ArtifactId::UvBootstrap, unsupported),
        Err(ManifestError::UnsupportedPlatform(unsupported))
    );
}

#[test]
fn component_pins_are_specific_versions() {
    let locust = RuntimeManifest::locust();
    assert!(locust.python_version.starts_with("3."));
    assert!(locust.python_build.contains('+'));
    assert!(locust.locust_version.starts_with("2."));
    assert!(!locust.python_version.contains("latest"));
    assert!(!locust.locust_version.contains("latest"));

    let goose = RuntimeManifest::goose();
    assert!(goose.rust_toolchain.starts_with("1."));
    assert!(!goose.rust_toolchain.contains("stable"));
    assert!(!goose.goose_version.is_empty());

    let k6 = RuntimeManifest::artifact(ArtifactId::K6, SUPPORTED[0]).unwrap();
    assert!(k6.version.starts_with("v"));
}

#[test]
fn install_state_can_cross_the_tauri_json_boundary() {
    let state = InstallState::Ready {
        version: "2.3.0".into(),
        path: "runtimes/k6/2.3.0/k6".into(),
    };
    let json = serde_json::to_string(&state).unwrap();
    assert_eq!(serde_json::from_str::<InstallState>(&json).unwrap(), state);
    assert_eq!(serde_json::to_string(&RuntimeId::K6).unwrap(), "\"k6\"");
}
