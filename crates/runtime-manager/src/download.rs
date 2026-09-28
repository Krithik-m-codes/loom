use crate::{Artifact, InstallError, RuntimeId};
use futures_util::StreamExt;
use reqwest::{Client, Url};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use tokio::io::AsyncWriteExt;
use tokio_util::sync::CancellationToken;

const MAX_DOWNLOAD_BYTES: u64 = 2 * 1024 * 1024 * 1024;

#[derive(Clone, Debug, Eq, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub runtime: RuntimeId,
    pub stage: String,
    pub bytes_received: u64,
    pub total_bytes: Option<u64>,
    pub message: String,
}

#[derive(Clone)]
pub struct Downloader {
    client: Client,
}

impl Default for Downloader {
    fn default() -> Self {
        Self::new()
    }
}

impl Downloader {
    pub fn new() -> Self {
        let client = Client::builder()
            .redirect(reqwest::redirect::Policy::custom(|attempt| {
                if attempt.previous().len() >= 10 || !allowed_url(attempt.url()) {
                    attempt.stop()
                } else {
                    attempt.follow()
                }
            }))
            .build()
            .expect("reqwest client configuration is valid");
        Self { client }
    }

    /// Download one immutable manifest artifact, verify its SHA-256, and leave
    /// the verified bytes in a unique file in the caller's staging directory.
    pub async fn fetch<F>(
        &self,
        artifact: &Artifact,
        staging_dir: &Path,
        runtime: RuntimeId,
        cancel: CancellationToken,
        mut progress: F,
    ) -> Result<PathBuf, InstallError>
    where
        F: FnMut(DownloadProgress),
    {
        let url = Url::parse(artifact.url)
            .map_err(|error| InstallError::Download(format!("invalid manifest URL: {error}")))?;
        if !allowed_url(&url) {
            return Err(InstallError::Download(
                "runtime artifact URL must use HTTPS".to_string(),
            ));
        }
        if artifact.sha256.len() != 64
            || !artifact.sha256.bytes().all(|byte| byte.is_ascii_hexdigit())
        {
            return Err(InstallError::Download(
                "manifest contains an invalid SHA-256 checksum".to_string(),
            ));
        }
        tokio::fs::create_dir_all(staging_dir).await?;
        let metadata = tokio::fs::symlink_metadata(staging_dir).await?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err(InstallError::UnsafePath(staging_dir.display().to_string()));
        }
        let root = tokio::fs::canonicalize(staging_dir).await?;
        let path = root.join(format!("{}.download", uuid::Uuid::new_v4()));
        let result = self
            .download_to_file(artifact, &url, &path, runtime, cancel, &mut progress)
            .await;
        if result.is_err() {
            let _ = tokio::fs::remove_file(&path).await;
        }
        result.map(|()| path)
    }

    async fn download_to_file<F>(
        &self,
        artifact: &Artifact,
        url: &Url,
        path: &Path,
        runtime: RuntimeId,
        cancel: CancellationToken,
        progress: &mut F,
    ) -> Result<(), InstallError>
    where
        F: FnMut(DownloadProgress),
    {
        if cancel.is_cancelled() {
            return Err(InstallError::Cancelled);
        }
        let request = self.client.get(url.clone()).send();
        let response = tokio::select! {
            _ = cancel.cancelled() => return Err(InstallError::Cancelled),
            response = request => response.map_err(|error| InstallError::Download(error.to_string()))?,
        };
        if !response.status().is_success() {
            return Err(InstallError::Download(format!(
                "upstream returned HTTP {}",
                response.status()
            )));
        }
        let total_bytes = response.content_length();
        if total_bytes.is_some_and(|size| size > MAX_DOWNLOAD_BYTES) {
            return Err(InstallError::SizeLimit);
        }
        let mut stream = response.bytes_stream();
        let mut file = tokio::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(path)
            .await?;
        let mut hasher = Sha256::new();
        let mut bytes_received = 0u64;
        progress(DownloadProgress {
            runtime,
            stage: "download".to_string(),
            bytes_received,
            total_bytes,
            message: format!("Downloading {} {}", runtime_name(runtime), artifact.version),
        });
        loop {
            let next = tokio::select! {
                _ = cancel.cancelled() => return Err(InstallError::Cancelled),
                item = stream.next() => item,
            };
            let Some(chunk) = next else { break };
            let chunk = chunk.map_err(|error| InstallError::Download(error.to_string()))?;
            bytes_received = bytes_received
                .checked_add(chunk.len() as u64)
                .ok_or(InstallError::SizeLimit)?;
            if bytes_received > MAX_DOWNLOAD_BYTES
                || total_bytes.is_some_and(|total| bytes_received > total)
            {
                return Err(InstallError::SizeLimit);
            }
            hasher.update(&chunk);
            file.write_all(&chunk).await?;
            progress(DownloadProgress {
                runtime,
                stage: "download".to_string(),
                bytes_received,
                total_bytes,
                message: format!("Downloaded {bytes_received} bytes"),
            });
        }
        if cancel.is_cancelled() {
            return Err(InstallError::Cancelled);
        }
        if let Some(total) = total_bytes {
            if bytes_received != total {
                return Err(InstallError::Download(
                    "upstream response ended before the declared content length".to_string(),
                ));
            }
        }
        let actual = format!("{:x}", hasher.finalize());
        if !actual.eq_ignore_ascii_case(artifact.sha256) {
            return Err(InstallError::ChecksumMismatch);
        }
        file.flush().await?;
        file.sync_all().await?;
        Ok(())
    }
}

fn allowed_url(url: &Url) -> bool {
    url.scheme() == "https"
        || (url.scheme() == "http"
            && url
                .host_str()
                .is_some_and(|host| host == "localhost" || host == "127.0.0.1" || host == "[::1]"))
}

fn runtime_name(runtime: RuntimeId) -> &'static str {
    match runtime {
        RuntimeId::Locust => "Locust",
        RuntimeId::Goose => "Goose",
        RuntimeId::K6 => "k6",
    }
}
