use crate::{
    extract_verified, ArchiveFormat, Artifact, ArtifactId, DownloadProgress, Downloader,
    InstallError, InstallState, PlatformKey, RuntimeId, RuntimeManifest, RuntimeMetadata,
    RuntimeStore,
};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    sync::Arc,
};
use thiserror::Error;
use tokio::process::Command;
use tokio_util::sync::CancellationToken;

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
pub struct InstallSelection {
    pub locust: bool,
    pub goose: bool,
    pub k6: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct K6Consent {
    pub accepted_at: String,
    pub license: String,
}

impl K6Consent {
    pub fn accepted(accepted_at: impl Into<String>) -> Self {
        Self {
            accepted_at: accepted_at.into(),
            license: "AGPL-3.0-only".into(),
        }
    }

    fn is_valid(&self) -> bool {
        self.license == "AGPL-3.0-only"
            && chrono::DateTime::parse_from_rfc3339(&self.accepted_at).is_ok()
    }
}

#[derive(Debug, Error)]
pub enum RuntimeError {
    #[error("runtime is unavailable on this platform")]
    UnsupportedPlatform,
    #[error("k6 requires separate acceptance of its AGPL-3.0 license")]
    K6ConsentRequired,
    #[error("runtime installation failed: {0}")]
    Install(#[from] InstallError),
    #[error("runtime is not installed")]
    Missing,
}

#[derive(Debug, Default)]
pub struct InstallSummary {
    pub results: BTreeMap<RuntimeId, Result<InstallState, RuntimeError>>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProcessOutput {
    pub success: bool,
    pub code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
}

#[async_trait]
pub trait ArtifactProvider: Send + Sync {
    async fn fetch(
        &self,
        runtime: RuntimeId,
        artifact: &'static Artifact,
        destination: &Path,
        progress: Option<tokio::sync::mpsc::UnboundedSender<DownloadProgress>>,
        cancel: CancellationToken,
    ) -> Result<(), InstallError>;
}

#[async_trait]
pub trait ProcessRunner: Send + Sync {
    async fn run(
        &self,
        program: &Path,
        args: &[String],
        env: &BTreeMap<String, String>,
        cancel: CancellationToken,
    ) -> Result<ProcessOutput, InstallError>;
}

#[derive(Default)]
pub struct NativeArtifactProvider {
    downloader: Downloader,
}

#[async_trait]
impl ArtifactProvider for NativeArtifactProvider {
    async fn fetch(
        &self,
        runtime: RuntimeId,
        artifact: &'static Artifact,
        destination: &Path,
        progress: Option<tokio::sync::mpsc::UnboundedSender<DownloadProgress>>,
        cancel: CancellationToken,
    ) -> Result<(), InstallError> {
        tokio::fs::create_dir_all(destination).await?;
        let archive = self
            .downloader
            .fetch(artifact, destination, runtime, cancel, move |update| {
                if let Some(sender) = progress.as_ref() {
                    let _ = sender.send(update);
                }
            })
            .await?;
        if artifact.archive_format == ArchiveFormat::Executable {
            let relative = crate::extract::checked_relative(Path::new(artifact.executable_path))?;
            let target = destination.join(relative);
            if let Some(parent) = target.parent() {
                tokio::fs::create_dir_all(parent).await?;
            }
            tokio::fs::rename(archive, target).await?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let target = destination.join(crate::extract::checked_relative(Path::new(
                    artifact.executable_path,
                ))?);
                let mut permissions = tokio::fs::metadata(&target).await?.permissions();
                permissions.set_mode(0o755);
                tokio::fs::set_permissions(target, permissions).await?;
            }
            return Ok(());
        }
        let archive_path = archive.clone();
        let format = artifact.archive_format;
        let destination_path = destination.to_path_buf();
        tokio::task::spawn_blocking(move || {
            extract_verified(&archive_path, format, &destination_path)
        })
        .await
        .map_err(|error| InstallError::Archive(error.to_string()))??;
        tokio::fs::remove_file(archive).await?;
        Ok(())
    }
}

#[derive(Default)]
pub struct NativeProcessRunner;

#[async_trait]
impl ProcessRunner for NativeProcessRunner {
    async fn run(
        &self,
        program: &Path,
        args: &[String],
        env: &BTreeMap<String, String>,
        cancel: CancellationToken,
    ) -> Result<ProcessOutput, InstallError> {
        if cancel.is_cancelled() {
            return Err(InstallError::Cancelled);
        }
        let mut command = Command::new(program);
        command.args(args).envs(env).kill_on_drop(true);
        let child = command.output();
        let output = tokio::select! {
            _ = cancel.cancelled() => return Err(InstallError::Cancelled),
            result = child => result.map_err(|error| InstallError::Process(error.to_string()))?,
        };
        Ok(ProcessOutput {
            success: output.status.success(),
            code: output.status.code(),
            stdout: String::from_utf8_lossy(&output.stdout).trim().to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).trim().to_string(),
        })
    }
}

pub struct RuntimeManager {
    root: PathBuf,
    platform: PlatformKey,
    artifacts: Arc<dyn ArtifactProvider>,
    processes: Arc<dyn ProcessRunner>,
    store: RuntimeStore,
    install_locks: BTreeMap<RuntimeId, tokio::sync::Mutex<()>>,
}

impl RuntimeManager {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self::with_dependencies(
            root,
            PlatformKey::current(),
            Arc::new(NativeArtifactProvider::default()),
            Arc::new(NativeProcessRunner),
        )
    }

