/// 스모크 테스트: 각 모듈의 공개 API가 기본 에러 경로에서 패닉하지 않고
/// 의미 있는 에러를 반환하는지 확인한다.
use captionx_lib::{
    edit::resplit_result,
    export::{serialize, to_json, to_srt, to_vtt},
    types::{ExportFormat, ResplitOptions, Segment, TranscriptResult},
};

fn empty_result() -> TranscriptResult {
    TranscriptResult {
        language: "en".to_string(),
        segments: vec![],
    }
}

fn single_seg(text: &str, start: f64, end: f64) -> TranscriptResult {
    TranscriptResult {
        language: "en".to_string(),
        segments: vec![Segment {
            start,
            end,
            text: text.to_string(),
            words: vec![],
        }],
    }
}

fn resplit_opts(max_chars: u32) -> ResplitOptions {
    ResplitOptions {
        max_chars,
        language: None,
        min_pause: None,
        gap_factor: None,
    }
}

// ─── export 스모크 ────────────────────────────────────────────────────────────

#[test]
fn smoke_export_empty_does_not_panic() {
    let r = empty_result();
    let _ = to_srt(&r);
    assert!(to_vtt(&r, false).starts_with("WEBVTT"));
    assert!(!to_json(&r, false).is_empty());
}

#[test]
fn smoke_serialize_all_formats() {
    let r = single_seg(" Hello world", 0.0, 2.0);
    for fmt in [ExportFormat::Srt, ExportFormat::Vtt, ExportFormat::Json] {
        let out = serialize(&r, &fmt, false);
        assert!(!out.is_empty(), "{fmt:?} 출력이 비어있어서는 안 됨");
    }
}

// ─── edit 스모크 ─────────────────────────────────────────────────────────────

#[test]
fn smoke_resplit_empty_result_is_noop() {
    let r = empty_result();
    let out = resplit_result(&r, &resplit_opts(40));
    assert!(out.segments.is_empty());
}

#[test]
fn smoke_resplit_zero_max_chars_does_not_panic() {
    let r = single_seg("hello world test sentence", 0.0, 5.0);
    let out = resplit_result(&r, &resplit_opts(0));
    assert!(!out.segments.is_empty());
}

// ─── CTC / vocab 스모크 ──────────────────────────────────────────────────────

#[test]
fn smoke_forced_align_empty_inputs_do_not_panic() {
    use captionx_lib::align::ctc::forced_align;
    let r = forced_align(&[], &[1usize, 2, 3], 0);
    assert_eq!(r.len(), 3);
    let r2 = forced_align(&[vec![0.5, 0.5]], &[], 0);
    assert!(r2.is_empty());
}

#[test]
fn smoke_log_softmax_no_nan() {
    use captionx_lib::align::ctc::log_softmax;
    for input in [
        vec![0.0_f32, 0.0, 0.0],
        vec![1000.0, 1000.0, 1000.0],
        vec![-1000.0, -1000.0, -1000.0],
        vec![f32::NEG_INFINITY, 0.0, 1.0],
        vec![1.0],
    ] {
        let out = log_softmax(&input);
        for v in &out {
            assert!(!f32::is_nan(*v), "입력 {input:?} 에서 NaN 발생");
        }
    }
}

#[test]
fn smoke_text_to_ids_empty_and_garbage() {
    use captionx_lib::align::vocab::{text_to_ids, WAV2VEC2_BLANK_ID};
    assert!(text_to_ids("").is_empty());
    assert!(text_to_ids("12345!@#$%").is_empty());
    let ids = text_to_ids("hello");
    assert!(!ids.is_empty());
    assert!(!ids.contains(&WAV2VEC2_BLANK_ID));
}

// ─── GPU/VAD/denoise 플래그 스모크 ───────────────────────────────────────────

/// TranscribeOptions에 gpu/vad/denoise 플래그를 모두 활성화해도 구조체 생성이 정상이어야 한다.
#[test]
fn smoke_transcribe_options_all_acceleration_flags_set() {
    use captionx_lib::types::{AlignMode, TranscribeOptions};

    let opts = TranscribeOptions {
        file_path: "test.mp4".to_string(),
        audio_track_index: None,
        audio_track_indices: None,
        model: "base".to_string(),
        language: None,
        align: false,
        align_mode: AlignMode::Wav2vec2,
        gpu: true,
        vad: true,
        denoise: true,
        hotwords: Some(vec!["테스트".to_string()]),
        threads: Some(4),
    };
    assert!(opts.gpu);
    assert!(opts.vad);
    assert!(opts.denoise);
}

/// gpu=false, vad=false, denoise=false 기본값 조합도 정상 생성.
#[test]
fn smoke_transcribe_options_all_flags_false() {
    use captionx_lib::types::{AlignMode, TranscribeOptions};

    let opts = TranscribeOptions {
        file_path: "test.mp4".to_string(),
        audio_track_index: None,
        audio_track_indices: None,
        model: "base".to_string(),
        language: None,
        align: false,
        align_mode: AlignMode::Wav2vec2,
        gpu: false,
        vad: false,
        denoise: false,
        hotwords: None,
        threads: None,
    };
    assert!(!opts.gpu);
    assert!(!opts.vad);
    assert!(!opts.denoise);
}

/// TranscribeOptions JSON 직렬화·역직렬화에서 gpu/vad/denoise 필드가 유지돼야 한다.
#[test]
fn smoke_transcribe_options_flags_roundtrip_json() {
    use captionx_lib::types::{AlignMode, TranscribeOptions};

    let opts = TranscribeOptions {
        file_path: "test.mp4".to_string(),
        audio_track_index: None,
        audio_track_indices: None,
        model: "base".to_string(),
        language: None,
        align: false,
        align_mode: AlignMode::Wav2vec2,
        gpu: true,
        vad: true,
        denoise: true,
        hotwords: None,
        threads: Some(2),
    };

    let json = serde_json::to_string(&opts).expect("직렬화 실패");
    let parsed: TranscribeOptions = serde_json::from_str(&json).expect("역직렬화 실패");

    assert_eq!(parsed.gpu, opts.gpu, "gpu 필드 보존");
    assert_eq!(parsed.vad, opts.vad, "vad 필드 보존");
    assert_eq!(parsed.denoise, opts.denoise, "denoise 필드 보존");
}

// ─── download 스모크 ─────────────────────────────────────────────────────────

#[tokio::test]
async fn smoke_download_invalid_url_returns_error() {
    let tmp = std::env::temp_dir().join("captionx_smoke_dl_test.bin");
    let result = captionx_lib::download::download_file(
        "http://localhost:1/nonexistent",
        &tmp,
        None,
        |_, _| {},
    )
    .await;
    assert!(result.is_err(), "연결 불가 URL 은 Err 를 반환해야 함");
    assert!(!tmp.with_extension("bin.part").exists(), ".part 파일 누수");
}

#[tokio::test]
async fn smoke_download_empty_url_returns_error() {
    let tmp = std::env::temp_dir().join("captionx_smoke_empty_url.bin");
    let result = captionx_lib::download::download_file("", &tmp, None, |_, _| {}).await;
    assert!(result.is_err());
}
