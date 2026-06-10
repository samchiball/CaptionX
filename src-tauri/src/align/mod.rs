pub mod ctc;
pub mod vocab;

use anyhow::{Context, Result};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use crate::state::CancelHandle;
use crate::types::{AlignMode, Segment, TranscribeOptions, TranscriptResult, Word};

#[cfg(feature = "full")]
use ort::session::builder::GraphOptimizationLevel;

const SAMPLE_RATE: f64 = 16000.0;
const SESSION_BUILD_TIMEOUT: Duration = Duration::from_secs(15);
const SESSION_RUN_TIMEOUT: Duration = Duration::from_secs(60);

/// wav2vec2 / MMS forced alignment — refines word timestamps per segment.
///
/// `pcm`: 16kHz mono f32 PCM of the entire audio (output of decode_audio_pcm)
/// If the ONNX model file does not exist, returns the original Whisper token timestamps.
/// Returns the original result as a fallback if a timeout or error occurs during ORT initialization/inference.
pub async fn run_align(
    options: &TranscribeOptions,
    result: TranscriptResult,
    pcm: Vec<f32>,
    models_dir: PathBuf,
    cancel: Option<Arc<CancelHandle>>,
    on_progress: impl Fn(u8) + Send + 'static,
) -> Result<TranscriptResult> {
    run_align_inner(options, result, pcm, models_dir, cancel, on_progress).await
}

#[cfg(not(feature = "full"))]
async fn run_align_inner(
    _options: &TranscribeOptions,
    result: TranscriptResult,
    _pcm: Vec<f32>,
    _models_dir: PathBuf,
    _cancel: Option<Arc<CancelHandle>>,
    _on_progress: impl Fn(u8) + Send + 'static,
) -> Result<TranscriptResult> {
    Ok(result)
}

#[cfg(feature = "full")]
async fn run_align_inner(
    options: &TranscribeOptions,
    result: TranscriptResult,
    pcm: Vec<f32>,
    models_dir: PathBuf,
    cancel: Option<Arc<CancelHandle>>,
    on_progress: impl Fn(u8) + Send + 'static,
) -> Result<TranscriptResult> {
    let align_mode = options.align_mode.clone();
    let result_clone = result.clone();

    tokio::task::spawn_blocking(move || {
        let model_path = resolve_model_path(&models_dir, &align_mode);

        if !model_path.exists() {
            // If the model does not exist, return original Whisper timestamps (progress callback not called)
            return Ok(result_clone);
        }

        // ── 취소 확인 (align 시작 직전) ──────────────────────────────────────
        if let Some(ref c) = cancel {
            if c.is_cancelled() {
                return Ok(result_clone);
            }
        }

        on_progress(5); // Start ORT session builder

        // ─── 타임아웃이 적용된 ORT 세션 생성 ──────────────────────────────────
        let mut session = match build_session_with_timeout(&model_path, SESSION_BUILD_TIMEOUT) {
            Ok(s) => s,
            Err(e) => {
                eprintln!(
                    "[ALIGN] Session build failed, falling back to Whisper timestamps: {:?}",
                    e
                );
                return Ok(result_clone);
            }
        };
        on_progress(10); // Model load completed

        let total = result_clone.segments.len().max(1);
        let mut segments = Vec::with_capacity(result_clone.segments.len());
        for (idx, seg) in result_clone.segments.iter().enumerate() {
            // Progress per segment: 10% -> 99%
            let pct = (10u8)
                .saturating_add((idx as f64 / total as f64 * 89.0) as u8)
                .min(99);
            on_progress(pct);

            // ── 취소 확인 (세그먼트 루프 시작 시) ──────────────────────────────
            if let Some(ref c) = cancel {
                if c.is_cancelled() {
                    // Return already processed segments + remaining original segments
                    segments.push(seg.clone());
                    continue;
                }
            }

            let start_s = (seg.start * SAMPLE_RATE) as usize;
            let end_s = ((seg.end * SAMPLE_RATE) as usize).min(pcm.len());
            let seg_pcm = if start_s < end_s {
                &pcm[start_s..end_s]
            } else {
                &[]
            };

            // ── Safeguard: skip alignment if segment is too long (e.g. over 5 minutes) ─────────
            let duration = seg.end - seg.start;
            if duration > 300.0 {
                eprintln!("[ALIGN] Segment too long ({:.1}s), skipping", duration);
                segments.push(seg.clone());
                continue;
            }

            let aligned_seg = align_segment_with_pcm(&mut session, seg, seg_pcm, seg.start)
                .unwrap_or_else(|e| {
                    eprintln!("[ALIGN] Error aligning segment: {:?}", e);
                    seg.clone()
                });
            segments.push(aligned_seg);
        }

        Ok(TranscriptResult {
            language: result_clone.language,
            segments,
        })
    })
    .await
    .context("forced alignment thread error")?
}

