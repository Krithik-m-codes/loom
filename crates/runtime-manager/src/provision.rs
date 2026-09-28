use crate::{
    extract_verified_with_cancel, ArchiveFormat, Artifact, ArtifactId, DownloadProgress,
    Downloader, InstallError, InstallState, PlatformKey, RuntimeId, RuntimeManifest,
    RuntimeMetadata, RuntimeStore,
};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::fs::{File, OpenOptions};
use std::io::ErrorKind;
use std::process::Stdio;
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
        let extraction_cancel = cancel.clone();
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
            extract_verified_with_cancel(
                &archive_path,
                format,
                &destination_path,
                &extraction_cancel,
            )
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
        command.env_clear();
        for (key, value) in std::env::vars_os() {
            if inherit_environment_key(&key.to_string_lossy()) {
                command.env(key, value);
            }
        }
        command
            .args(args)
            .envs(env)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            command.as_std_mut().process_group(0);
        }
        let mut child = command
            .spawn()
            .map_err(|error| InstallError::Process(error.to_string()))?;
        let child_id = child.id();
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let stdout_task = tokio::spawn(async move {
            let mut bytes = Vec::new();
            if let Some(mut stdout) = stdout {
                tokio::io::AsyncReadExt::read_to_end(&mut stdout, &mut bytes).await?;
            }
            Ok::<_, std::io::Error>(bytes)
        });
        let stderr_task = tokio::spawn(async move {
            let mut bytes = Vec::new();
            if let Some(mut stderr) = stderr {
                tokio::io::AsyncReadExt::read_to_end(&mut stderr, &mut bytes).await?;
            }
            Ok::<_, std::io::Error>(bytes)
        });
        let status = tokio::select! {
            _ = cancel.cancelled() => {
                if let Some(child_id) = child_id {
                    terminate_process_tree(child_id).await;
                }
                let _ = child.start_kill();
                let _ = child.wait().await;
                stdout_task.abort();
                stderr_task.abort();
                return Err(InstallError::Cancelled);
            }
            result = child.wait() => result.map_err(|error| InstallError::Process(error.to_string()))?,
        };
        let stdout = stdout_task
            .await
            .map_err(|error| InstallError::Process(error.to_string()))?
            .map_err(InstallError::from)?;
        let stderr = stderr_task
            .await
            .map_err(|error| InstallError::Process(error.to_string()))?
            .map_err(InstallError::from)?;
        Ok(ProcessOutput {
            success: status.success(),
            code: status.code(),
            stdout: String::from_utf8_lossy(&stdout).trim().to_string(),
            stderr: String::from_utf8_lossy(&stderr).trim().to_string(),
        })
    }
}

