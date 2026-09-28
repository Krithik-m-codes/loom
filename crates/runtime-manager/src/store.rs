use crate::extract::checked_relative;
use crate::{InstallError, InstallState, RuntimeId};
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct RuntimeMetadata {
    pub version: String,
    pub executable_path: String,
}

#[derive(Clone, Debug)]
pub struct RuntimeStore {
    root: PathBuf,
}

impl RuntimeStore {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    pub fn status(&self, runtime: RuntimeId) -> Result<InstallState, InstallError> {
        let root = self.ensure_root()?;
        let active_file = self.runtime_dir(&root, runtime).join("active.json");
        let bytes = match fs::read(&active_file) {
            Ok(bytes) => bytes,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(InstallState::Missing)
            }
            Err(error) => return Err(error.into()),
        };
        let metadata: RuntimeMetadata = match serde_json::from_slice(&bytes) {
            Ok(metadata) => metadata,
            Err(error) => {
                return Ok(InstallState::Failed {
                    stage: "status".to_string(),
                    message: format!("active runtime metadata is invalid: {error}"),
                })
            }
        };
        if let Err(error) = checked_version(&metadata.version) {
            return Ok(InstallState::Failed {
                stage: "status".to_string(),
                message: error.to_string(),
            });
        }
        let executable = match checked_relative(Path::new(&metadata.executable_path)) {
            Ok(path) => self.runtime_dir(&root, runtime).join(path),
            Err(error) => {
                return Ok(InstallState::Failed {
                    stage: "status".to_string(),
                    message: error.to_string(),
                })
            }
        };
        match fs::symlink_metadata(&executable) {
            Ok(meta) if meta.is_file() && !meta.file_type().is_symlink() => {}
            Ok(_) => {
                return Ok(InstallState::Failed {
                    stage: "status".to_string(),
                    message: "managed runtime executable is not a regular file".to_string(),
                })
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(InstallState::Failed {
                    stage: "status".to_string(),
                    message: "managed runtime executable is missing".to_string(),
                })
            }
            Err(error) => return Err(error.into()),
        }
        Ok(InstallState::Ready {
            version: metadata.version,
            path: executable.to_string_lossy().into_owned(),
        })
    }

    /// Atomically publish an already verified runtime directory. `stage_dir`
    /// must be inside this store's staging directory, and the executable must
    /// be a regular file within that stage. The active pointer is written last.
    pub fn activate(
        &self,
        runtime: RuntimeId,
        stage_dir: &Path,
        metadata: RuntimeMetadata,
    ) -> Result<InstallState, InstallError> {
        let root = self.ensure_root()?;
        let staging_root = root.join("staging");
        fs::create_dir_all(&staging_root)?;
        let staging_root = fs::canonicalize(staging_root)?;
        let stage = fs::canonicalize(stage_dir)?;
        if !stage.starts_with(&staging_root) || stage == staging_root {
            return Err(InstallError::Store(
                "staging directory is outside the runtime store".to_string(),
            ));
        }
        checked_version(&metadata.version)?;
        let version = metadata.version.clone();
        let executable_relative = checked_relative(Path::new(&metadata.executable_path))?;
        let executable = stage.join(&executable_relative);
        let executable_meta = fs::symlink_metadata(&executable)?;
        if !executable_meta.is_file() || executable_meta.file_type().is_symlink() {
            return Err(InstallError::Store(
                "runtime executable must be a regular file inside staging".to_string(),
            ));
        }

        let runtime_dir = self.runtime_dir(&root, runtime);
        let version_dir = runtime_dir.join("versions").join(&version);
        fs::create_dir_all(version_dir.parent().expect("version directory has parent"))?;
        if version_dir.exists() {
            if matches!(
                self.status(runtime)?,
                InstallState::Ready { version: ref active, .. } if active == &metadata.version
            ) {
                fs::remove_dir_all(&stage)?;
                return self.status(runtime);
            }
            return Err(InstallError::Store(format!(
                "runtime version {} already exists but is not active",
                metadata.version
            )));
        }
        fs::rename(&stage, &version_dir)?;

        let active = RuntimeMetadata {
            version: metadata.version,
            executable_path: Path::new("versions")
                .join(&version)
                .join(executable_relative)
                .to_string_lossy()
                .replace('\\', "/"),
        };
        let bytes =
            serde_json::to_vec(&active).map_err(|error| InstallError::Store(error.to_string()))?;
        let temp_path = runtime_dir.join(format!("active.{}.tmp", uuid::Uuid::new_v4()));
        let active_path = runtime_dir.join("active.json");
        let write_result = (|| -> Result<(), InstallError> {
            let mut file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temp_path)?;
            file.write_all(&bytes)?;
            file.sync_all()?;
            replace_file(&temp_path, &active_path)?;
            Ok(())
        })();
        if let Err(error) = write_result {
            let _ = fs::remove_file(temp_path);
            return Err(error);
        }
        self.status(runtime)
    }

    /// Publish a runtime installed directly into its final version directory.
    /// This is needed for tools such as Python virtual environments whose
    /// generated scripts embed absolute paths and cannot safely be renamed.
    pub fn activate_existing(
        &self,
        runtime: RuntimeId,
        version_dir: &Path,
        metadata: RuntimeMetadata,
    ) -> Result<InstallState, InstallError> {
        let root = self.ensure_root()?;
        checked_version(&metadata.version)?;
        let runtime_dir = self.runtime_dir(&root, runtime);
        let versions = runtime_dir.join("versions");
        let versions = fs::canonicalize(&versions)?;
        let candidate = fs::canonicalize(version_dir)?;
        if !candidate.starts_with(&versions) || candidate == versions {
            return Err(InstallError::Store(
                "runtime version directory is outside managed versions".into(),
            ));
        }
        let relative = checked_relative(Path::new(&metadata.executable_path))?;
        let executable = runtime_dir.join(relative);
        let canonical_executable = fs::canonicalize(&executable)?;
        if !canonical_executable.starts_with(&candidate)
            || !fs::symlink_metadata(&executable)?.is_file()
            || fs::symlink_metadata(&executable)?.file_type().is_symlink()
        {
            return Err(InstallError::Store(
                "runtime executable is not a regular file within its version directory".into(),
            ));
        }
        publish_active(&runtime_dir, &metadata)?;
        self.status(runtime)
    }

    fn ensure_root(&self) -> Result<PathBuf, InstallError> {
        fs::create_dir_all(&self.root)?;
        let metadata = fs::symlink_metadata(&self.root)?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err(InstallError::UnsafePath(self.root.display().to_string()));
        }
        Ok(fs::canonicalize(&self.root)?)
    }

    fn runtime_dir(&self, root: &Path, runtime: RuntimeId) -> PathBuf {
        root.join("runtimes").join(runtime_name(runtime))
    }
}