    pub fn with_dependencies(
        root: impl Into<PathBuf>,
        platform: PlatformKey,
        artifacts: Arc<dyn ArtifactProvider>,
        processes: Arc<dyn ProcessRunner>,
    ) -> Self {
        let root = root.into();
        Self {
            store: RuntimeStore::new(root.clone()),
            root,
            platform,
            artifacts,
            processes,
            install_locks: [RuntimeId::Locust, RuntimeId::Goose, RuntimeId::K6]
                .into_iter()
                .map(|runtime| (runtime, tokio::sync::Mutex::new(())))
                .collect(),
        }
    }

    pub async fn install(
        &self,
        selection: InstallSelection,
        k6_consent: Option<K6Consent>,
        cancel: CancellationToken,
    ) -> InstallSummary {
        self.install_with_progress(selection, k6_consent, None, cancel)
            .await
    }

    pub async fn install_with_progress(
        &self,
        selection: InstallSelection,
        k6_consent: Option<K6Consent>,
        progress: Option<tokio::sync::mpsc::UnboundedSender<DownloadProgress>>,
        cancel: CancellationToken,
    ) -> InstallSummary {
        let mut summary = InstallSummary::default();
        for (runtime, selected) in [
            (RuntimeId::Locust, selection.locust),
            (RuntimeId::Goose, selection.goose),
            (RuntimeId::K6, selection.k6),
        ] {
            if !selected {
                continue;
            }
            let result = if cancel.is_cancelled() {
                Err(RuntimeError::Install(InstallError::Cancelled))
            } else {
                if runtime == RuntimeId::K6 {
                    let Some(consent) = k6_consent.as_ref().filter(|consent| consent.is_valid())
                    else {
                        summary
                            .results
                            .insert(runtime, Err(RuntimeError::K6ConsentRequired));
                        continue;
                    };
                    if let Err(error) = self.persist_k6_consent(consent) {
                        summary
                            .results
                            .insert(runtime, Err(RuntimeError::Install(error)));
                        continue;
                    }
                }
                self.install_one(runtime, progress.clone(), cancel.child_token())
                    .await
            };
            summary.results.insert(runtime, result);
        }
        summary
    }

