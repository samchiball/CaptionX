use anyhow::{Context, Result};
use std::path::PathBuf;

use crate::types::{TranscribeOptions, TranscriptResult};

#[cfg(feature = "full")]
use std::path::Path;
#[cfg(feature = "full")]
use crate::types::{Segment, Word};
#[cfg(feature = "full")]
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

#[cfg(feature = "full")]
fn model_path(models_dir: &Path, model_name: &str) -> PathBuf {
    models_dir.join(format!("ggml-{model_name}.bin"))
}

#[cfg(not(feature = "full"))]
pub async fn run_whisper(
    _options: &TranscribeOptions,
    _pcm: &[f32],
    _models_dir: PathBuf,
) -> Result<TranscriptResult> {
    anyhow::bail!("Transcription feature is only available in builds with --features full")
}

#[cfg(any(feature = "full", test))]
fn clean_segment_text(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    while let Some(ch) = chars.next() {
        match ch {
            '[' if matches!(chars.peek(), Some('_')) => {
                for c in chars.by_ref() {
                    if c == ']' {
                        break;
                    }
                }
            }
            '<' if matches!(chars.peek(), Some('|')) => {
                chars.next();
                loop {
                    match chars.next() {
                        Some('|') if matches!(chars.peek(), Some('>')) => {
                            chars.next();
                            break;
                        }
                        None => break,
                        _ => {}
                    }
                }
            }
            '\u{FFFD}' => {}
            _ => out.push(ch),
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(any(feature = "full", test))]
fn is_special_token(tok: &str) -> bool {
    let t = tok.trim();
    (t.starts_with("<|") && t.ends_with("|>"))
        || (t.starts_with("[_") && t.ends_with(']'))
}

/// Determines whether VAD should actually be enabled.
///
/// Since `enable_vad(true)` panics if the VAD model path is not set
/// (whisper_params.rs:822), return true only if VAD is enabled by user and the model file actually exists.
/// If the model is missing, transcription proceeds without VAD (graceful degradation).
#[cfg(any(feature = "full", test))]
fn should_enable_vad(vad: bool, vad_model_path: &std::path::Path) -> bool {
    vad && vad_model_path.exists()
}

/// Determines the n_threads value for whisper.cpp.
///
/// Converts renderer's "auto" (0) or unspecified (None) to an actual thread count of 1 or more.
/// Passing `set_n_threads(0)` directly initializes the GGML thread pool with 0 workers,
/// throwing an STL exception (such as std::length_error) across the FFI boundary during task distribution,
/// which aborts the process with "Rust cannot catch foreign exceptions" -> STATUS_STACK_BUFFER_OVERRUN(0xC0000409).
/// Always correct this to be at least 1.
#[cfg(feature = "full")]
fn resolve_threads(requested: Option<u32>) -> i32 {
    match requested {
        Some(n) if n >= 1 => n.min(i32::MAX as u32) as i32,
        _ => {
            // Use min(4, logical core count) identical to whisper.cpp default.
            let cores = std::thread::available_parallelism()
                .map(|n| n.get())
                .unwrap_or(4);
            cores.clamp(1, 4) as i32
        }
    }
}

/// Reflects GPU flag to WhisperContextParameters.
///
/// Since `use_gpu` in `WhisperContextParameters::default()` is determined by `cfg!(feature = "_gpu")`,
/// this function must be used to overwrite it with the user's runtime choice (options.gpu).
///
/// Note: In builds with `--features full` where GPU backend (Vulkan/CUDA/Metal) is not compiled,
/// setting `use_gpu(true)` does not enable actual GPU acceleration.
///
/// TODO: When `options.vad == true`, whisper-rs `enable_vad()` + `set_vad_model_path()` needs to be applied.
/// Currently the `vad` flag is a no-op (requires separate infrastructure to download silero VAD model).
#[cfg(feature = "full")]
fn make_ctx_params(gpu: bool) -> WhisperContextParameters<'static> {
    let mut p = WhisperContextParameters::default();
    p.use_gpu(gpu);
    p
}

#[cfg(feature = "full")]
pub async fn run_whisper(
    options: &TranscribeOptions,
    pcm: &[f32],
    models_dir: PathBuf,
) -> Result<TranscriptResult> {
    let model_name = options.model.clone();
    let language = options.language.clone();
    let threads = resolve_threads(options.threads);
    let gpu = options.gpu;
    let vad = options.vad;
    let pcm_owned: Vec<f32> = pcm.to_vec();

    let (tx, rx) = tokio::sync::oneshot::channel::<Result<TranscriptResult>>();

    std::thread::Builder::new()
        .name("whisper-worker".to_string())
        .stack_size(128 * 1024 * 1024) // 128 MB — Allocate headroom for GGML decode buffer
        .spawn(move || {
            let result = (|| -> Result<TranscriptResult> {
                let path = model_path(&models_dir, &model_name);
                if !path.exists() {
                    return Err(anyhow::anyhow!(
                        "Model file not found: {}\nHint: Copy ggml-{}.bin to {}",
                        path.display(),
                        model_name,
                        models_dir.display()
                    ));
                }

                let ctx =
                    WhisperContext::new_with_params(&path, make_ctx_params(gpu))
                        .context("Failed to initialize Whisper context")?;

                let mut state = ctx.create_state().context("Failed to create Whisper state")?;

                let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 5 });
                params.set_n_threads(threads);
                params.set_print_progress(false);
                params.set_print_realtime(false);
                params.set_print_special(false);
                params.set_print_timestamps(false);
                params.set_token_timestamps(true);

                // VAD: Transcribe by extracting speech segments. Follow the order: set model path -> enable VAD
                // (enable_vad panics if path is not set). Proceed without VAD if model is missing.
                let vad_path = models_dir.join(crate::commands::models::VAD_MODEL_FILE);
                if should_enable_vad(vad, &vad_path) {
                    params.set_vad_model_path(Some(&vad_path.to_string_lossy()));
                    params.enable_vad(true);
                } else if vad {
                    eprintln!(
                        "[VAD] Model file not found: {} — Proceeding with transcription without VAD",
                        vad_path.display()
                    );
                }

                if let Some(lang) = &language {
                    if !lang.is_empty() && lang != "auto" {
                        params.set_language(Some(lang));
                    }
                }

                state
                    .full(params, &pcm_owned)
                    .context("Whisper transcription failed")?;

                let n_segs = state.full_n_segments();
                let lang_id = state.full_lang_id_from_state();
                let language_str = whisper_rs::get_lang_str(lang_id)
                    .unwrap_or("unknown")
                    .to_string();

                let mut segments = Vec::with_capacity(n_segs as usize);
                for i in 0..n_segs {
                    let Some(seg) = state.get_segment(i) else {
                        continue;
                    };

                    let raw = seg
                        .to_str_lossy()
                        .map(|s| s.into_owned())
                        .unwrap_or_default();
                    let text = clean_segment_text(&raw);
                    let start = seg.start_timestamp() as f64 / 100.0;
                    let end = seg.end_timestamp() as f64 / 100.0;

                    let mut words: Vec<Word> = Vec::new();
                    for t in 0..seg.n_tokens() {
                        let Some(tok) = seg.get_token(t) else {
                            continue;
                        };
                        let tok_text = tok
                            .to_str_lossy()
                            .map(|s| s.into_owned())
                            .unwrap_or_default();
                        if is_special_token(&tok_text) || tok_text.trim().is_empty() {
                            continue;
                        }
                        let td = tok.token_data();
                        words.push(Word {
                            text: tok_text,
                            start: td.t0 as f64 / 100.0,
                            end: td.t1 as f64 / 100.0,
                            score: td.p as f64,
                        });
                    }

                    segments.push(Segment {
                        start,
                        end,
                        text,
                        words,
                    });
                }

                Ok(TranscriptResult {
                    language: language_str,
                    segments,
                })
            })();

            let _ = tx.send(result);
        })
        .context("Failed to create Whisper thread")?;

    rx.await.context("Failed to receive from Whisper thread channel")?
}