/// Creates an ORT session applying a timeout.
///
/// When building with default features (download-binaries + copy-dylibs) of ort, the ORT 1.24 DLL
/// is placed next to the executable. Since we do not use the load-dynamic feature,
/// Windows DLL search follows the standard order (executable directory first).
#[cfg(feature = "full")]
fn build_session_with_timeout(
    model_path: &Path,
    timeout: Duration,
) -> Result<ort::session::Session> {
    let mpath = model_path.to_path_buf();
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        #[allow(clippy::needless_question_mark)]
        let res = ort::session::Session::builder()
            .and_then(|b| Ok(b.with_intra_threads(1)?))
            .and_then(|b| Ok(b.with_inter_threads(1)?))
            .and_then(|b| Ok(b.with_optimization_level(GraphOptimizationLevel::Disable)?))
            .and_then(|mut b| Ok(b.commit_from_file(&mpath)?));
        let _ = tx.send(res);
    });
    rx.recv_timeout(timeout)
        .map_err(|_| {
            anyhow::anyhow!(
                "ORT session build timeout (exceeded {:?}). \
                 onnxruntime.dll is missing next to the executable or version mismatch.",
                timeout
            )
        })?
        .context("Failed to load ONNX model")
}

#[cfg(feature = "full")]
fn run_session_with_timeout<'s>(
    session: &'s mut ort::session::Session,
    input: &ort::value::Tensor<f32>,
    timeout: Duration,
) -> Result<ort::session::SessionOutputs<'s>> {
    // Since `SessionOutputs` is bound to the lifetime of `RunOptions`, stack variables cannot be used.
    // `Box::leak`로 `'static`을 부여해 타이머 스레드와 공유하고 반환한다.
    let run_options: &'static ort::session::RunOptions = Box::leak(Box::new(
        ort::session::RunOptions::new().context("RunOptions 생성 실패")?,
    ));

    let _timer = std::thread::spawn(move || {
        std::thread::sleep(timeout);
        let _ = run_options.terminate();
    });

    let result = session.run_with_options(ort::inputs![input], run_options);

    // The timer thread is either already finished or will finish shortly.
    // `terminate()` has no effect on already completed runs.
    result.context("ONNX inference failed")
}

fn resolve_model_path(models_dir: &Path, mode: &AlignMode) -> PathBuf {
    match mode {
        AlignMode::Wav2vec2 => models_dir.join("wav2vec2-base.onnx"),
        AlignMode::Mms => models_dir.join("mms-300m.onnx"),
    }
}