fn publish_active(runtime_dir: &Path, metadata: &RuntimeMetadata) -> Result<(), InstallError> {
    let bytes =
        serde_json::to_vec(metadata).map_err(|error| InstallError::Store(error.to_string()))?;
    let temp_path = runtime_dir.join(format!("active.{}.tmp", uuid::Uuid::new_v4()));
    let active_path = runtime_dir.join("active.json");
    let write_result = (|| -> Result<(), InstallError> {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp_path)?;
        file.write_all(&bytes)?;
        file.sync_all()?;
        replace_file(&temp_path, &active_path)?;
        Ok(())
    })();
    if let Err(error) = write_result {
        let _ = fs::remove_file(temp_path);
        return Err(error);
    }
    Ok(())
}

fn runtime_name(runtime: RuntimeId) -> &'static str {
    match runtime {
        RuntimeId::Locust => "locust",
        RuntimeId::Goose => "goose",
        RuntimeId::K6 => "k6",
    }
}

fn checked_version(version: &str) -> Result<&str, InstallError> {
    if version.is_empty()
        || version == "."
        || version == ".."
        || !version
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'+' | b'-'))
    {
        return Err(InstallError::Store(
            "runtime version is not a safe path component".into(),
        ));
    }
    Ok(version)
}

#[cfg(unix)]
pub(crate) fn replace_file(from: &Path, to: &Path) -> Result<(), InstallError> {
    fs::rename(from, to)?;
    Ok(())
}

#[cfg(windows)]
pub(crate) fn replace_file(from: &Path, to: &Path) -> Result<(), InstallError> {
    use std::os::windows::ffi::OsStrExt;
    let from: Vec<u16> = from.as_os_str().encode_wide().chain(Some(0)).collect();
    let to: Vec<u16> = to.as_os_str().encode_wide().chain(Some(0)).collect();
    let moved = unsafe {
        windows_sys::Win32::Storage::FileSystem::MoveFileExW(
            from.as_ptr(),
            to.as_ptr(),
            windows_sys::Win32::Storage::FileSystem::MOVEFILE_REPLACE_EXISTING
                | windows_sys::Win32::Storage::FileSystem::MOVEFILE_WRITE_THROUGH,
        )
    };
    if moved == 0 {
        return Err(std::io::Error::last_os_error().into());
    }
    Ok(())
}