/// `clean_segment_text` / `is_special_token` — Unit tests possible without full feature
#[cfg(test)]
mod tests {
    use super::*;

    // ── clean_segment_text ───────────────────────────────────────────────────

    #[test]
    fn clean_removes_beg_token() {
        assert_eq!(clean_segment_text("[_BEG_] 안녕"), "안녕");
    }

    #[test]
    fn clean_removes_tt_timestamp_tokens() {
        assert_eq!(
            clean_segment_text("[_BEG_] ( 오늘 ) [_TT_100]"),
            "( 오늘 )"
        );
    }

    #[test]
    fn clean_removes_angle_bracket_tokens() {
        assert_eq!(
            clean_segment_text("<|startoftranscript|> hello <|0.00|>"),
            "hello"
        );
    }

    #[test]
    fn clean_removes_replacement_char() {
        let input = format!("그래서\u{FFFD} 안녕\u{FFFD}\u{FFFD}");
        assert_eq!(clean_segment_text(&input), "그래서 안녕");
    }

    #[test]
    fn clean_preserves_normal_korean() {
        let s = "그래서 그 사람 사질이 누구야?";
        assert_eq!(clean_segment_text(s), s);
    }

    #[test]
    fn clean_mixed_special_and_korean() {
        let input = "[_BEG_] 그래서 그 사람 누구\u{FFFD} [_TT_200]";
        assert_eq!(clean_segment_text(input), "그래서 그 사람 누구");
    }

