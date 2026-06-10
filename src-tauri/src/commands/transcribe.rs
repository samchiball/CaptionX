use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{command, Emitter, State};

use crate::edit::resplit_result;
use crate::state::{AppState, CancelHandle};
use crate::types::{JobProgress, JobStage, ResplitOptions, TranscribeOptions, TranscriptResult};

#[command]
pub async fn transcribe(
    job_id: String,
    options: TranscribeOptions,
    state: State<'_, AppState>,
    window: tauri::Window,
) -> Result<TranscriptResult, String> {
    // 기존 동일 jobId 취소
    {
        let in_flight = state.in_flight.lock().await;
        if let Some(handle) = in_flight.get(&job_id) {
            handle.cancel();
        }
    }

    let cancel = Arc::new(CancelHandle::new());
    {
        let mut in_flight = state.in_flight.lock().await;
        in_flight.insert(job_id.clone(), cancel.clone());
    }

    let models_dir = state.models_dir.clone();
    let source_path = options.file_path.clone();
    let result = run_pipeline(job_id.clone(), options, cancel, window, models_dir).await;

    {
        let mut in_flight = state.in_flight.lock().await;
        in_flight.remove(&job_id);
    }

    match result {
        Ok(transcript) => {
            state.results.lock().await.insert(
                job_id,
                crate::state::ResultEntry {
                    original_result: transcript.clone(),
                    current_result: transcript.clone(),
                    source_path,
                },
            );
            Ok(transcript)
        }
        Err(e) => Err(e),
    }
}

async fn run_pipeline(
    job_id: String,
    options: TranscribeOptions,
    cancel: Arc<CancelHandle>,
    window: tauri::Window,
    models_dir: PathBuf,
) -> Result<TranscriptResult, String> {
    macro_rules! emit {
        ($stage:expr, $pct:expr) => {
            let _ = window.emit(
                "captionx://progress",
                JobProgress {
                    job_id: job_id.clone(),
                    stage: $stage,
                    pct: $pct,
                    message: None,
                },
            );
        };
        ($stage:expr, $pct:expr, $msg:expr) => {
            let _ = window.emit(
                "captionx://progress",
                JobProgress {
                    job_id: job_id.clone(),
                    stage: $stage,
                    pct: $pct,
                    message: Some($msg.to_string()),
                },
            );
        };
    }

    use crate::align::run_align;
    use crate::asr::whisper::run_whisper;
    use crate::audio::decode::decode_audio_pcm;

    // 1. ffmpeg 디코딩
    emit!(JobStage::Decode, 0, "progress.message.decoding");
    let mut pcm = tokio::select! {
        r = decode_audio_pcm(&options) => r.map_err(|e| e.to_string())?,
        _ = cancel.notified() => return Err("작업이 취소되었습니다.".to_string()),
    };

    // 1.5 GTCRN denoise (옵션). 모델이 없으면 다운로드를 시도하고, 실패 시
    // 원본 PCM 그대로 진행한다(denoise 는 부가 기능). decode 단계 진행률을 공유한다.
    if options.denoise {
        if let Err(e) =
            ensure_denoise_model(cancel.clone(), &window, &job_id, &models_dir).await
        {
            eprintln!("[DENOISE] 모델 다운로드 실패 — denoise 없이 진행: {e}");
        }
        let denoise_path = models_dir.join(crate::commands::models::DENOISE_MODEL_FILE);
        pcm = tokio::select! {
            r = run_denoise(pcm, denoise_path) => r.map_err(|e| e.to_string())?,
            _ = cancel.notified() => return Err("작업이 취소되었습니다.".to_string()),
        };
    }
    emit!(JobStage::Decode, 100);

    // 2. Whisper 모델 자동 다운로드 (없을 때만 수행)
    emit!(
        JobStage::Transcribe,
        0,
        "progress.message.transcribePreparing"
    );
    ensure_whisper_model(&options, cancel.clone(), &window, &job_id, &models_dir).await?;

    // 2.5 VAD 모델 자동 다운로드 (옵션). VAD 는 부가 기능이므로 다운로드 실패해도
    // 전사를 중단하지 않는다 — run_whisper 가 파일 부재 시 VAD 없이 진행한다.
    if options.vad {
        if let Err(e) =
            ensure_vad_model(cancel.clone(), &window, &job_id, &models_dir).await
        {
            eprintln!("[VAD] 모델 다운로드 실패 — VAD 없이 진행: {e}");
        }
    }

    // 3. Whisper 전사 (pct 30~100)
    emit!(JobStage::Transcribe, 30, "progress.message.transcribing");
    let raw = tokio::select! {
        r = run_whisper(&options, &pcm, models_dir.clone()) => r.map_err(|e| e.to_string())?,
        _ = cancel.notified() => return Err("작업이 취소되었습니다.".to_string()),
    };
    emit!(JobStage::Transcribe, 100);

    // 4. 강제정렬 (옵션)
    if options.align {
        emit!(JobStage::Align, 0, "progress.message.alignPreparing");
        ensure_align_model(&options, cancel.clone(), &window, &job_id, &models_dir).await?;

        // run_align 이 내부에서 5%→99% 를 emit 하므로 30% 고정 emit 제거
        let win2 = window.clone();
        let jid2 = job_id.clone();
        let aligned = tokio::select! {
            r = run_align(&options, raw, pcm, models_dir, Some(cancel.clone()), move |pct| {
                let _ = win2.emit(
                    "captionx://progress",
                    JobProgress {
                        job_id: jid2.clone(),
                        stage: JobStage::Align,
                        pct,
                        message: Some("progress.message.aligning".to_string()),
                    },
                );
            }) => r.map_err(|e| e.to_string())?,
            _ = cancel.notified() => return Err("작업이 취소되었습니다.".to_string()),
        };
        emit!(JobStage::Align, 100);
        return Ok(aligned);
    }

    Ok(raw)
}

