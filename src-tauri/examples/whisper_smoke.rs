//! 최소 콘솔 재현기 — STATUS_STACK_BUFFER_OVERRUN(0xC0000409) 진단용.
//!
//! webview 없이 whisper_rs 를 직접 호출해 어떤 파라미터 설정이
//! C++ 예외(std::length_error / bad_alloc)를 유발하는지 이분 탐색한다.
//!
//! 실행:
//!   cargo run --example whisper_smoke --no-default-features
//!
//! 환경변수:
//!   WHISPER_MODEL  모델 파일 경로 (기본: %APPDATA%\CaptionX\models\ggml-base-q5_1.bin)
//!   WHISPER_STAGE  0=무설정 1=+threads 2=+print끄기 3=+token_timestamps 4=+best_of5
//!                  (기본 4 — 현재 코드와 동일)

use std::path::PathBuf;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

fn default_model() -> PathBuf {
    if let Ok(p) = std::env::var("WHISPER_MODEL") {
        return PathBuf::from(p);
    }
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".into());
    PathBuf::from(appdata)
        .join("CaptionX")
        .join("models")
        .join("ggml-base-q5_1.bin")
}

fn main() {
    let stage: u32 = std::env::var("WHISPER_STAGE")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(4);

    let path = default_model();
    println!("[smoke] 모델: {}", path.display());
    println!("[smoke] STAGE = {stage}");
    if !path.exists() {
        eprintln!("[smoke] 모델 파일이 없습니다. WHISPER_MODEL 로 경로를 지정하세요.");
        std::process::exit(2);
    }

    // 실제 파일 디코딩 경로 (WHISPER_FILE 지정 시) — 프로덕션과 동일한 ffmpeg 추출
    let pcm: Vec<f32> = if let Ok(file) = std::env::var("WHISPER_FILE") {
        println!("[smoke] ffmpeg 디코딩: {file}");
        let out = std::process::Command::new(ffmpeg_sidecar::paths::ffmpeg_path())
            .args([
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                &file,
                "-map",
                "0:a:0",
                "-ac",
                "1",
                "-ar",
                "16000",
                "-f",
                "f32le",
                "pipe:1",
            ])
            .stderr(std::process::Stdio::null())
            .output()
            .expect("ffmpeg 실행 실패");
        if !out.status.success() {
            eprintln!("[smoke] ffmpeg 실패: {:?}", out.status.code());
            std::process::exit(3);
        }
        out.stdout
            .chunks_exact(4)
            .map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]]))
            .collect()
    } else {
        // 합성 오디오: WHISPER_SECS 초, WHISPER_WAVE = silence|sine|noise
        let secs: usize = std::env::var("WHISPER_SECS")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(3);
        let wave = std::env::var("WHISPER_WAVE").unwrap_or_else(|_| "silence".into());
        let n = 16000 * secs;
        match wave.as_str() {
            "sine" => (0..n)
                .map(|i| (i as f32 * 440.0 * 2.0 * std::f32::consts::PI / 16000.0).sin() * 0.3)
                .collect(),
            "noise" => {
                let mut s = 0x12345678u32;
                (0..n)
                    .map(|_| {
                        s = s.wrapping_mul(1664525).wrapping_add(1013904223);
                        (s as f32 / u32::MAX as f32 - 0.5) * 0.3
                    })
                    .collect()
            }
            _ => vec![0.0f32; n],
        }
    };
    println!(
        "[smoke] PCM {} 샘플 ({:.1}초)",
        pcm.len(),
        pcm.len() as f32 / 16000.0
    );

    // 충실 모드: 프로덕션 run_whisper 를 멀티스레드 tokio 런타임에서 그대로 호출
    if std::env::var("WHISPER_FAITHFUL").is_ok() {
        let threads: i32 = std::env::var("WHISPER_THREADS")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(4);
        println!("[smoke] FAITHFUL 모드: run_whisper, threads={threads}");
        let opts = captionx_lib::types::TranscribeOptions {
            file_path: "x".into(),
            audio_track_index: None,
            audio_track_indices: None,
            model: "base-q5_1".into(),
            language: std::env::var("WHISPER_LANG").ok(),
            align: false,
            align_mode: captionx_lib::types::AlignMode::Wav2vec2,
            gpu: false,
            vad: false,
            denoise: false,
            hotwords: None,
            threads: Some(threads as u32),
        };
        let models_dir = path.parent().unwrap().to_path_buf();
        let rt = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(4)
            .enable_all()
            .build()
            .unwrap();
        let r = rt.block_on(captionx_lib::asr::whisper::run_whisper(
            &opts, &pcm, models_dir,
        ));
        match r {
            Ok(res) => {
                println!("[smoke] FAITHFUL 성공! 세그먼트 {}개", res.segments.len());
                println!("[smoke] DONE");
            }
            Err(e) => {
                eprintln!("[smoke] FAITHFUL 에러: {e:#}");
                std::process::exit(1);
            }
        }
        return;
    }

    println!("[smoke] 컨텍스트 로드...");
    let ctx = WhisperContext::new_with_params(
        path.to_str().unwrap(),
        WhisperContextParameters::default(),
    )
    .expect("컨텍스트 로드 실패");

    println!("[smoke] 상태 생성...");
    let mut state = ctx.create_state().expect("상태 생성 실패");

    println!("[smoke] 파라미터 구성 (stage {stage})...");
    let sampling = if stage >= 4 {
        SamplingStrategy::Greedy { best_of: 5 }
    } else {
        SamplingStrategy::Greedy { best_of: 1 }
    };
    let mut params = FullParams::new(sampling);

    if stage >= 1 {
        let threads: i32 = std::env::var("WHISPER_THREADS")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(1);
        println!("[smoke] n_threads = {threads}");
        params.set_n_threads(threads);
    }
    if stage >= 2 {
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_special(false);
        params.set_print_timestamps(false);
    }
    if stage >= 3 {
        params.set_token_timestamps(true);
    }

    println!("[smoke] state.full() 호출 — 여기서 크래시 발생 예상...");
    state.full(params, &pcm).expect("전사 실패");

    let n = state.full_n_segments();
    println!("[smoke] 성공! 세그먼트 {n}개");
    for i in 0..n {
        if let Some(seg) = state.get_segment(i) {
            let t = seg
                .to_str_lossy()
                .map(|s| s.into_owned())
                .unwrap_or_default();
            println!("  seg[{i}] = {t:?}");
        }
    }
    println!("[smoke] DONE");
}