    async fn install_one(
        &self,
        runtime: RuntimeId,
        progress: Option<tokio::sync::mpsc::UnboundedSender<DownloadProgress>>,
        cancel: CancellationToken,
    ) -> Result<InstallState, RuntimeError> {
        let lock = self
            .install_locks
            .get(&runtime)
            .expect("every runtime has an install lock");
        let _guard = tokio::select! {
            _ = cancel.cancelled() => return Err(RuntimeError::Install(InstallError::Cancelled)),
            guard = lock.lock() => guard,
        };
        if !self.platform.is_supported() {
            return Err(RuntimeError::UnsupportedPlatform);
        }
        let expected_version = match runtime {
            RuntimeId::Locust => {
                let pin = RuntimeManifest::locust();
                format!("{}-locust-{}", pin.python_build, pin.locust_version)
            }
            RuntimeId::Goose => RuntimeManifest::goose().rust_toolchain.to_string(),
            RuntimeId::K6 => RuntimeManifest::artifact(ArtifactId::K6, self.platform)
                .map_err(|_| RuntimeError::UnsupportedPlatform)?
                .version
                .to_string(),
        };
        if let InstallState::Ready { version, .. } = self.store.status(runtime)? {
            if version == expected_version {
                return Ok(self.store.status(runtime)?);
            }
        }
        let artifact_id = match runtime {
            RuntimeId::Locust => ArtifactId::UvBootstrap,
            RuntimeId::Goose => ArtifactId::RustupBootstrap,
            RuntimeId::K6 => ArtifactId::K6,
        };
        let artifact = RuntimeManifest::artifact(artifact_id, self.platform)
            .map_err(|_| RuntimeError::UnsupportedPlatform)?;
        let stage = self.root.join("staging").join(format!(
            "{}-{}",
            runtime_name(runtime),
            uuid::Uuid::new_v4()
        ));
        tokio::fs::create_dir_all(&stage)
            .await
            .map_err(InstallError::from)?;
        let result = self
            .artifacts
            .fetch(runtime, artifact, &stage, progress.clone(), cancel.clone())
            .await;
        if result.is_err() {
            let _ = tokio::fs::remove_dir_all(&stage).await;
            return Err(result.unwrap_err().into());
        }
        emit_progress(&progress, runtime, "install", "Preparing managed runtime");
        let result = match runtime {
            RuntimeId::Locust => self.provision_locust(&stage, progress, cancel).await,
            RuntimeId::Goose => self.provision_goose(&stage, progress, cancel).await,
            RuntimeId::K6 => self.provision_k6(&stage, progress, cancel).await,
        };
        let _ = tokio::fs::remove_dir_all(&stage).await;
        if result.is_err() {
            self.remove_incomplete_version(runtime, &expected_version);
        }
        result.map_err(RuntimeError::from)
    }

    fn remove_incomplete_version(&self, runtime: RuntimeId, version: &str) {
        if matches!(self.store.status(runtime), Ok(InstallState::Ready { version: active, .. }) if active == version)
        {
            return;
        }
        let directory = match runtime {
            RuntimeId::Locust | RuntimeId::Goose => {
                self.runtime_dir(runtime).join("versions").join(version)
            }
            RuntimeId::K6 => return,
        };
        let _ = std::fs::remove_dir_all(directory);
    }