    // ── is_special_token ────────────────────────────────────────────────────

    #[test]
    fn is_special_token_bracket_style() {
        assert!(is_special_token("[_BEG_]"));
        assert!(is_special_token("[_TT_100]"));
        assert!(is_special_token("[_TT_200]"));
    }

    #[test]
    fn is_special_token_angle_style() {
        assert!(is_special_token("<|startoftranscript|>"));
        assert!(is_special_token("<|0.00|>"));
        assert!(is_special_token("<|en|>"));
    }

    #[test]
    fn is_special_token_rejects_normal_text() {
        assert!(!is_special_token("hello"));
        assert!(!is_special_token("안녕하세요"));
        assert!(!is_special_token("[normal]"));
    }

    // ── should_enable_vad (pure gating logic testable without full feature) ──────────

    #[test]
    fn should_enable_vad_false_when_flag_off() {
        // If vad=false, do not enable even if model exists
        let tmp = std::env::temp_dir().join("captionx_test_vad_off.bin");
        std::fs::write(&tmp, b"x").unwrap();
        assert!(!should_enable_vad(false, &tmp));
        let _ = std::fs::remove_file(&tmp);
    }

    #[test]
    fn should_enable_vad_false_when_model_missing() {
        // Even if vad=true, do not enable if model file is missing (prevents enable_vad panic)
        let missing = std::path::Path::new("/nonexistent/ggml-silero-v5.1.2.bin");
        assert!(!should_enable_vad(true, missing));
    }

    #[test]
    fn should_enable_vad_true_when_flag_on_and_model_present() {
        let tmp = std::env::temp_dir().join("captionx_test_vad_present.bin");
        std::fs::write(&tmp, b"x").unwrap();
        assert!(should_enable_vad(true, &tmp));
        let _ = std::fs::remove_file(&tmp);
    }
}

/// `run_whisper` / `resolve_threads` / `model_path` — Requires full feature
#[cfg(all(test, feature = "full"))]
mod tests_full {
    use super::*;
    use crate::types::{AlignMode, TranscribeOptions};

    #[test]
    fn test_make_ctx_params_gpu_true() {
        let p = make_ctx_params(true);
        assert!(p.use_gpu, "use_gpu must be true when gpu=true");
    }

    #[test]
    fn test_make_ctx_params_gpu_false() {
        let p = make_ctx_params(false);
        assert!(!p.use_gpu, "use_gpu must be false when gpu=false");
    }

    fn opts(model: &str) -> TranscribeOptions {
        TranscribeOptions {
            file_path: "dummy.mp4".to_string(),
            audio_track_index: None,
            audio_track_indices: None,
            model: model.to_string(),
            language: None,
            align: false,
            align_mode: AlignMode::Wav2vec2,
            gpu: false,
            vad: false,
            denoise: false,
            hotwords: None,
            threads: Some(1),
        }
    }

    #[tokio::test]
    async fn test_missing_model_returns_descriptive_error() {
        let models_dir = std::path::PathBuf::from("/nonexistent/models");
        let result = run_whisper(&opts("base"), &[], models_dir).await;
        assert!(result.is_err(), "should return Err if model is absent");
        let msg = result.unwrap_err().to_string();
        assert!(
            msg.contains("Model file not found"),
            "Error message must contain 'Model file not found', actual: {msg}"
        );
    }

    #[tokio::test]
    async fn test_empty_pcm_with_missing_model_returns_error_not_panic() {
        let models_dir = std::path::PathBuf::from("/nonexistent/models");
        let result = run_whisper(&opts("large-v3"), &[], models_dir).await;
        assert!(result.is_err());
    }