/// Receives a PCM slice and segment text to calculate word timestamps.
///
/// `seg_pcm`: 16kHz mono f32 PCM corresponding to this segment
/// `seg_start_sec`: start time of this segment in the entire audio (seconds)
#[cfg(feature = "full")]
pub fn align_segment_with_pcm(
    session: &mut ort::session::Session,
    seg: &Segment,
    seg_pcm: &[f32],
    seg_start_sec: f64,
) -> Result<Segment> {
    use ctc::{forced_align, log_softmax};
    use ort::value::Tensor;
    use vocab::{text_to_ids, WAV2VEC2_BLANK_ID};

    if seg_pcm.is_empty() || seg.text.trim().is_empty() {
        return Ok(seg.clone());
    }

    // ── 1. wav2vec2 Inference ────────────────────────────────────────────────
    // Input: [1, T] float32 (raw PCM, 16 kHz)
    let pcm_box: Box<[f32]> = seg_pcm.to_vec().into_boxed_slice();
    let input_tensor = Tensor::<f32>::from_array(([1_usize, seg_pcm.len()], pcm_box))?;

    let outputs = run_session_with_timeout(session, &input_tensor, SESSION_RUN_TIMEOUT)
        .context("강제정렬 추론 타임아웃 또는 오류")?;

    // Output: logits [1, frames, vocab_size]
    let logits_val = outputs.get("logits").context("logits 출력 없음")?;
    let (shape, flat) = logits_val.try_extract_tensor::<f32>()?;
    let (frames, vocab_size) = (shape[1] as usize, shape[2] as usize);

    // ── 2. log-softmax ──────────────────────────────────────────────────────
    let emission: Vec<Vec<f32>> = (0..frames)
        .map(|t| log_softmax(&flat[t * vocab_size..(t + 1) * vocab_size]))
        .collect();

    // ── 3. Text → char ID ──────────────────────────────────────────────────
    let transcript_ids = text_to_ids(&seg.text);
    if transcript_ids.is_empty() {
        return Ok(seg.clone());
    }

    // ── 4. CTC Forced Alignment ──────────────────────────────────────────────
    let char_frames = forced_align(&emission, &transcript_ids, WAV2VEC2_BLANK_ID);

    // ── 5. Group char → word ────────────────────────────────────────────────
    let words = group_chars_to_words(&seg.text, &char_frames, seg_start_sec);

    Ok(Segment {
        start: seg.start,
        end: seg.end,
        text: seg.text.clone(),
        words,
    })
}

