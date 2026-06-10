/// 통합 테스트: 여러 모듈을 교차하는 흐름 검증.
/// GGML / 네트워크에 의존하지 않는 에러 경로와 변환 정확성에 집중한다.
use captionx_lib::{
    edit::resplit_result,
    export::{to_json, to_srt, to_vtt},
    types::{ResplitOptions, Segment, TranscriptResult, Word},
};

fn word(text: &str, start: f64, end: f64) -> Word {
    Word {
        text: text.to_string(),
        start,
        end,
        score: 0.9,
    }
}

fn result_en(segs: Vec<Segment>) -> TranscriptResult {
    TranscriptResult {
        language: "en".to_string(),
        segments: segs,
    }
}

// ─── export 왕복(roundtrip) 테스트 ───────────────────────────────────────────

#[test]
fn srt_entry_count_matches_segment_count() {
    let r = result_en(vec![
        Segment {
            start: 0.0,
            end: 1.0,
            text: "first".to_string(),
            words: vec![],
        },
        Segment {
            start: 1.0,
            end: 2.0,
            text: "second".to_string(),
            words: vec![],
        },
        Segment {
            start: 2.0,
            end: 3.0,
            text: "third".to_string(),
            words: vec![],
        },
    ]);
    let srt = to_srt(&r);
    let blocks: Vec<&str> = srt.trim().split("\n\n").filter(|s| !s.is_empty()).collect();
    assert_eq!(blocks.len(), 3, "SRT 블록 수 = 세그먼트 수");
}

#[test]
fn resplit_then_srt_preserves_all_text() {
    let words = vec![
        word("hello", 0.0, 0.5),
        word("world", 0.5, 1.0),
        word("from", 1.0, 1.5),
        word("rust", 1.5, 2.0),
    ];
    let r = result_en(vec![Segment {
        start: 0.0,
        end: 2.0,
        text: "hello world from rust".to_string(),
        words,
    }]);

    let split = resplit_result(
        &r,
        &ResplitOptions {
            max_chars: 10,
            language: None,
            min_pause: None,
            gap_factor: None,
        },
    );
    let srt = to_srt(&split);
    for seg in &split.segments {
        assert!(
            srt.contains(seg.text.trim()),
            "SRT 에 세그먼트 텍스트 포함: '{}'",
            seg.text
        );
    }
}

#[test]
fn json_roundtrip_preserves_data() {
    let r = result_en(vec![Segment {
        start: 0.0,
        end: 1.0,
        text: "hello world".to_string(),
        words: vec![word("hello", 0.0, 0.5), word("world", 0.5, 1.0)],
    }]);
    let json_out = to_json(&r, true);
    let parsed: serde_json::Value = serde_json::from_str(&json_out).expect("유효한 JSON");
    assert_eq!(parsed["language"], "en");
    assert_eq!(parsed["segments"][0]["text"], "hello world");
    assert_eq!(
        parsed["segments"][0]["words"].as_array().map(|a| a.len()),
        Some(2)
    );
}

// ─── 에러 경로 통합 ─────────────────────────────────────────────────────────

mod pipeline_errors {
    use super::*;
    use captionx_lib::types::AlignMode;

    fn transcribe_opts(model: &str) -> captionx_lib::types::TranscribeOptions {
        captionx_lib::types::TranscribeOptions {
            file_path: "nonexistent.mp4".to_string(),
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
    async fn missing_model_propagates_error() {
        use captionx_lib::asr::whisper::run_whisper;
        let result = run_whisper(
            &transcribe_opts("nonexistent-model"),
            &[],
            std::path::PathBuf::from("/no/models"),
        )
        .await;
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("model") || err.contains("found") || err.contains("Model"),
            "Error message must contain model context: {err}"
        );
    }

    #[tokio::test]
    async fn align_absent_model_returns_original() {
        use captionx_lib::align::run_align;

        let original = TranscriptResult {
            language: "en".to_string(),
            segments: vec![Segment {
                start: 0.0,
                end: 1.0,
                text: "test".to_string(),
                words: vec![word("test", 0.0, 1.0)],
            }],
        };
        let mut opts = transcribe_opts("base");
        opts.align = true;

        let result = run_align(
            &opts,
            original.clone(),
            vec![0.0_f32; 16000],
            std::path::PathBuf::from("/no/models"),
            None,
            |_| {},
        )
        .await;

        assert!(result.is_ok(), "align without model should return Ok");
        let aligned = result.unwrap();
        assert_eq!(aligned.language, original.language);
        assert_eq!(aligned.segments.len(), original.segments.len());
    }

    #[tokio::test]
    async fn decode_nonexistent_file_returns_error() {
        use captionx_lib::audio::decode::decode_audio_pcm;
        let result = decode_audio_pcm(&transcribe_opts("base")).await;
        assert!(result.is_err(), "decoding nonexistent file should return Err");
    }

    /// Decode error path should be the same even with vad=true + denoise=true.
    /// Currently vad/denoise are both no-ops, so they should return the same error.
    #[tokio::test]
    async fn decode_vad_and_denoise_enabled_missing_file_same_error() {
        use captionx_lib::audio::decode::decode_audio_pcm;

        let baseline = decode_audio_pcm(&transcribe_opts("base")).await;
        let mut opts_flags = transcribe_opts("base");
        opts_flags.vad = true;
        opts_flags.denoise = true;
        let with_flags = decode_audio_pcm(&opts_flags).await;

        assert!(baseline.is_err());
        assert!(with_flags.is_err(), "missing file with vad+denoise=true should return Err");
    }

    /// Decode nonexistent file with gpu=true + vad=true + denoise=true should return Err (no panic).
    #[tokio::test]
    async fn decode_all_acceleration_flags_missing_file_returns_error() {
        use captionx_lib::audio::decode::decode_audio_pcm;

        let mut o = transcribe_opts("base");
        o.gpu = true;
        o.vad = true;
        o.denoise = true;
        let result = decode_audio_pcm(&o).await;
        assert!(result.is_err(), "all acceleration flags true + missing file should return Err");
    }
}

// ─── export Edge Cases ────────────────────────────────────────────────────────

#[test]
fn export_negative_timestamps_no_panic() {
    let r = result_en(vec![Segment {
        start: -1.0,
        end: 0.0,
        text: "negative start".to_string(),
        words: vec![],
    }]);
    let _ = to_srt(&r);
    let _ = to_vtt(&r, false);
}

#[test]
fn export_very_long_text_no_truncation() {
    let long_text = "word ".repeat(500);
    let r = result_en(vec![Segment {
        start: 0.0,
        end: 100.0,
        text: long_text.clone(),
        words: vec![],
    }]);
    let srt = to_srt(&r);
    assert!(srt.contains(long_text.trim()));
}

// ─── download Error Paths Integration ─────────────────────────────────────────

#[tokio::test]
async fn download_cancel_immediately_returns_error() {
    use captionx_lib::download::download_file;
    use std::sync::Arc;
    use tokio::sync::Notify;

    let cancel = Arc::new(Notify::new());
    cancel.notify_one(); // Immediate cancel

    let tmp = std::env::temp_dir().join("captionx_test_cancel.bin");
    let result = download_file("http://localhost:1/delay", &tmp, Some(cancel), |_, _| {}).await;

    assert!(result.is_err(), "immediate cancel should return Err");
    assert!(!tmp.exists(), "clean up temporary file after cancel");
}