async fn terminate_process_tree(process_id: u32) {
    #[cfg(unix)]
    unsafe {
        libc::kill(-(process_id as i32), libc::SIGKILL);
    }
    #[cfg(windows)]
    {
        let process_id = process_id.to_string();
        let _ = Command::new("taskkill.exe")
            .args(["/PID", process_id.as_str(), "/T", "/F"])
            .status()
            .await;
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

    pub fn status(&self, runtime: RuntimeId) -> Result<InstallState, RuntimeError> {
        self.store.status(runtime).map_err(RuntimeError::from)
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
        let _cross_process_guard = self.acquire_process_lock(runtime, &cancel).await?;
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
            if version == expected_version && self.verify_active_runtime(runtime, &cancel).await? {
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

    async fn verify_active_runtime(
        &self,
        runtime: RuntimeId,
        cancel: &CancellationToken,
    ) -> Result<bool, RuntimeError> {
        let resolved = match self.resolve(runtime) {
            Ok(resolved) => resolved,
            Err(_) => return Ok(false),
        };
        let probes: Vec<(PathBuf, String, String)> = match runtime {
            RuntimeId::Locust => {
                let Some(parent) = resolved.executable.parent() else {
                    return Ok(false);
                };
                vec![
                    (
                        parent.join(exe_name("python")),
                        "--version".into(),
                        RuntimeManifest::locust().python_version.into(),
                    ),
                    (
                        resolved.executable.clone(),
                        "--version".into(),
                        RuntimeManifest::locust().locust_version.into(),
                    ),
                ]
            }
            RuntimeId::Goose => {
                let Some(parent) = resolved.executable.parent() else {
                    return Ok(false);
                };
                vec![
                    (
                        resolved.executable.clone(),
                        "--version".into(),
                        RuntimeManifest::goose().rust_toolchain.into(),
                    ),
                    (
                        parent.join(exe_name("rustc")),
                        "--version".into(),
                        RuntimeManifest::goose().rust_toolchain.into(),
                    ),
                ]
            }
            RuntimeId::K6 => {
                let artifact = RuntimeManifest::artifact(ArtifactId::K6, self.platform)
                    .map_err(|_| RuntimeError::UnsupportedPlatform)?;
                vec![(
                    resolved.executable.clone(),
                    "version".into(),
                    artifact.version.into(),
                )]
            }
        };
        for (program, flag, expected) in probes {
            match self
                .probe_version(
                    &program,
                    &resolved.env,
                    &flag,
                    &expected,
                    cancel.child_token(),
                )
                .await
            {
                Ok(()) => {}
                Err(InstallError::Cancelled) => return Err(InstallError::Cancelled.into()),
                Err(_) => return Ok(false),
            }
        }
        Ok(true)
    }

    async fn acquire_process_lock(
        &self,
        runtime: RuntimeId,
        cancel: &CancellationToken,
    ) -> Result<File, RuntimeError> {
        let runtime_dir = self.runtime_dir(runtime);
        tokio::fs::create_dir_all(&runtime_dir)
            .await
            .map_err(InstallError::from)?;
        let lock_path = runtime_dir.join("install.lock");
        let file = OpenOptions::new()
            .create(true)
            .read(true)
            .write(true)
            .open(lock_path)
            .map_err(InstallError::from)?;
        loop {
            match fs2::FileExt::try_lock_exclusive(&file) {
                Ok(()) => return Ok(file),
                Err(error) if is_lock_contention(&error) => {
                    tokio::select! {
                        _ = cancel.cancelled() => return Err(InstallError::Cancelled.into()),
                        _ = tokio::time::sleep(std::time::Duration::from_millis(100)) => {}
                    }
                }
                Err(error) => {
                    return Err(InstallError::Store(format!(
                        "runtime install lock failed: {error}"
                    ))
                    .into())
                }
            }
        }
    }

    fn remove_incomplete_version(&self, runtime: RuntimeId, version: &str) {
        let versions = self.runtime_dir(runtime).join("versions");
        let active_executable = match self.store.status(runtime) {
            Ok(InstallState::Ready {
                version: active_version,
                path,
            }) if active_version == version => Some(PathBuf::from(path)),
            _ => None,
        };
        let Ok(entries) = std::fs::read_dir(&versions) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if !entry.file_name().to_string_lossy().starts_with(version) {
                continue;
            }
            if active_executable
                .as_ref()
                .is_some_and(|executable| executable.starts_with(&path))
            {
                continue;
            }
            match std::fs::symlink_metadata(&path) {
                Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => {
                    let _ = std::fs::remove_dir_all(path);
                }
                Ok(_) => {
                    let _ = std::fs::remove_file(path);
                }
                Err(_) => {}
            }
        }
    }

    async fn provision_locust(
        &self,
        stage: &Path,
        progress: Option<tokio::sync::mpsc::UnboundedSender<DownloadProgress>>,
        cancel: CancellationToken,
    ) -> Result<InstallState, InstallError> {
        let pin = RuntimeManifest::locust();
        let version = format!("{}-locust-{}", pin.python_build, pin.locust_version);
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

        let version_dir =
            runtime_dir
                .join("versions")
                .join(format!("{}-{}", version, uuid::Uuid::new_v4()));
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
        env.insert(
            "UV_PYTHON_BIN_DIR".into(),
            python_home.join("bin").to_string_lossy().into_owned(),
        );
        env.insert(
            "UV_CACHE_DIR".into(),
            runtime_dir.join("cache").to_string_lossy().into_owned(),
        );
        let uv_temp = runtime_dir.join("tmp");
        tokio::fs::create_dir_all(&uv_temp).await?;
        env.insert("TMPDIR".into(), uv_temp.to_string_lossy().into_owned());
        env.insert("TMP".into(), uv_temp.to_string_lossy().into_owned());
        env.insert("TEMP".into(), uv_temp.to_string_lossy().into_owned());
        env.insert("UV_PYTHON_INSTALL_REGISTRY".into(), "0".into());
        self.run_checked(
            &uv_path,
            &[
                "--no-config".into(),
                "python".into(),
                "install".into(),
                pin.python_build.into(),
                "--managed-python".into(),
                "--no-bin".into(),
                "--no-registry".into(),
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
                "--no-config".into(),
                "venv".into(),
                "--python".into(),
                pin.python_build.into(),
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
                "--no-config".into(),
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
        let runtime_dir = self.runtime_dir(RuntimeId::Goose);
        let attempt_dir = runtime_dir.join("versions").join(format!(
            "{}-{}",
            pin.rust_toolchain,
            uuid::Uuid::new_v4()
        ));
        let rustup_home = attempt_dir.join("rustup");
        let cargo_home = attempt_dir.join("cargo");
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
            ("RUSTUP_TOOLCHAIN".into(), pin.rust_toolchain.into()),
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
        let linker_source = stage.join("loom-linker-check.rs");
        let linker_output = stage.join(exe_name("loom-linker-check"));
        tokio::fs::write(&linker_source, "fn main() {}\n").await?;
        let link_result = self
            .run_checked(
                &rustc,
                &[
                    "--edition=2021".into(),
                    linker_source.to_string_lossy().into_owned(),
                    "-o".into(),
                    linker_output.to_string_lossy().into_owned(),
                ],
                &env,
                cancel.child_token(),
            )
            .await;
        if let Err(error) = link_result {
            if matches!(error, InstallError::Cancelled) {
                return Err(error);
            }
            return Err(InstallError::Process(format!(
                "Rust is installed, but Goose cannot build because native linker prerequisites are missing or misconfigured. Install the platform's compiler/linker components (MSVC + Windows SDK, Xcode Command Line Tools, or a Linux C toolchain), then retry. Details: {error}"
            )));
        }
        if !linker_output.is_file() {
            return Err(InstallError::Process(
                "Rust compiler exited successfully but produced no linker-check executable; Goose cannot be marked Ready".into(),
            ));
        }
        self.store.activate_existing(
            RuntimeId::Goose,
            &attempt_dir,
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
        let runtime_dir = self.runtime_dir(RuntimeId::K6);
        let version_dir =
            runtime_dir
                .join("versions")
                .join(format!("{}-{}", version, uuid::Uuid::new_v4()));
        tokio::fs::create_dir_all(&version_dir).await?;
        let installed_executable = version_dir.join(exe_name("k6"));
        tokio::fs::copy(&executable, &installed_executable).await?;
        set_executable(&installed_executable)?;
        self.store.activate_existing(
            RuntimeId::K6,
            &version_dir,
            RuntimeMetadata {
                version,
                executable_path: path_from_runtime(&runtime_dir, &installed_executable)?,
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
                    let executable = PathBuf::from(&path);
                    let cargo_home = executable
                        .parent()
                        .and_then(Path::parent)
                        .ok_or(RuntimeError::Missing)?;
                    let toolchain_home = cargo_home.parent().ok_or(RuntimeError::Missing)?;
                    env.insert(
                        "RUSTUP_HOME".into(),
                        toolchain_home.join("rustup").to_string_lossy().into_owned(),
                    );
                    env.insert(
                        "CARGO_HOME".into(),
                        cargo_home.to_string_lossy().into_owned(),
                    );
                    env.insert("RUSTUP_TOOLCHAIN".into(), version.clone());
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

fn is_lock_contention(error: &std::io::Error) -> bool {
    error.kind() == ErrorKind::WouldBlock
        || (cfg!(windows) && matches!(error.raw_os_error(), Some(32 | 33)))
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

fn inherit_environment_key(key: &str) -> bool {
    let key = key.to_ascii_uppercase();
    if key.starts_with("UV_")
        || key.starts_with("RUSTUP_")
        || key.starts_with("CARGO_")
        || key.starts_with("PYTHON")
        || key.starts_with("PIP_")
    {
        return false;
    }
    matches!(
        key.as_str(),
        "PATH"
            | "HOME"
            | "USERPROFILE"
            | "APPDATA"
            | "LOCALAPPDATA"
            | "SYSTEMROOT"
            | "WINDIR"
            | "SYSTEMDRIVE"
            | "HOMEDRIVE"
            | "HOMEPATH"
            | "TEMP"
            | "TMP"
            | "TMPDIR"
            | "HTTP_PROXY"
            | "HTTPS_PROXY"
            | "ALL_PROXY"
            | "NO_PROXY"
            | "SSL_CERT_FILE"
            | "SSL_CERT_DIR"
            | "LANG"
            | "LC_ALL"
            | "LC_CTYPE"
            | "TERM"
    ) || key.starts_with("LC_")
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

    #[test]
    fn child_environment_filters_runtime_and_registry_overrides_but_keeps_platform_access() {
        assert!(!inherit_environment_key("UV_PYTHON_DOWNLOADS_JSON_URL"));
        assert!(!inherit_environment_key("UV_INDEX_URL"));
        assert!(!inherit_environment_key("RUSTUP_DIST_SERVER"));
        assert!(!inherit_environment_key("RUSTUP_TOOLCHAIN"));
        assert!(!inherit_environment_key("CARGO_HOME"));
        assert!(inherit_environment_key("PATH"));
        assert!(inherit_environment_key("SystemRoot"));
        assert!(inherit_environment_key("HTTPS_PROXY"));
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn cancelling_a_process_also_terminates_its_child_processes() {
        let root = tempdir().unwrap();
        let pid_file = root.path().join("child.pid");
        let script = format!("sleep 30 & echo $! > '{}' ; wait", pid_file.display());
        let cancellation = CancellationToken::new();
        let runner = Arc::new(NativeProcessRunner);
        let process_cancel = cancellation.clone();
        let task = tokio::spawn(async move {
            runner
                .run(
                    Path::new("/bin/sh"),
                    &["-c".into(), script],
                    &BTreeMap::new(),
                    process_cancel,
                )
                .await
        });
        tokio::time::timeout(std::time::Duration::from_secs(3), async {
            while !pid_file.exists() {
                tokio::time::sleep(std::time::Duration::from_millis(10)).await;
            }
        })
        .await
        .unwrap();
        let child_pid: i32 = std::fs::read_to_string(&pid_file)
            .unwrap()
            .trim()
            .parse()
            .unwrap();
        cancellation.cancel();
        assert!(matches!(task.await.unwrap(), Err(InstallError::Cancelled)));
        let mut terminated = false;
        for _ in 0..100 {
            if unsafe { libc::kill(child_pid, 0) } != 0 {
                terminated = true;
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }
        if !terminated {
            unsafe {
                libc::kill(child_pid, libc::SIGKILL);
            }
        }
        assert!(terminated, "cancelled process left its child running");
    }

    #[cfg(windows)]
    #[tokio::test]
    async fn cancelling_a_windows_process_tree_terminates_its_child_processes() {
        let root = tempdir().unwrap();
        let pid_file = root.path().join("child.pid");
        let script = format!(
            "$child = Start-Process -FilePath powershell.exe -ArgumentList @('-NoProfile','-Command','Start-Sleep -Seconds 30') -PassThru; $child.Id | Set-Content -LiteralPath '{}'; Wait-Process -Id $child.Id",
            pid_file.display()
        );
        let cancellation = CancellationToken::new();
        let runner = Arc::new(NativeProcessRunner);
        let process_cancel = cancellation.clone();
        let task = tokio::spawn(async move {
            runner
                .run(
                    Path::new("powershell.exe"),
                    &["-NoProfile".into(), "-Command".into(), script],
                    &BTreeMap::new(),
                    process_cancel,
                )
                .await
        });
        tokio::time::timeout(std::time::Duration::from_secs(8), async {
            while !pid_file.exists() {
                tokio::time::sleep(std::time::Duration::from_millis(20)).await;
            }
        })
        .await
        .unwrap();
        let child_pid: u32 = std::fs::read_to_string(&pid_file)
            .unwrap()
            .trim()
            .parse()
            .unwrap();
        cancellation.cancel();
        assert!(matches!(task.await.unwrap(), Err(InstallError::Cancelled)));
        let query = tokio::process::Command::new("tasklist.exe")
            .args(["/FI", &format!("PID eq {child_pid}"), "/FO", "CSV", "/NH"])
            .output()
            .await
            .unwrap();
        let output = String::from_utf8_lossy(&query.stdout);
        assert!(
            !output.contains(&child_pid.to_string()),
            "cancelled installer left child process {child_pid} running"
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