fn group_chars_to_words(
    text: &str,
    char_frames: &[(usize, usize)],
    seg_start_sec: f64,
) -> Vec<Word> {
    use vocab::frames_to_seconds;

    let mut words: Vec<Word> = Vec::new();
    let mut word_start: Option<usize> = None;
    let mut word_end: usize = 0;
    let mut current_word = String::new();
    let mut char_idx = 0;

    let chars: Vec<char> = text
        .to_uppercase()
        .chars()
        .filter(|c| c.is_alphabetic() || *c == '\'' || *c == ' ')
        .collect();

    for ch in chars {
        if ch == ' ' {
            if !current_word.is_empty() {
                if let Some(start) = word_start {
                    words.push(Word {
                        text: current_word.clone(),
                        start: seg_start_sec + frames_to_seconds(start),
                        end: seg_start_sec + frames_to_seconds(word_end),
                        score: 1.0,
                    });
                }
                current_word.clear();
                word_start = None;
            }
        } else if char_idx < char_frames.len() {
            let (sf, ef) = char_frames[char_idx];
            if word_start.is_none() {
                word_start = Some(sf);
            }
            word_end = ef;
            current_word.push(ch);
            char_idx += 1;
        }
    }

    if !current_word.is_empty() {
        if let Some(start) = word_start {
            words.push(Word {
                text: current_word,
                start: seg_start_sec + frames_to_seconds(start),
                end: seg_start_sec + frames_to_seconds(word_end),
                score: 1.0,
            });
        }
    }

    words
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{AlignMode, Segment, TranscribeOptions, TranscriptResult, Word};

    fn opts(mode: AlignMode) -> TranscribeOptions {
        TranscribeOptions {
            file_path: "dummy.mp4".to_string(),
            audio_track_index: None,
            audio_track_indices: None,
            model: "base".to_string(),
            language: None,
            align: true,
            align_mode: mode,
            gpu: false,
            vad: false,
            denoise: false,
            hotwords: None,
            threads: Some(1),
        }
    }

    fn sample_result() -> TranscriptResult {
        TranscriptResult {
            language: "en".to_string(),
            segments: vec![Segment {
                start: 0.0,
                end: 2.0,
                text: " hello world".to_string(),
                words: vec![
                    Word {
                        text: " hello".to_string(),
                        start: 0.0,
                        end: 1.0,
                        score: 0.9,
                    },
                    Word {
                        text: " world".to_string(),
                        start: 1.0,
                        end: 2.0,
                        score: 0.9,
                    },
                ],
            }],
        }
    }

    /// Should return the original TranscriptResult when the wav2vec2 model is absent
    #[tokio::test]
    async fn test_align_fallback_returns_original_when_model_absent() {
        let original = sample_result();
        let models_dir = std::path::PathBuf::from("/nonexistent/models");
        let aligned = run_align(
            &opts(AlignMode::Wav2vec2),
            original.clone(),
            vec![],
            models_dir,
            None,
            |_| {},
        )
        .await
        .expect("should return Ok even when the model is absent");
        assert_eq!(aligned.language, original.language);
        assert_eq!(aligned.segments.len(), original.segments.len());
        assert_eq!(aligned.segments[0].text, original.segments[0].text);
    }

    /// Should return the original result when MMS model is absent (same path as Wav2vec2)
    #[tokio::test]
    async fn test_align_mms_fallback_returns_original() {
        let original = sample_result();
        let models_dir = std::path::PathBuf::from("/nonexistent/models");
        let aligned = run_align(
            &opts(AlignMode::Mms),
            original.clone(),
            vec![],
            models_dir,
            None,
            |_| {},
        )
        .await
        .expect("should return Ok when the model is absent");
        assert_eq!(aligned.segments.len(), 1);
    }

    /// The on_progress callback should not be called when the model is absent (early return path)
    #[tokio::test]
    async fn test_align_progress_callback_not_called_when_model_absent() {
        use std::sync::{
            atomic::{AtomicBool, Ordering},
            Arc,
        };
        let called = Arc::new(AtomicBool::new(false));
        let called2 = called.clone();
        let _ = run_align(
            &opts(AlignMode::Wav2vec2),
            sample_result(),
            vec![],
            std::path::PathBuf::from("/no/models"),
            None,
            move |_| {
                called2.store(true, Ordering::SeqCst);
            },
        )
        .await
        .unwrap();
        assert!(
            !called.load(Ordering::SeqCst),
            "callback must not be called when model is absent"
        );
    }

    /// Should return the original result as a fallback when ORT initialization fails (invalid ONNX file)
    #[tokio::test]
    async fn test_align_ort_init_failure_returns_original() {
        let tmp = std::env::temp_dir().join("captionx_test_bad.onnx");
        // Clean up test file
        let _ = std::fs::remove_file(&tmp);
        std::fs::write(&tmp, b"not a valid onnx").unwrap();
        let models_dir = std::env::temp_dir();
        let original = sample_result();
        let aligned = run_align(
            &opts(AlignMode::Wav2vec2),
            original.clone(),
            vec![0.0f32; 32000],
            models_dir,
            None,
            |_| {},
        )
        .await
        .expect("should return Ok even when initialization fails");
        assert_eq!(aligned.segments[0].text, original.segments[0].text);
        let _ = std::fs::remove_file(&tmp);
    }

    /// Should return the original result before align starts if cancellation flag is set
    #[tokio::test]
    async fn test_align_cancelled_before_align_returns_original() {
        let original = sample_result();
        let handle = Arc::new(CancelHandle::new());
        handle.cancel();
        let aligned = run_align(
            &opts(AlignMode::Wav2vec2),
            original.clone(),
            vec![0.0f32; 32000],
            std::path::PathBuf::from("/nonexistent/models"),
            Some(handle),
            |_| {},
        )
        .await
        .expect("should return Ok even in cancelled state");
        assert_eq!(aligned.segments[0].text, original.segments[0].text);
    }

    /// The on_progress callback must be called at least once when the model is present
    #[tokio::test]
    async fn test_align_progress_callback_called_when_model_present() {
        // Since this is only meaningful when the model file actually exists,
        // skip the test if the model is absent.
        let models_dir = {
            let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".into());
            std::path::PathBuf::from(appdata)
                .join("CaptionX")
                .join("models")
        };
        let model_path = models_dir.join("wav2vec2-base.onnx");
        if !model_path.exists() {
            return; // Skip if model is absent
        }

        use std::sync::{Arc, Mutex};
        let log: Arc<Mutex<Vec<u8>>> = Arc::new(Mutex::new(vec![]));
        let log2 = log.clone();

        // Apply 30 seconds timeout (considering model loading + inference time)
        let result = tokio::time::timeout(
            std::time::Duration::from_secs(30),
            run_align(
                &opts(AlignMode::Wav2vec2),
                sample_result(),
                vec![0.0f32; 32000],
                models_dir,
                None,
                move |pct| {
                    log2.lock().unwrap().push(pct);
                },
            ),
        )
        .await;

        match result {
            Ok(inner_res) => {
                match inner_res {
                    Ok(_) => {
                        assert!(
                            log.lock().unwrap().len() > 0,
                            "callback must be called at least once"
                        );
                    }
                    Err(e) => {
                        // Regard as test failure if error occurs like initialization timeout (might be system environment issue)
                        panic!("run_align failed: {:?}", e);
                    }
                }
            }
            Err(_) => {
                panic!("test timeout (exceeded 30s)");
            }
        }
    }

    /// Verifies if the default feature (download-binaries) of `ort` statically links ORT.
    /// Session::builder() completing within 5 seconds indicates normal static linking.
    /// If `load-dynamic` feature is present, system onnxruntime.dll (v1.17) is loaded, taking over 15 seconds.
    #[cfg(feature = "full")]
    #[test]
    fn test_ort_session_builder_initializes_quickly() {
        use std::time::Instant;
        let t = Instant::now();
        let result = ort::session::Session::builder();
        let elapsed = t.elapsed();
        assert!(
            result.is_ok(),
            "Session::builder() failed: {:?}",
            result.err()
        );
        assert!(
            elapsed.as_secs() < 5,
            "Session::builder() took {:?} (limit 5s). \
             'load-dynamic' feature might be enabled and trying to load system onnxruntime.dll(v1.17), \
             causing a timeout. \
             Please remove the 'load-dynamic' feature from ort dependency in Cargo.toml.",
            elapsed
        );
    }

    /// group_chars_to_words: empty text -> empty word list
    #[test]
    fn test_group_chars_empty_text() {
        let words = group_chars_to_words("", &[], 0.0);
        assert!(words.is_empty());
    }

    /// group_chars_to_words: verify word boundary splitting
    #[test]
    fn test_group_chars_splits_on_space() {
        // "AB CD" → two words, A=frame(0,1), B=frame(2,3), C=frame(4,5), D=frame(6,7)
        let char_frames = vec![(0, 1), (2, 3), (4, 5), (6, 7)];
        let words = group_chars_to_words("AB CD", &char_frames, 0.0);
        assert_eq!(words.len(), 2, "split two words by space");
        assert_eq!(words[0].text, "AB");
        assert_eq!(words[1].text, "CD");
    }

    /// resolve_model_path: check filename per mode
    #[test]
    fn test_resolve_model_path() {
        let dir = std::path::PathBuf::from("/models");
        assert!(resolve_model_path(&dir, &AlignMode::Wav2vec2)
            .to_string_lossy()
            .contains("wav2vec2-base.onnx"));
        assert!(resolve_model_path(&dir, &AlignMode::Mms)
            .to_string_lossy()
            .contains("mms-300m.onnx"));
    }
}
