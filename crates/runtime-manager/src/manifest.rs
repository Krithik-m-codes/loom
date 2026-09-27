use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::platform::{Arch, Os, PlatformKey};

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeId {
    Locust,
    Goose,
    K6,
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ArtifactId {
    UvBootstrap,
    RustupBootstrap,
    K6,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ArchiveFormat {
    Zip,
    TarGz,
    Executable,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Artifact {
    pub version: &'static str,
    pub url: &'static str,
    pub sha256: &'static str,
    pub archive_format: ArchiveFormat,
    pub executable_path: &'static str,
    pub license: &'static str,
    pub upstream: &'static str,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct LocustPin {
    pub python_version: &'static str,
    pub python_build: &'static str,
    pub locust_version: &'static str,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct GoosePin {
    pub rust_toolchain: &'static str,
    pub goose_version: &'static str,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum InstallState {
    Missing,
    Installing { stage: String },
    Ready { version: String, path: String },
    Failed { stage: String, message: String },
}

#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
pub enum ManifestError {
    #[error("unsupported runtime platform: {0:?}")]
    UnsupportedPlatform(PlatformKey),
}

pub struct RuntimeManifest;

impl RuntimeManifest {
    pub const fn locust() -> &'static LocustPin {
        &LOCUST
    }

    pub const fn goose() -> &'static GoosePin {
        &GOOSE
    }

    pub fn artifact(
        id: ArtifactId,
        platform: PlatformKey,
    ) -> Result<&'static Artifact, ManifestError> {
        let row = match (platform.os, platform.arch) {
            (Os::Windows, Arch::X64) => &ARTIFACTS[0],
            (Os::MacOs, Arch::X64) => &ARTIFACTS[1],
            (Os::MacOs, Arch::Arm64) => &ARTIFACTS[2],
            (Os::Linux, Arch::X64) => &ARTIFACTS[3],
            (Os::Linux, Arch::Arm64) => &ARTIFACTS[4],
            _ => return Err(ManifestError::UnsupportedPlatform(platform)),
        };
        Ok(match id {
            ArtifactId::UvBootstrap => &row[0],
            ArtifactId::RustupBootstrap => &row[1],
            ArtifactId::K6 => &row[2],
        })
    }
}

const LOCUST: LocustPin = LocustPin {
    python_version: "3.12.14",
    python_build: "cpython-3.12.14+20260924",
    locust_version: "2.46.6",
};

const GOOSE: GoosePin = GoosePin {
    rust_toolchain: "1.98.1",
    goose_version: "0.18.1",
};

// Checksums are copied from the corresponding uv *.sha256 files, rustup's
// versioned *.sha256 files, and the k6 release's checksums.txt. Update as a
// reviewed manifest change, never by resolving "latest" during installation.
const UV_VERSION: &str = "0.12.19";
const RUSTUP_VERSION: &str = "1.29.1";
const K6_VERSION: &str = "v2.3.0";
const ASTRAL: &str = "https://github.com/astral-sh/uv";
const RUSTUP: &str = "https://github.com/rust-lang/rustup";
const K6: &str = "https://github.com/grafana/k6";
const PERMISSIVE: &str = "MIT OR Apache-2.0";

const fn artifact(
    version: &'static str,
    url: &'static str,
    sha256: &'static str,
    archive_format: ArchiveFormat,
    executable_path: &'static str,
    license: &'static str,
    upstream: &'static str,
) -> Artifact {
    Artifact {
        version,
        url,
        sha256,
        archive_format,
        executable_path,
        license,
        upstream,
    }
}

