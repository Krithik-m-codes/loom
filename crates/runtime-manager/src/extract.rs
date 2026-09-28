use crate::ArchiveFormat;
use flate2::read::GzDecoder;
use std::collections::HashSet;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Component, Path, PathBuf};
use thiserror::Error;
use tokio_util::sync::CancellationToken;
use zip::ZipArchive;

const MAX_ENTRIES: usize = 100_000;
const MAX_EXPANDED_BYTES: u64 = 2 * 1024 * 1024 * 1024;

#[derive(Debug, Error)]
pub enum InstallError {
    #[error("runtime archive I/O failed: {0}")]
    Io(#[from] io::Error),
    #[error("runtime archive is invalid: {0}")]
    Archive(String),
    #[error("runtime archive contains an unsafe path: {0}")]
    UnsafePath(String),
    #[error("runtime archive contains an unsupported link or file type: {0}")]
    UnsupportedEntry(String),
    #[error("runtime archive expands beyond the safety limit")]
    SizeLimit,
    #[error("runtime installation was cancelled")]
    Cancelled,
    #[error("runtime download failed: {0}")]
    Download(String),
    #[error("runtime download checksum did not match the pinned manifest")]
    ChecksumMismatch,
    #[error("runtime store operation failed: {0}")]
    Store(String),
    #[error("runtime process failed: {0}")]
    Process(String),
}

/// Extract a checksum-verified archive into a fresh staging directory.
/// Existing files are never overwritten. Links and special files are rejected.
pub fn extract_verified(
    archive_path: &Path,
    format: ArchiveFormat,
    staging_dir: &Path,
) -> Result<(), InstallError> {
    extract_verified_with_cancel(archive_path, format, staging_dir, &CancellationToken::new())
}

pub fn extract_verified_with_cancel(
    archive_path: &Path,
    format: ArchiveFormat,
    staging_dir: &Path,
    cancel: &CancellationToken,
) -> Result<(), InstallError> {
    if cancel.is_cancelled() {
        return Err(InstallError::Cancelled);
    }
    fs::create_dir_all(staging_dir)?;
    let root_meta = fs::symlink_metadata(staging_dir)?;
    if root_meta.file_type().is_symlink() || !root_meta.is_dir() {
        return Err(InstallError::UnsafePath(staging_dir.display().to_string()));
    }
    let root = fs::canonicalize(staging_dir)?;

    match format {
        ArchiveFormat::TarGz => extract_tar_gz(archive_path, &root, cancel),
        ArchiveFormat::Zip => extract_zip(archive_path, &root, cancel),
        ArchiveFormat::Executable => extract_executable(archive_path, &root, cancel),
    }
}

pub(crate) fn checked_relative(path: &Path) -> Result<PathBuf, InstallError> {
    let mut clean = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(part) => {
                let text = part.to_string_lossy();
                if text.contains(':') || text.contains('\\') || text.contains('\0') {
                    return Err(InstallError::UnsafePath(path.display().to_string()));
                }
                clean.push(part);
            }
            Component::CurDir => {}
            Component::RootDir | Component::Prefix(_) | Component::ParentDir => {
                return Err(InstallError::UnsafePath(path.display().to_string()));
            }
        }
    }
    if clean.as_os_str().is_empty() {
        return Err(InstallError::UnsafePath(path.display().to_string()));
    }
    Ok(clean)
}

fn ensure_parent_dirs(root: &Path, relative: &Path) -> Result<PathBuf, InstallError> {
    let parent = relative.parent().unwrap_or_else(|| Path::new(""));
    let mut cursor = root.to_path_buf();
    for part in parent.components() {
        let Component::Normal(name) = part else {
            return Err(InstallError::UnsafePath(relative.display().to_string()));
        };
        cursor.push(name);
        match fs::symlink_metadata(&cursor) {
            Ok(meta) if meta.is_dir() && !meta.file_type().is_symlink() => {}
            Ok(_) => return Err(InstallError::UnsafePath(cursor.display().to_string())),
            Err(error) if error.kind() == io::ErrorKind::NotFound => fs::create_dir(&cursor)?,
            Err(error) => return Err(error.into()),
        }
    }
    Ok(cursor.join(relative.file_name().unwrap_or_default()))
}

fn create_directory(root: &Path, relative: &Path) -> Result<(), InstallError> {
    let mut cursor = root.to_path_buf();
    for part in relative.components() {
        let Component::Normal(name) = part else {
            return Err(InstallError::UnsafePath(relative.display().to_string()));
        };
        cursor.push(name);
        match fs::symlink_metadata(&cursor) {
            Ok(meta) if meta.is_dir() && !meta.file_type().is_symlink() => {}
            Ok(_) => return Err(InstallError::UnsafePath(cursor.display().to_string())),
            Err(error) if error.kind() == io::ErrorKind::NotFound => fs::create_dir(&cursor)?,
            Err(error) => return Err(error.into()),
        }
    }
    Ok(())
}

