use anyhow::{Context, Result};
use futures_util::StreamExt;
use std::io::Write;
use std::path::Path;
use std::sync::Arc;
use tokio::sync::Notify;

/// Streams and downloads the URL to the `dest` path.
///
/// - Writes to a `.part` temporary file and renames it atomically upon completion.
/// - If `cancel` is Some, aborts immediately when cancellation is notified.
/// - `on_progress(downloaded_bytes, total_bytes)` — total is 0 if unknown.
pub async fn download_file(
    url: &str,
    dest: &Path,
    cancel: Option<Arc<Notify>>,
    on_progress: impl Fn(u64, u64) + Send + 'static,
) -> Result<()> {
    let parent = dest.parent().context("Model path parent directory not found")?;
    std::fs::create_dir_all(parent).context("Failed to create model directory")?;

    let part_path = {
        let mut s = dest.to_string_lossy().into_owned();
        s.push_str(".part");
        std::path::PathBuf::from(s)
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(7200))
        .connect_timeout(std::time::Duration::from_secs(30))
        .build()
        .context("Failed to build HTTP client")?;

    let resp = client
        .get(url)
        .send()
        .await
        .with_context(|| format!("HTTP request failed: {url}"))?;

    if !resp.status().is_success() {
        return Err(anyhow::anyhow!("HTTP {}: {url}", resp.status()));
    }

    let total = resp.content_length().unwrap_or(0);
    let mut downloaded = 0u64;
    let mut file = std::fs::File::create(&part_path).context("Failed to create part file")?;
    let mut stream = resp.bytes_stream();
    let mut cancelled = false;

    loop {
        let chunk = if let Some(cn) = &cancel {
            tokio::select! {
                biased;
                _ = cn.notified() => { cancelled = true; break; }
                c = stream.next() => c,
            }
        } else {
            stream.next().await
        };

        match chunk {
            Some(Ok(bytes)) => {
                file.write_all(&bytes).context("Failed to write file")?;
                downloaded += bytes.len() as u64;
                on_progress(downloaded, total);
            }
            Some(Err(e)) => {
                drop(file);
                let _ = std::fs::remove_file(&part_path);
                return Err(anyhow::anyhow!("Download error: {e}"));
            }
            None => break,
        }
    }

    drop(file);

    if cancelled {
        let _ = std::fs::remove_file(&part_path);
        return Err(anyhow::anyhow!("Download cancelled."));
    }

    std::fs::rename(&part_path, dest).context("Failed to rename/move file")?;
    Ok(())
}
