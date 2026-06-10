use anyhow::{Context, Result};
use std::path::PathBuf;
use std::process::{Command, Stdio};

use crate::types::TranscribeOptions;

fn ffmpeg_bin() -> PathBuf {
    ffmpeg_sidecar::paths::ffmpeg_path()
}

/// 오디오 파일에서 16 kHz mono f32le PCM 샘플을 추출한다 (Whisper 입력용)
///
/// `options.denoise` 는 여기서 처리하지 않는다. denoise(GTCRN)는 파이프라인
/// (`commands::transcribe::run_pipeline`)에서 decode 직후·whisper 전에
/// `audio::denoise::denoise_pcm` 으로 적용된다.
pub async fn decode_audio_pcm(options: &TranscribeOptions) -> Result<Vec<f32>> {
    let file_path = options.file_path.clone();
    let track_index = options.audio_track_index.unwrap_or(0);

    tokio::task::spawn_blocking(move || {
        let output = Command::new(ffmpeg_bin())
            .args([
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                &file_path,
                "-map",
                &format!("0:a:{track_index}"),
                "-ac",
                "1",
                "-ar",
                "16000",
                "-f",
                "f32le",
                "pipe:1",
            ])
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .output()
            .context("ffmpeg PCM 추출 실패")?;

        if !output.status.success() {
            return Err(anyhow::anyhow!(
                "ffmpeg 오류 (code {:?})",
                output.status.code()
            ));
        }

        let bytes = &output.stdout;
        let samples: Vec<f32> = bytes
            .chunks_exact(4)
            .map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]]))
            .collect();

        Ok(samples)
    })
    .await
    .context("PCM 디코딩 스레드 오류")?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{AlignMode, TranscribeOptions};

    fn opts(file_path: &str) -> TranscribeOptions {
        TranscribeOptions {
            file_path: file_path.to_string(),
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
            threads: Some(1),
        }
    }

    /// 존재하지 않는 파일 → ffmpeg 오류 → Err 반환
    #[tokio::test]
    async fn test_decode_missing_file_returns_error() {
        let result = decode_audio_pcm(&opts("/nonexistent/no_such_file.mp4")).await;
        assert!(result.is_err(), "존재하지 않는 파일은 Err 를 반환해야 한다");
    }

    /// 빈 파일 경로 → Err 반환
    #[tokio::test]
    async fn test_decode_empty_path_returns_error() {
        let result = decode_audio_pcm(&opts("")).await;
        assert!(result.is_err(), "빈 경로는 Err 를 반환해야 한다");
    }

    /// denoise=true 이어도 존재하지 않는 파일 → Err 반환 (패닉 없음)
    /// 현재 denoise 는 no-op 이므로 동작은 denoise=false 와 동일해야 한다.
    #[tokio::test]
    async fn test_decode_denoise_true_missing_file_returns_error() {
        let mut o = opts("/nonexistent/no_such.mp4");
        o.denoise = true;
        let result = decode_audio_pcm(&o).await;
        assert!(result.is_err(), "denoise=true 여도 missing file → Err");
    }

    /// denoise=true 빈 경로 → Err 반환 (패닉 없음)
    #[tokio::test]
    async fn test_decode_denoise_true_empty_path_returns_error() {
        let mut o = opts("");
        o.denoise = true;
        let result = decode_audio_pcm(&o).await;
        assert!(result.is_err(), "denoise=true + 빈 경로 → Err");
    }

    /// vad=true 이어도 존재하지 않는 파일 → Err 반환 (패닉 없음)
    /// 현재 vad 는 decode 단계에서 no-op 이다.
    #[tokio::test]
    async fn test_decode_vad_true_missing_file_returns_error() {
        let mut o = opts("/nonexistent/no_such.mp4");
        o.vad = true;
        let result = decode_audio_pcm(&o).await;
        assert!(result.is_err(), "vad=true 여도 missing file → Err");
    }

    /// gpu=true + vad=true + denoise=true 조합 → Err 반환 (패닉 없음)
    #[tokio::test]
    async fn test_decode_all_flags_true_missing_file_returns_error() {
        let mut o = opts("/nonexistent/no_such.mp4");
        o.gpu = true;
        o.vad = true;
        o.denoise = true;
        let result = decode_audio_pcm(&o).await;
        assert!(result.is_err(), "모든 플래그 true + missing file → Err (패닉 없음)");
    }
}