fn write_file<R: Read>(
    root: &Path,
    relative: &Path,
    reader: &mut R,
    expected_size: u64,
    mode: Option<u32>,
    cancel: &CancellationToken,
) -> Result<u64, InstallError> {
    if expected_size > MAX_EXPANDED_BYTES {
        return Err(InstallError::SizeLimit);
    }
    let target = ensure_parent_dirs(root, relative)?;
    let mut output = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&target)?;
    let mut limited = reader.take(expected_size.saturating_add(1));
    let mut written = 0u64;
    let mut buffer = [0u8; 64 * 1024];
    loop {
        if cancel.is_cancelled() {
            return Err(InstallError::Cancelled);
        }
        let count = limited.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        output.write_all(&buffer[..count])?;
        written += count as u64;
    }
    if written != expected_size {
        return Err(InstallError::Archive(format!(
            "entry {} had an unexpected expanded size",
            relative.display()
        )));
    }
    output.flush()?;
    set_mode(&target, mode)?;
    Ok(written)
}

fn extract_tar_gz(
    path: &Path,
    root: &Path,
    cancel: &CancellationToken,
) -> Result<(), InstallError> {
    let input = File::open(path)?;
    let mut archive = tar::Archive::new(GzDecoder::new(input));
    let mut seen = HashSet::new();
    let mut total = 0u64;
    let entries = archive
        .entries()
        .map_err(|error| InstallError::Archive(error.to_string()))?;
    for entry in entries {
        if cancel.is_cancelled() {
            return Err(InstallError::Cancelled);
        }
        let mut entry = entry.map_err(|error| InstallError::Archive(error.to_string()))?;
        if seen.len() >= MAX_ENTRIES {
            return Err(InstallError::SizeLimit);
        }
        let entry_path = entry
            .path()
            .map_err(|error| InstallError::Archive(error.to_string()))?
            .into_owned();
        let relative = checked_relative(&entry_path)?;
        if !seen.insert(relative.clone()) {
            return Err(InstallError::Archive(format!(
                "duplicate entry {}",
                relative.display()
            )));
        }
        let kind = entry.header().entry_type();
        if kind.is_dir() {
            create_directory(root, &relative)?;
        } else if kind.is_file() {
            let size = entry
                .header()
                .size()
                .map_err(|error| InstallError::Archive(error.to_string()))?;
            total = total.checked_add(size).ok_or(InstallError::SizeLimit)?;
            if total > MAX_EXPANDED_BYTES {
                return Err(InstallError::SizeLimit);
            }
            let mode = entry
                .header()
                .mode()
                .map_err(|error| InstallError::Archive(error.to_string()))?;
            write_file(root, &relative, &mut entry, size, Some(mode), cancel)?;
        } else {
            return Err(InstallError::UnsupportedEntry(
                relative.display().to_string(),
            ));
        }
    }
    Ok(())
}

fn extract_zip(path: &Path, root: &Path, cancel: &CancellationToken) -> Result<(), InstallError> {
    let input = File::open(path)?;
    let mut archive =
        ZipArchive::new(input).map_err(|error| InstallError::Archive(error.to_string()))?;
    let mut seen = HashSet::new();
    let mut total = 0u64;
    for index in 0..archive.len() {
        if cancel.is_cancelled() {
            return Err(InstallError::Cancelled);
        }
        if index >= MAX_ENTRIES {
            return Err(InstallError::SizeLimit);
        }
        let mut entry = archive
            .by_index(index)
            .map_err(|error| InstallError::Archive(error.to_string()))?;
        let path_text = entry.name().to_string();
        let relative = checked_relative(Path::new(&path_text))?;
        if !seen.insert(relative.clone()) {
            return Err(InstallError::Archive(format!(
                "duplicate entry {}",
                relative.display()
            )));
        }
        if let Some(mode) = entry.unix_mode() {
            let file_type = mode & 0o170000;
            if file_type != 0 && file_type != 0o100000 && file_type != 0o040000 {
                return Err(InstallError::UnsupportedEntry(
                    relative.display().to_string(),
                ));
            }
        }
        if entry.is_dir() {
            create_directory(root, &relative)?;
            continue;
        }
        let size = entry.size();
        total = total.checked_add(size).ok_or(InstallError::SizeLimit)?;
        if total > MAX_EXPANDED_BYTES {
            return Err(InstallError::SizeLimit);
        }
        let mode = entry.unix_mode();
        write_file(root, &relative, &mut entry, size, mode, cancel)?;
    }
    Ok(())
}

fn extract_executable(
    path: &Path,
    root: &Path,
    cancel: &CancellationToken,
) -> Result<(), InstallError> {
    let name = path
        .file_name()
        .ok_or_else(|| InstallError::UnsafePath(path.display().to_string()))?;
    let relative = checked_relative(Path::new(name))?;
    let size = fs::metadata(path)?.len();
    if size > MAX_EXPANDED_BYTES {
        return Err(InstallError::SizeLimit);
    }
    let mut input = File::open(path)?;
    write_file(root, &relative, &mut input, size, Some(0o755), cancel)?;
    Ok(())
}

#[cfg(unix)]
fn set_mode(path: &Path, mode: Option<u32>) -> io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    if let Some(mode) = mode {
        fs::set_permissions(path, fs::Permissions::from_mode(mode & 0o777))?;
    }
    Ok(())
}

#[cfg(not(unix))]
fn set_mode(_path: &Path, _mode: Option<u32>) -> io::Result<()> {
    Ok(())
}