/// Whisper 모델이 없으면 HuggingFace에서 자동 다운로드한다.
async fn ensure_whisper_model(
    options: &TranscribeOptions,
    cancel: Arc<CancelHandle>,
    window: &tauri::Window,
    job_id: &str,
    models_dir: &Path,
) -> Result<(), String> {
    let file_name = format!("ggml-{}.bin", options.model);
    let path = models_dir.join(&file_name);
    if path.exists() {
        return Ok(());
    }

    let url = crate::commands::models::model_url(&file_name)
        .ok_or_else(|| format!("모델 URL 없음: {file_name}"))?;

    let win = window.clone();
    let jid = job_id.to_string();

    crate::download::download_file(&url, &path, Some(cancel.as_notify()), move |dl, total| {
        let pct = pct_in_range(dl, total, 0, 30);
        let _ = win.emit(
            "captionx://progress",
            JobProgress {
                job_id: jid.clone(),
                stage: JobStage::Transcribe,
                pct,
                message: Some("progress.message.transcribeDownloading".to_string()),
            },
        );
    })
    .await
    .map_err(|e| e.to_string())
}

/// GTCRN denoise 를 blocking 스레드에서 PCM 에 적용한다.
/// 모델이 없거나 non-full 빌드면 denoise_pcm 이 원본 PCM 을 그대로 반환한다.
async fn run_denoise(pcm: Vec<f32>, model_path: PathBuf) -> Result<Vec<f32>, String> {
    tokio::task::spawn_blocking(move || crate::audio::denoise::denoise_pcm(pcm, &model_path))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

/// GTCRN denoise 모델이 없으면 GitHub(Xiaobin-Rong/gtcrn)에서 자동 다운로드한다.
async fn ensure_denoise_model(
    cancel: Arc<CancelHandle>,
    window: &tauri::Window,
    job_id: &str,
    models_dir: &Path,
) -> Result<(), String> {
    let file_name = crate::commands::models::DENOISE_MODEL_FILE;
    let path = models_dir.join(file_name);
    if path.exists() {
        return Ok(());
    }

    let url = crate::commands::models::model_url(file_name)
        .ok_or_else(|| format!("denoise 모델 URL 없음: {file_name}"))?;

    let win = window.clone();
    let jid = job_id.to_string();

    crate::download::download_file(&url, &path, Some(cancel.as_notify()), move |dl, total| {
        let pct = pct_in_range(dl, total, 0, 100);
        let _ = win.emit(
            "captionx://progress",
            JobProgress {
                job_id: jid.clone(),
                stage: JobStage::Decode,
                pct,
                message: Some("progress.message.decoding".to_string()),
            },
        );
    })
    .await
    .map_err(|e| e.to_string())
}

/// Silero VAD 모델이 없으면 HuggingFace(ggml-org/whisper-vad)에서 자동 다운로드한다.
async fn ensure_vad_model(
    cancel: Arc<CancelHandle>,
    window: &tauri::Window,
    job_id: &str,
    models_dir: &Path,
) -> Result<(), String> {
    let file_name = crate::commands::models::VAD_MODEL_FILE;
    let path = models_dir.join(file_name);
    if path.exists() {
        return Ok(());
    }

    let url = crate::commands::models::model_url(file_name)
        .ok_or_else(|| format!("VAD 모델 URL 없음: {file_name}"))?;

    let win = window.clone();
    let jid = job_id.to_string();

    crate::download::download_file(&url, &path, Some(cancel.as_notify()), move |dl, total| {
        let pct = pct_in_range(dl, total, 0, 30);
        let _ = win.emit(
            "captionx://progress",
            JobProgress {
                job_id: jid.clone(),
                stage: JobStage::Transcribe,
                pct,
                message: Some("progress.message.transcribeDownloading".to_string()),
            },
        );
    })
    .await
    .map_err(|e| e.to_string())
}

/// 정렬 모델이 없으면 HuggingFace에서 자동 다운로드한다.
async fn ensure_align_model(
    options: &TranscribeOptions,
    cancel: Arc<CancelHandle>,
    window: &tauri::Window,
    job_id: &str,
    models_dir: &Path,
) -> Result<(), String> {
    use crate::types::AlignMode;

    let file_name = match options.align_mode {
        AlignMode::Mms => "mms-300m.onnx",
        AlignMode::Wav2vec2 => "wav2vec2-base.onnx",
    };
    let path = models_dir.join(file_name);
    if path.exists() {
        return Ok(());
    }

    let url = crate::commands::models::model_url(file_name)
        .ok_or_else(|| format!("정렬 모델 URL 없음: {file_name}"))?;

    let win = window.clone();
    let jid = job_id.to_string();

    crate::download::download_file(&url, &path, Some(cancel.as_notify()), move |dl, total| {
        let pct = pct_in_range(dl, total, 0, 30);
        let _ = win.emit(
            "captionx://progress",
            JobProgress {
                job_id: jid.clone(),
                stage: JobStage::Align,
                pct,
                message: Some("progress.message.alignDownloading".to_string()),
            },
        );
    })
    .await
    .map_err(|e| e.to_string())
}

/// `dl/total`을 `[lo, hi]` 퍼센트 범위로 선형 매핑한다.
fn pct_in_range(dl: u64, total: u64, lo: u8, hi: u8) -> u8 {
    if total == 0 {
        return lo;
    }
    lo + ((dl as f64 / total as f64) * (hi - lo) as f64) as u8
}

#[command]
pub async fn cancel_job(job_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let in_flight = state.in_flight.lock().await;
    if let Some(handle) = in_flight.get(&job_id) {
        handle.cancel();
    }
    Ok(())
}

#[command]
pub async fn release_result(job_id: String, state: State<'_, AppState>) -> Result<(), String> {
    state.results.lock().await.remove(&job_id);
    Ok(())
}

#[command]
pub async fn resplit(
    job_id: String,
    options: ResplitOptions,
    state: State<'_, AppState>,
) -> Result<TranscriptResult, String> {
    let original = {
        let results = state.results.lock().await;
        results
            .get(&job_id)
            .ok_or("재분할할 전사 결과를 찾을 수 없습니다.")?
            .original_result
            .clone()
    };

    let new_result = resplit_result(&original, &options);

    let mut results = state.results.lock().await;
    if let Some(entry) = results.get_mut(&job_id) {
        entry.current_result = new_result.clone();
    }

    Ok(new_result)
}