    #[test]
    fn test_resolve_threads_never_zero() {
        assert!(resolve_threads(Some(0)) >= 1);
        assert!(resolve_threads(None) >= 1);
    }

    #[test]
    fn test_resolve_threads_passthrough() {
        assert_eq!(resolve_threads(Some(1)), 1);
        assert_eq!(resolve_threads(Some(8)), 8);
        assert_eq!(resolve_threads(Some(16)), 16);
    }

    #[test]
    fn test_model_path_construction() {
        let dir = std::path::PathBuf::from("/models");
        assert_eq!(
            model_path(&dir, "base"),
            std::path::PathBuf::from("/models/ggml-base.bin")
        );
        assert_eq!(
            model_path(&dir, "large-v3-turbo"),
            std::path::PathBuf::from("/models/ggml-large-v3-turbo.bin")
        );
    }

    /// Even if vad=true, missing model -> should return "Model file not found" error.
    /// Since vad is currently a no-op, there should be no VAD-related panic.
    #[tokio::test]
    async fn test_vad_true_missing_model_returns_model_error_not_vad_panic() {
        let mut o = opts("base");
        o.vad = true;
        let result = run_whisper(&o, &[], PathBuf::from("/nonexistent/models")).await;
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(
            msg.contains("Model file not found"),
            "VAD=true but missing model must result in model missing error, actual: {msg}"
        );
    }

    /// vad=false and vad=true should return the same error (currently vad is a no-op).
    #[tokio::test]
    async fn test_vad_noop_same_error_as_vad_false() {
        let models_dir = PathBuf::from("/nonexistent/models");

        let result_no_vad = run_whisper(&opts("base"), &[], models_dir.clone()).await;
        let mut o = opts("base");
        o.vad = true;
        let result_vad = run_whisper(&o, &[], models_dir).await;

        assert!(result_no_vad.is_err());
        assert!(result_vad.is_err());
        // Error messages must be identical (bug if vad opens another error path)
        assert_eq!(
            result_no_vad.unwrap_err().to_string(),
            result_vad.unwrap_err().to_string(),
            "Error type must not change based on vad flag"
        );
    }

    /// Combined gpu=true + vad=true -> model missing error (no panic).
    #[tokio::test]
    async fn test_gpu_and_vad_combined_missing_model_returns_error() {
        let mut o = opts("base");
        o.gpu = true;
        o.vad = true;
        let result = run_whisper(&o, &[], PathBuf::from("/nonexistent/models")).await;
        assert!(result.is_err(), "should Err if model is missing even if gpu+vad=true");
        let msg = result.unwrap_err().to_string();
        assert!(msg.contains("Model file not found"), "Verify error message: {msg}");
    }

    /// VAD order contract: set_vad_model_path(Some) → enable_vad(true) does not panic.
    /// (Reverse order causes "Set a VAD model path before..." panic in whisper_params.rs:822)
    /// Regression guard to guarantee run_whisper respects this order.
    #[test]
    fn test_vad_params_path_then_enable_does_not_panic() {
        use whisper_rs::{FullParams, SamplingStrategy};
        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 5 });
        params.set_vad_model_path(Some("dummy-silero.bin"));
        params.enable_vad(true); // no panic since path was set first
    }

    /// Bundled whisper.cpp must be able to parse and load the silero v5.1.2 model.
    /// (Prevents false-green trap of assuming v6.2.0 compatibility — if model fails to load,
    /// VAD fails at runtime despite successful download and no enable_vad panic.)
    /// Skip if model is absent.
    #[test]
    fn test_whisper_cpp_loads_silero_v5_model() {
        use whisper_rs::{WhisperVadContext, WhisperVadContextParams};

        let model = {
            let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".into());
            std::path::PathBuf::from(appdata)
                .join("CaptionX")
                .join("models")
                .join(crate::commands::models::VAD_MODEL_FILE)
        };
        if !model.exists() {
            return; // Skip if model is absent
        }

        let mut params = WhisperVadContextParams::default();
        params.set_n_threads(1);
        params.set_use_gpu(false);
        let ctx = WhisperVadContext::new(&model.to_string_lossy(), params);
        assert!(
            ctx.is_ok(),
            "Bundled whisper.cpp failed to load silero v5.1.2: {:?}",
            ctx.err()
        );
    }
}
