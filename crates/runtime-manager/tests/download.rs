use runtime_manager::{ArchiveFormat, Artifact, Downloader, RuntimeId};
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::Path;
use std::thread;
use std::time::Duration;
use tempfile::tempdir;
use tokio_util::sync::CancellationToken;

fn artifact(url: &'static str, checksum: &'static str) -> Artifact {
    Artifact {
        version: "test",
        url,
        sha256: checksum,
        archive_format: ArchiveFormat::Executable,
        executable_path: "tool",
        license: "MIT",
        upstream: "local test fixture",
    }
}

fn serve(response: Vec<u8>, delay_ms: u64) -> (String, std::sync::mpsc::Receiver<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let (requested_tx, requested_rx) = std::sync::mpsc::channel();
    thread::spawn(move || {
        let (mut socket, _) = listener.accept().unwrap();
        let mut request = [0u8; 2048];
        let _ = socket.read(&mut request);
        let _ = requested_tx.send(());
        thread::sleep(Duration::from_millis(delay_ms));
        let _ = socket.write_all(&response);
        let _ = socket.flush();
    });
    (format!("http://{address}/asset"), requested_rx)
}

fn response(status: &str, body: &[u8], content_length: Option<usize>) -> Vec<u8> {
    let mut bytes = format!("HTTP/1.1 {status}\r\nConnection: close\r\n").into_bytes();
    if let Some(length) = content_length {
        bytes.extend_from_slice(format!("Content-Length: {length}\r\n").as_bytes());
    }
    bytes.extend_from_slice(b"\r\n");
    bytes.extend_from_slice(body);
    bytes
}

fn checksum(bytes: &[u8]) -> &'static str {
    Box::leak(format!("{:x}", Sha256::digest(bytes)).into_boxed_str())
}

async fn fetch(
    url: &'static str,
    sha: &'static str,
    root: &Path,
) -> Result<std::path::PathBuf, runtime_manager::InstallError> {
    Downloader::new()
        .fetch(
            &artifact(url, sha),
            root,
            RuntimeId::Locust,
            CancellationToken::new(),
            |_| {},
        )
        .await
}

#[tokio::test]
async fn downloads_and_verifies_bytes_without_content_length() {
    let body = b"verified runtime";
    let (url, _) = serve(response("200 OK", body, None), 0);
    let url = Box::leak(url.into_boxed_str());
    let dir = tempdir().unwrap();

    let path = fetch(url, checksum(body), dir.path()).await.unwrap();

    assert_eq!(std::fs::read(path).unwrap(), body);
}

#[tokio::test]
async fn rejects_checksum_mismatch_and_removes_partial_file() {
    let (url, _) = serve(response("200 OK", b"wrong", Some(5)), 0);
    let url = Box::leak(url.into_boxed_str());
    let dir = tempdir().unwrap();

    assert!(fetch(
        url,
        "0000000000000000000000000000000000000000000000000000000000000000",
        dir.path()
    )
    .await
    .is_err());
    assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 0);
}

#[tokio::test]
async fn rejects_http_error_status() {
    let (url, _) = serve(response("404 Not Found", b"missing", Some(7)), 0);
    let url = Box::leak(url.into_boxed_str());
    let dir = tempdir().unwrap();

    assert!(fetch(url, checksum(b"missing"), dir.path()).await.is_err());
}

#[tokio::test]
async fn rejects_interrupted_content_length() {
    let (url, _) = serve(response("200 OK", b"short", Some(50)), 0);
    let url = Box::leak(url.into_boxed_str());
    let dir = tempdir().unwrap();

    assert!(fetch(url, checksum(b"short"), dir.path()).await.is_err());
    assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 0);
}

#[tokio::test]
async fn cancellation_removes_incomplete_download() {
    let body = vec![b'x'; 1024 * 1024];
    let (url, requested) = serve(response("200 OK", &body, Some(body.len())), 300);
    let url = Box::leak(url.into_boxed_str());
    let dir = tempdir().unwrap();
    let token = CancellationToken::new();
    let cancel = token.clone();
    let root = dir.path().to_path_buf();
    let task = tokio::spawn(async move {
        Downloader::new()
            .fetch(
                &artifact(url, checksum(&body)),
                &root,
                RuntimeId::Locust,
                cancel,
                |_| {},
            )
            .await
    });
    tokio::task::spawn_blocking(move || requested.recv().unwrap())
        .await
        .unwrap();
    token.cancel();

    assert!(task.await.unwrap().is_err());
    assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 0);
}
