use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Word {
    pub text: String,
    pub start: f64,
    pub end: f64,
    pub score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Segment {
    pub start: f64,
    pub end: f64,
    pub text: String,
    pub words: Vec<Word>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptResult {
    pub language: String,
    pub segments: Vec<Segment>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioTrack {
    pub index: u32,
    pub codec: String,
    pub channels: u32,
    pub language: Option<String>,
    pub title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum JobStage {
    Decode,
    Transcribe,
    Align,
    Export,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobProgress {
    pub job_id: String,
    pub stage: JobStage,
    pub pct: u8,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AlignMode {
    Wav2vec2,
    Mms,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscribeOptions {
    pub file_path: String,
    pub audio_track_index: Option<u32>,
    pub audio_track_indices: Option<Vec<u32>>,
    pub model: String,
    pub language: Option<String>,
    pub align: bool,
    pub align_mode: AlignMode,
    pub gpu: bool,
    pub vad: bool,
    pub denoise: bool,
    pub hotwords: Option<Vec<String>>,
    pub threads: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResplitOptions {
    pub max_chars: u32,
    pub language: Option<String>,
    pub min_pause: Option<f64>,
    pub gap_factor: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntryMeta {
    pub id: String,
    pub name: String,
    pub source_path: String,
    pub language: String,
    pub model: String,
    pub created_at: u64,
    pub segment_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub meta: HistoryEntryMeta,
    pub result: TranscriptResult,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Srt,
    Vtt,
    Json,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportOptions {
    pub format: ExportFormat,
    pub include_words: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemMemoryInfo {
    pub total: u64,
    pub free: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpuMemoryInfo {
    pub name: String,
    pub total: u64,
    pub free: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HardwareInfo {
    pub ram: SystemMemoryInfo,
    pub gpu: Option<GpuMemoryInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum UpdatePhase {
    Idle,
    Checking,
    NotAvailable,
    Available,
    Downloading,
    Downloaded,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateStatus {
    pub phase: UpdatePhase,
    pub version: Option<String>,
    pub percent: Option<f32>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataPaths {
    pub history: String,
    pub audio_cache: String,
}

/// Model download progress event in the settings screen (captionx://model-progress)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelDownloadProgress {
    pub name: String,
    pub downloaded: u64,
    pub total: u64,
    pub done: bool,
    pub error: Option<String>,
}