    async fn provision_locust(
        &self,
        stage: &Path,
        progress: Option<tokio::sync::mpsc::UnboundedSender<DownloadProgress>>,
        cancel: CancellationToken,
    ) -> Result<InstallState, InstallError> {
        let pin = RuntimeManifest::locust();
        let version = format!("{}-locust-{}", pin.python_build, pin.locust_version);
        if let InstallState::Ready {
            version: active, ..
        } = self.store.status(RuntimeId::Locust)?
        {
            if active == version {
                return self.store.status(RuntimeId::Locust);
            }
        }
        let runtime_dir = self.runtime_dir(RuntimeId::Locust);
        let artifact = RuntimeManifest::artifact(ArtifactId::UvBootstrap, self.platform)
            .map_err(|e| InstallError::Download(e.to_string()))?;
        let tool_dir = runtime_dir
            .join("tools")
            .join(format!("uv-{}", artifact.version));
        let uv_name = exe_name("uv");
        let uv_path = tool_dir.join(&uv_name);
        let acquired = stage.join(crate::extract::checked_relative(Path::new(
            artifact.executable_path,
        ))?);
        if let Some(parent) = uv_path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        tokio::fs::copy(acquired, &uv_path).await?;

        let version_dir = runtime_dir.join("versions").join(&version);
        tokio::fs::create_dir_all(&version_dir).await?;
        let python_home = version_dir.join("python");
        let venv = version_dir.join("venv");
        emit_progress(
            &progress,
            RuntimeId::Locust,
            "python",
            "Installing pinned managed Python",
        );
        let mut env = BTreeMap::new();
        env.insert(
            "UV_PYTHON_INSTALL_DIR".into(),
            python_home.to_string_lossy().into_owned(),
        );
        self.run_checked(
            &uv_path,
            &[
                "python".into(),
                "install".into(),
                pin.python_version.into(),
                "--managed-python".into(),
                "--install-dir".into(),
                python_home.to_string_lossy().into_owned(),
            ],
            &env,
            cancel.child_token(),
        )
        .await?;
        self.run_checked(
            &uv_path,
            &[
                "venv".into(),
                "--python".into(),
                pin.python_version.into(),
                "--managed-python".into(),
                venv.to_string_lossy().into_owned(),
            ],
            &env,
            cancel.child_token(),
        )
        .await?;
        let python = venv.join(if cfg!(windows) {
            "Scripts/python.exe"
        } else {
            "bin/python"
        });
        let locust = venv.join(if cfg!(windows) {
            "Scripts/locust.exe"
        } else {
            "bin/locust"
        });
        self.run_checked(
            &uv_path,
            &[
                "pip".into(),
                "install".into(),
                "--python".into(),
                python.to_string_lossy().into_owned(),
                format!("locust=={}", pin.locust_version),
            ],
            &env,
            cancel.child_token(),
        )
        .await?;
        emit_progress(
            &progress,
            RuntimeId::Locust,
            "probe",
            "Verifying Python and Locust versions",
        );
        self.probe_version(
            &python,
            &env,
            "--version",
            pin.python_version,
            cancel.child_token(),
        )
        .await?;
        self.probe_version(
            &locust,
            &env,
            "--version",
            pin.locust_version,
            cancel.child_token(),
        )
        .await?;
        self.store.activate_existing(
            RuntimeId::Locust,
            &version_dir,
            RuntimeMetadata {
                version,
                executable_path: path_from_runtime(&runtime_dir, &locust)?,
            },
        )
    }

    async fn provision_goose(
        &self,
        stage: &Path,
        progress: Option<tokio::sync::mpsc::UnboundedSender<DownloadProgress>>,
        cancel: CancellationToken,
    ) -> Result<InstallState, InstallError> {
        let pin = RuntimeManifest::goose();
        if let InstallState::Ready { version, .. } = self.store.status(RuntimeId::Goose)? {
            if version == pin.rust_toolchain {
                return self.store.status(RuntimeId::Goose);
            }
        }
        let runtime_dir = self.runtime_dir(RuntimeId::Goose);
        let rustup_home = runtime_dir.join("rustup");
        let cargo_home = runtime_dir.join("versions").join(&pin.rust_toolchain);
        tokio::fs::create_dir_all(&rustup_home).await?;
        tokio::fs::create_dir_all(&cargo_home).await?;
        let artifact = RuntimeManifest::artifact(ArtifactId::RustupBootstrap, self.platform)
            .map_err(|e| InstallError::Download(e.to_string()))?;
        let installer = stage.join(crate::extract::checked_relative(Path::new(
            artifact.executable_path,
        ))?);
        let env = BTreeMap::from([
            (
                "RUSTUP_HOME".into(),
                rustup_home.to_string_lossy().into_owned(),
            ),
            (
                "CARGO_HOME".into(),
                cargo_home.to_string_lossy().into_owned(),
            ),
        ]);
        emit_progress(
            &progress,
            RuntimeId::Goose,
            "toolchain",
            "Installing pinned Rust toolchain",
        );
        self.run_checked(
            &installer,
            &[
                "--no-modify-path".into(),
                "--default-toolchain".into(),
                pin.rust_toolchain.into(),
                "--profile".into(),
                "minimal".into(),
                "-y".into(),
            ],
            &env,
            cancel.child_token(),
        )
        .await?;
        let cargo = cargo_home.join("bin").join(exe_name("cargo"));
        let rustc = cargo_home.join("bin").join(exe_name("rustc"));
        self.probe_version(
            &cargo,
            &env,
            "--version",
            pin.rust_toolchain,
            cancel.child_token(),
        )
        .await?;
        self.probe_version(
            &rustc,
            &env,
            "--version",
            pin.rust_toolchain,
            cancel.child_token(),
        )
        .await?;
        self.store.activate_existing(
            RuntimeId::Goose,
            &cargo_home,
            RuntimeMetadata {
                version: pin.rust_toolchain.into(),
                executable_path: path_from_runtime(&runtime_dir, &cargo)?,
            },
        )
    }

