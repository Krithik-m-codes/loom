use flate2::write::GzEncoder;
use flate2::Compression;
use runtime_manager::{
    extract_verified, extract_verified_with_cancel, ArchiveFormat, InstallError,
};
use std::fs;
use std::io::{Cursor, Write};
use tar::{Builder, EntryType, Header};
use tempfile::tempdir;
use zip::write::SimpleFileOptions;

fn tar_gz_entry(path: &str, kind: EntryType, bytes: &[u8]) -> Vec<u8> {
    let encoder = GzEncoder::new(Vec::new(), Compression::default());
    let mut archive = Builder::new(encoder);
    let mut header = Header::new_gnu();
    header.set_entry_type(kind);
    header.set_mode(0o755);
    header.set_size(bytes.len() as u64);
    assert!(path.len() <= 100);
    header.as_mut_bytes()[..path.len()].copy_from_slice(path.as_bytes());
    header.set_cksum();
    archive.append(&header, Cursor::new(bytes)).unwrap();
    archive.into_inner().unwrap().finish().unwrap()
}

fn zip_entry(path: &str, bytes: &[u8]) -> Vec<u8> {
    let cursor = Cursor::new(Vec::new());
    let mut archive = zip::ZipWriter::new(cursor);
    archive
        .start_file(path, SimpleFileOptions::default())
        .unwrap();
    archive.write_all(bytes).unwrap();
    archive.finish().unwrap().into_inner()
}

#[test]
fn extracts_regular_tar_files_inside_staging() {
    let dir = tempdir().unwrap();
    let archive = dir.path().join("valid.tar.gz");
    fs::write(
        &archive,
        tar_gz_entry("bin/uv", EntryType::Regular, b"tool"),
    )
    .unwrap();
    let staging = dir.path().join("stage");

    extract_verified(&archive, ArchiveFormat::TarGz, &staging).unwrap();

    assert_eq!(fs::read(staging.join("bin/uv")).unwrap(), b"tool");
}

#[test]
fn rejects_tar_path_traversal_without_writing_outside_staging() {
    let dir = tempdir().unwrap();
    let archive = dir.path().join("traversal.tar.gz");
    fs::write(
        &archive,
        tar_gz_entry("../escaped", EntryType::Regular, b"bad"),
    )
    .unwrap();
    let staging = dir.path().join("stage");

    assert!(extract_verified(&archive, ArchiveFormat::TarGz, &staging).is_err());
    assert!(!dir.path().join("escaped").exists());
}

#[test]
fn rejects_absolute_archive_paths() {
    let dir = tempdir().unwrap();
    let archive = dir.path().join("absolute.tar.gz");
    fs::write(
        &archive,
        tar_gz_entry("/rooted", EntryType::Regular, b"bad"),
    )
    .unwrap();

    assert!(extract_verified(&archive, ArchiveFormat::TarGz, &dir.path().join("stage")).is_err());
}

#[test]
fn rejects_tar_symlinks() {
    let dir = tempdir().unwrap();
    let archive = dir.path().join("link.tar.gz");
    fs::write(
        &archive,
        tar_gz_entry("bin/uv", EntryType::Symlink, b"../../outside"),
    )
    .unwrap();

    assert!(extract_verified(&archive, ArchiveFormat::TarGz, &dir.path().join("stage")).is_err());
}

#[test]
fn rejects_zip_path_traversal() {
    let dir = tempdir().unwrap();
    let archive = dir.path().join("traversal.zip");
    fs::write(&archive, zip_entry("../escaped", b"bad")).unwrap();
    let staging = dir.path().join("stage");

    assert!(extract_verified(&archive, ArchiveFormat::Zip, &staging).is_err());
    assert!(!dir.path().join("escaped").exists());
}

#[test]
fn cancellation_during_archive_extraction_stops_writes() {
    let dir = tempdir().unwrap();
    let archive = dir.path().join("valid.tar.gz");
    fs::write(
        &archive,
        tar_gz_entry("bin/tool", EntryType::Regular, b"tool"),
    )
    .unwrap();
    let staging = dir.path().join("stage");
    let cancel = tokio_util::sync::CancellationToken::new();
    cancel.cancel();

    let error = extract_verified_with_cancel(&archive, ArchiveFormat::TarGz, &staging, &cancel)
        .unwrap_err();

    assert!(matches!(error, InstallError::Cancelled));
    assert!(!staging.join("bin/tool").exists());
}
