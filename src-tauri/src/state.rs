use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::types::TranscriptResult;

pub struct ResultEntry {
    pub original_result: TranscriptResult,
    pub current_result: TranscriptResult,
    pub source_path: String,
}

/// A handle representing cancellation requests. Allows async waiting with `tokio::sync::Notify`,
/// and quick cancellation checks in synchronous contexts using `std::sync::atomic::AtomicBool`.
#[derive(Clone)]
pub struct CancelHandle {
    notify: Arc<tokio::sync::Notify>,
    flag: Arc<AtomicBool>,
}

impl Default for CancelHandle {
    fn default() -> Self {
        Self::new()
    }
}

impl CancelHandle {
    pub fn new() -> Self {
        Self {
            notify: Arc::new(tokio::sync::Notify::new()),
            flag: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn cancel(&self) {
        self.flag.store(true, Ordering::Relaxed);
        self.notify.notify_one();
    }

    pub fn is_cancelled(&self) -> bool {
        self.flag.load(Ordering::Relaxed)
    }

    pub async fn notified(&self) {
        self.notify.notified().await;
    }

    pub fn as_notify(&self) -> Arc<tokio::sync::Notify> {
        self.notify.clone()
    }
}

pub struct AppState {
    /// Directory where Whisper / align models are stored (models/ subdirectory under app data folder)
    pub models_dir: PathBuf,
    pub results: Mutex<HashMap<String, ResultEntry>>,
    pub in_flight: Mutex<HashMap<String, Arc<CancelHandle>>>,
    /// Stores cancellation handles for individual model downloads initiated in the settings modal (filename → CancelHandle)
    pub downloads: Mutex<HashMap<String, Arc<CancelHandle>>>,
}

impl AppState {
    pub fn new(models_dir: PathBuf) -> Self {
        Self {
            models_dir,
            results: Mutex::new(HashMap::new()),
            in_flight: Mutex::new(HashMap::new()),
            downloads: Mutex::new(HashMap::new()),
        }
    }
}