    async fn provision_k6(
        &self,
        stage: &Path,
        progress: Option<tokio::sync::mpsc::UnboundedSender<DownloadProgress>>,
        cancel: CancellationToken,
    ) -> Result<InstallState, InstallError> {
        let artifact = RuntimeManifest::artifact(ArtifactId::K6, self.platform)
            .map_err(|e| InstallError::Download(e.to_string()))?;
        let version = artifact.version.to_string();
        if let InstallState::Ready {
            version: active, ..
        } = self.store.status(RuntimeId::K6)?
        {
            if active == version {
                return self.store.status(RuntimeId::K6);
            }
        }
        let executable = stage.join(crate::extract::checked_relative(Path::new(
            artifact.executable_path,
        ))?);
        set_executable(&executable)?;
        emit_progress(&progress, RuntimeId::K6, "probe", "Verifying k6 version");
        self.probe_version(
            &executable,
            &BTreeMap::new(),
            "version",
            artifact.version,
            cancel,
        )
        .await?;
        self.store.activate(
            RuntimeId::K6,
            stage,
            RuntimeMetadata {
                version,
                executable_path: artifact.executable_path.into(),
            },
        )
    }

    async fn run_checked(
        &self,
        program: &Path,
        args: &[String],
        env: &BTreeMap<String, String>,
        cancel: CancellationToken,
    ) -> Result<ProcessOutput, InstallError> {
        let output = self.processes.run(program, args, env, cancel).await?;
        if !output.success {
            return Err(InstallError::Process(format!(
                "{} failed ({}): {}",
                program.display(),
                output
                    .code
                    .map_or_else(|| "no exit code".into(), |c| c.to_string()),
                output.stderr
            )));
        }
        Ok(output)
    }

    async fn probe_version(
        &self,
        program: &Path,
        env: &BTreeMap<String, String>,
        flag: &str,
        expected: &str,
        cancel: CancellationToken,
    ) -> Result<(), InstallError> {
        let output = self
            .run_checked(program, &[flag.into()], env, cancel)
            .await?;
        if !crate::probe::version_matches(&format!("{} {}", output.stdout, output.stderr), expected)
        {
            return Err(InstallError::Process(format!(
                "{} version probe did not report {expected}",
                program.display()
            )));
        }
        Ok(())
    }

    fn runtime_dir(&self, runtime: RuntimeId) -> PathBuf {
        self.root.join("runtimes").join(runtime_name(runtime))
    }