const ARTIFACTS: [[Artifact; 3]; 5] = [
    // Windows x64
    [
        artifact(UV_VERSION, "https://github.com/astral-sh/uv/releases/download/0.12.19/uv-x86_64-pc-windows-msvc.zip", "6dbb02d79e419522f1c500f0adb1cddcff0cda7d59b0d66ea7f5e3b4a1b2f5f0", ArchiveFormat::Zip, "uv.exe", PERMISSIVE, ASTRAL),
        artifact(RUSTUP_VERSION, "https://static.rust-lang.org/rustup/archive/1.29.1/x86_64-pc-windows-msvc/rustup-init.exe", "6f4bef66261261fcb43131be8720bab817d403a09edec7455c371974b90bdb7e", ArchiveFormat::Executable, "rustup-init.exe", PERMISSIVE, RUSTUP),
        artifact(K6_VERSION, "https://github.com/grafana/k6/releases/download/v2.3.0/k6-v2.3.0-windows-amd64.zip", "112276d495e5741c968e2bc09ea6196099c1275bd6db9ee0875d173c7148ce43", ArchiveFormat::Zip, "k6-v2.3.0-windows-amd64/k6.exe", "AGPL-3.0-only", K6),
    ],
    // macOS x64
    [
        artifact(UV_VERSION, "https://github.com/astral-sh/uv/releases/download/0.12.19/uv-x86_64-apple-darwin.tar.gz", "cb5fa57bafe68fc0fb94b17f06bee0b0b9a7feb94ccbd110445afa0696e39273", ArchiveFormat::TarGz, "uv-x86_64-apple-darwin/uv", PERMISSIVE, ASTRAL),
        artifact(RUSTUP_VERSION, "https://static.rust-lang.org/rustup/archive/1.29.1/x86_64-apple-darwin/rustup-init", "259e2b84274434085163fe8d556510571772cda2aa6d87ca6aa664f57bc644e3", ArchiveFormat::Executable, "rustup-init", PERMISSIVE, RUSTUP),
        artifact(K6_VERSION, "https://github.com/grafana/k6/releases/download/v2.3.0/k6-v2.3.0-macos-amd64.zip", "c83bb16f54f0676afa4ea235fd757f3892d307dbd1bd201450de83af31986654", ArchiveFormat::Zip, "k6-v2.3.0-macos-amd64/k6", "AGPL-3.0-only", K6),
    ],
    // macOS arm64
    [
        artifact(UV_VERSION, "https://github.com/astral-sh/uv/releases/download/0.12.19/uv-aarch64-apple-darwin.tar.gz", "a9a8df1eedeb192f2e47e40e2faabfb387db4b850209118786d42f89dde3e0ba", ArchiveFormat::TarGz, "uv-aarch64-apple-darwin/uv", PERMISSIVE, ASTRAL),
        artifact(RUSTUP_VERSION, "https://static.rust-lang.org/rustup/archive/1.29.1/aarch64-apple-darwin/rustup-init", "ec1b9233e7f72990ecd8e62063fa7f6c3dfc2bec8e97f88bff165f9100ac696a", ArchiveFormat::Executable, "rustup-init", PERMISSIVE, RUSTUP),
        artifact(K6_VERSION, "https://github.com/grafana/k6/releases/download/v2.3.0/k6-v2.3.0-macos-arm64.zip", "b2417a3038edc5fe81dc178a889237724b595c5c9cfed875822008e46e862c7d", ArchiveFormat::Zip, "k6-v2.3.0-macos-arm64/k6", "AGPL-3.0-only", K6),
    ],
    // Linux x64
    [
        artifact(UV_VERSION, "https://github.com/astral-sh/uv/releases/download/0.12.19/uv-x86_64-unknown-linux-gnu.tar.gz", "23bf5552d220e0842b65c862097b2ebaeba0064b74eda5e565e77fd25969d8c8", ArchiveFormat::TarGz, "uv-x86_64-unknown-linux-gnu/uv", PERMISSIVE, ASTRAL),
        artifact(RUSTUP_VERSION, "https://static.rust-lang.org/rustup/archive/1.29.1/x86_64-unknown-linux-gnu/rustup-init", "dda7234360b7f578ca8b0ddcb80145646fa61a67c1720a5abc7051b35c9fcb71", ArchiveFormat::Executable, "rustup-init", PERMISSIVE, RUSTUP),
        artifact(K6_VERSION, "https://github.com/grafana/k6/releases/download/v2.3.0/k6-v2.3.0-linux-amd64.tar.gz", "39c3117b6af817592dcd0ce4242105c0a7af10948c2a425306f0be8f7a8a8ab1", ArchiveFormat::TarGz, "k6-v2.3.0-linux-amd64/k6", "AGPL-3.0-only", K6),
    ],
    // Linux arm64
    [
        artifact(UV_VERSION, "https://github.com/astral-sh/uv/releases/download/0.12.19/uv-aarch64-unknown-linux-gnu.tar.gz", "0804e9b164c64b6914182d5920c08551958a095986f10a3731056df701126436", ArchiveFormat::TarGz, "uv-aarch64-unknown-linux-gnu/uv", PERMISSIVE, ASTRAL),
        artifact(RUSTUP_VERSION, "https://static.rust-lang.org/rustup/archive/1.29.1/aarch64-unknown-linux-gnu/rustup-init", "15f6e4ce9f583b929c996c91562bad6d4454f3281de858b02cdfdef615fac433", ArchiveFormat::Executable, "rustup-init", PERMISSIVE, RUSTUP),
        artifact(K6_VERSION, "https://github.com/grafana/k6/releases/download/v2.3.0/k6-v2.3.0-linux-arm64.tar.gz", "5ca3433e8201da72a284aaa241a1bb5fb47f4abb4e384d39410ddd8062f49b90", ArchiveFormat::TarGz, "k6-v2.3.0-linux-arm64/k6", "AGPL-3.0-only", K6),
    ],
];