    pub fn resolve(&self, runtime: RuntimeId) -> Result<ResolvedRuntime, RuntimeError> {
        match self.store.status(runtime)? {
            InstallState::Ready { version, path } => {
                let mut env = BTreeMap::new();
                if runtime == RuntimeId::Goose {
                    let runtime_dir = self.runtime_dir(runtime);
                    env.insert(
                        "RUSTUP_HOME".into(),
                        runtime_dir.join("rustup").to_string_lossy().into_owned(),
                    );
                    env.insert(
                        "CARGO_HOME".into(),
                        runtime_dir
                            .join("versions")
                            .join(&version)
                            .to_string_lossy()
                            .into_owned(),
                    );
                }
                Ok(ResolvedRuntime {
                    executable: PathBuf::from(path),
                    version,
                    env,
                })
            }
            InstallState::Missing | InstallState::Failed { .. } => {
                let paths = std::env::var_os("PATH").unwrap_or_default();
                find_runtime_on_path(runtime, std::env::split_paths(&paths), cfg!(windows))
                    .map(|executable| ResolvedRuntime {
                        executable,
                        version: "system-managed".into(),
                        env: BTreeMap::new(),
                    })
                    .ok_or(RuntimeError::Missing)
            }
            InstallState::Installing { .. } => Err(RuntimeError::Missing),
        }
    }

    fn persist_k6_consent(&self, consent: &K6Consent) -> Result<(), InstallError> {
        let path = self.root.join("licenses").join("k6-consent.json");
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let bytes = serde_json::to_vec(consent).map_err(|e| InstallError::Store(e.to_string()))?;
        let temporary = path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
        std::fs::write(&temporary, bytes)?;
        crate::store::replace_file(&temporary, &path)?;
        Ok(())
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ResolvedRuntime {
    pub executable: PathBuf,
    pub version: String,
    pub env: BTreeMap<String, String>,
}

fn emit_progress(
    sender: &Option<tokio::sync::mpsc::UnboundedSender<DownloadProgress>>,
    runtime: RuntimeId,
    stage: &str,
    message: &str,
) {
    if let Some(sender) = sender {
        let _ = sender.send(DownloadProgress {
            runtime,
            stage: stage.into(),
            bytes_received: 0,
            total_bytes: None,
            message: message.into(),
        });
    }
}

fn path_from_runtime(runtime_dir: &Path, executable: &Path) -> Result<String, InstallError> {
    executable
        .strip_prefix(runtime_dir)
        .map(|path| path.to_string_lossy().replace('\\', "/"))
        .map_err(|_| InstallError::UnsafePath(executable.display().to_string()))
}

fn exe_name(name: &str) -> String {
    if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.to_string()
    }
}

fn set_executable(path: &Path) -> Result<(), InstallError> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = std::fs::metadata(path)?.permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(path, permissions)?;
    }
    #[cfg(not(unix))]
    let _ = path;
    Ok(())
}

fn find_runtime_on_path(
    runtime: RuntimeId,
    paths: impl IntoIterator<Item = PathBuf>,
    windows: bool,
) -> Option<PathBuf> {
    let executable = match runtime {
        RuntimeId::Locust => "locust",
        RuntimeId::Goose => "cargo",
        RuntimeId::K6 => "k6",
    };
    paths.into_iter().find_map(|directory| {
        let candidate = directory.join(if windows {
            format!("{executable}.exe")
        } else {
            executable.to_string()
        });
        candidate.is_file().then_some(candidate)
    })
}

#[cfg(test)]
mod resolver_tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn resolver_checks_engine_binary_name_in_each_path_directory() {
        let temp = tempdir().unwrap();
        let first = temp.path().join("first");
        let second = temp.path().join("second");
        std::fs::create_dir_all(&first).unwrap();
        std::fs::create_dir_all(&second).unwrap();
        let k6 = second.join("k6");
        std::fs::write(&k6, b"binary").unwrap();

        assert_eq!(
            find_runtime_on_path(RuntimeId::K6, [first, second], false),
            Some(k6)
        );
    }

    #[test]
    fn resolver_uses_windows_executable_suffix() {
        let temp = tempdir().unwrap();
        let executable = temp.path().join("cargo.exe");
        std::fs::write(&executable, b"binary").unwrap();

        assert_eq!(
            find_runtime_on_path(RuntimeId::Goose, [temp.path().to_path_buf()], true),
            Some(executable)
        );
    }
}

pub fn runtime_name(runtime: RuntimeId) -> &'static str {
    match runtime {
        RuntimeId::Locust => "locust",
        RuntimeId::Goose => "goose",
        RuntimeId::K6 => "k6",
    }
}
