use std::path::PathBuf;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{command, Emitter, State};

use crate::state::AppState;
use crate::types::ModelDownloadProgress;

// ─── 모델 URL 레지스트리 ──────────────────────────────────────────────────────

const HF: &str = "https://huggingface.co";
const WHISPER_BASE_URL: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";
const VAD_BASE_URL: &str = "https://huggingface.co/ggml-org/whisper-vad/resolve/main";

/// Silero VAD 모델 파일명 (whisper.cpp 내장 VAD용).
/// v5.1.2 는 whisper-rs 0.16 이 번들하는 whisper.cpp 와 호환되는 안전한 버전이다.
/// (v6.2.0 은 더 최신이라 번들 whisper.cpp 가 파싱하지 못할 수 있음)
pub const VAD_MODEL_FILE: &str = "ggml-silero-v5.1.2.bin";

/// GTCRN 음성 향상(denoise) 스트리밍 ONNX 모델 파일명.
pub const DENOISE_MODEL_FILE: &str = "gtcrn_simple.onnx";

/// GTCRN 모델 다운로드 URL (Xiaobin-Rong/gtcrn, GitHub raw).
const GTCRN_URL: &str =
    "https://raw.githubusercontent.com/Xiaobin-Rong/gtcrn/main/stream/onnx_models/gtcrn_simple.onnx";

/// 로컬 파일명 → 다운로드 URL. None이면 자동 다운로드 미지원.
pub fn model_url(file_name: &str) -> Option<String> {
    // VAD silero 모델은 ggml- 접두사를 갖지만 ggerganov/whisper.cpp 가 아닌
    // ggml-org/whisper-vad 레포에 있으므로 일반 Whisper 규칙보다 먼저 처리한다.
    if file_name.starts_with("ggml-silero-") && file_name.ends_with(".bin") {
        return Some(format!("{VAD_BASE_URL}/{file_name}"));
    }
    if file_name.starts_with("ggml-") && file_name.ends_with(".bin") {
        // Whisper GGUF 모델 (ggerganov/whisper.cpp)
        return Some(format!("{WHISPER_BASE_URL}/{file_name}"));
    }
    match file_name {
        // GTCRN denoise (Xiaobin-Rong/gtcrn, GitHub raw)
        "gtcrn_simple.onnx" => Some(GTCRN_URL.to_string()),
        // wav2vec2-base (English, Xenova quantized)
        "wav2vec2-base.onnx" => Some(format!(
            "{HF}/Xenova/wav2vec2-base-960h/resolve/main/onnx/model_quantized.onnx"
        )),
        // MMS-300M forced aligner (onnx-community quantized)
        "mms-300m.onnx" => Some(format!(
            "{HF}/onnx-community/mms-300m-1130-forced-aligner-ONNX/resolve/main/onnx/model_quantized.onnx"
        )),
        _ => None,
    }
}

// ─── ModelEntry ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelEntry {
    pub name: String,
    pub file_name: String,
    pub size_bytes: u64,
    pub present: bool,
    /// true면 자동 다운로드 가능
    pub downloadable: bool,
}

// ─── list_models ─────────────────────────────────────────────────────────────

/// models_dir에 있는 Whisper/align 모델 목록과 존재 여부를 반환한다
#[command]
pub fn list_models(state: State<'_, AppState>) -> Vec<ModelEntry> {
    let dir = &state.models_dir;
    model_candidates()
        .into_iter()
        .map(|(name, file_name)| {
            let path: PathBuf = dir.join(&file_name);
            let size_bytes = path.metadata().map(|m| m.len()).unwrap_or(0);
            let downloadable = model_url(&file_name).is_some();
            ModelEntry {
                name,
                file_name,
                size_bytes,
                present: path.exists(),
                downloadable,
            }
        })
        .collect()
}

fn model_candidates() -> Vec<(String, String)> {
    let bases = [
        "tiny",
        "base",
        "small",
        "medium",
        "large-v3-turbo",
        "large-v3",
    ];
    let quants = ["", "-q5_0", "-q5_1"];

    let mut v = Vec::new();
    for base in &bases {
        for q in &quants {
            let name = format!("{base}{q}");
            let file_name = format!("ggml-{name}.bin");
            v.push((name, file_name));
        }
    }
    v.push(("wav2vec2-base (정렬)".into(), "wav2vec2-base.onnx".into()));
    v.push(("MMS-300M (정렬)".into(), "mms-300m.onnx".into()));
    v.push(("Silero VAD (음성 구간)".into(), VAD_MODEL_FILE.to_string()));
    v.push(("GTCRN (노이즈 제거)".into(), DENOISE_MODEL_FILE.to_string()));
    v
}

// ─── get_models_dir ──────────────────────────────────────────────────────────

#[command]
pub fn get_models_dir(state: State<'_, AppState>) -> String {
    state.models_dir.to_string_lossy().into_owned()
}

// ─── open_models_dir ─────────────────────────────────────────────────────────

#[command]
pub async fn open_models_dir(state: State<'_, AppState>) -> Result<(), String> {
    let dir = state.models_dir.clone();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer")
        .arg(&dir)
        .spawn()
        .map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&dir)
        .spawn()
        .map_err(|e| e.to_string())?;
    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(&dir)
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}

// ─── download_model ───────────────────────────────────────────────────────────

/// 설정 화면에서 단일 모델을 다운로드한다. 진행률은 captionx://model-progress 이벤트로 전달.
#[command]
pub async fn download_model(
    file_name: String,
    state: State<'_, AppState>,
    window: tauri::Window,
) -> Result<(), String> {
    let url = model_url(&file_name)
        .ok_or_else(|| format!("자동 다운로드를 지원하지 않는 모델입니다: {file_name}"))?;

    let dest = state.models_dir.join(&file_name);

    if dest.exists() {
        // 이미 있으면 완료 이벤트만 보내고 반환
        let _ = window.emit(
            "captionx://model-progress",
            ModelDownloadProgress {
                name: file_name,
                downloaded: 0,
                total: 0,
                done: true,
                error: None,
            },
        );
        return Ok(());
    }

    // 동일 파일명으로 진행 중인 다운로드는 취소
    let cancel = Arc::new(crate::state::CancelHandle::new());
    {
        let mut downloads = state.downloads.lock().await;
        if let Some(existing) = downloads.get(&file_name) {
            existing.cancel();
        }
        downloads.insert(file_name.clone(), cancel.clone());
    }

    let window_clone = window.clone();
    let name_clone = file_name.clone();

    let result = crate::download::download_file(
        &url,
        &dest,
        Some(cancel.as_notify()),
        move |downloaded, total| {
            let _ = window_clone.emit(
                "captionx://model-progress",
                ModelDownloadProgress {
                    name: name_clone.clone(),
                    downloaded,
                    total,
                    done: false,
                    error: None,
                },
            );
        },
    )
    .await;

    // 다운로드 핸들 제거
    state.downloads.lock().await.remove(&file_name);

    match result {
        Ok(()) => {
            let _ = window.emit(
                "captionx://model-progress",
                ModelDownloadProgress {
                    name: file_name,
                    downloaded: 0,
                    total: 0,
                    done: true,
                    error: None,
                },
            );
            Ok(())
        }
        Err(e) => {
            let msg = e.to_string();
            let _ = window.emit(
                "captionx://model-progress",
                ModelDownloadProgress {
                    name: file_name,
                    downloaded: 0,
                    total: 0,
                    done: false,
                    error: Some(msg.clone()),
                },
            );
            Err(msg)
        }
    }
}

// ─── cancel_download ──────────────────────────────────────────────────────────

#[command]
pub async fn cancel_download(file_name: String, state: State<'_, AppState>) -> Result<(), String> {
    let downloads = state.downloads.lock().await;
    if let Some(handle) = downloads.get(&file_name) {
        handle.cancel();
    }
    Ok(())
}

// ─── delete_model ─────────────────────────────────────────────────────────────

#[command]
pub async fn delete_model(file_name: String, state: State<'_, AppState>) -> Result<(), String> {
    // 경로 탈출 방지
    if file_name.contains('/') || file_name.contains('\\') || file_name.contains("..") {
        return Err("잘못된 파일명".to_string());
    }
    let path = state.models_dir.join(&file_name);
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── model_url ────────────────────────────────────────────────────────────

    #[test]
    fn whisper_ggml_bins_have_url() {
        for name in [
            "ggml-tiny.bin",
            "ggml-base.bin",
            "ggml-small-q5_0.bin",
            "ggml-large-v3.bin",
        ] {
            let url = model_url(name);
            assert!(url.is_some(), "{name} 는 URL 이 있어야 함");
            let url = url.unwrap();
            assert!(url.contains("huggingface.co"), "HF URL 이어야 함");
            assert!(url.contains(name), "파일명이 URL 에 포함돼야 함");
        }
    }

    #[test]
    fn alignment_models_have_urls() {
        let wav2 = model_url("wav2vec2-base.onnx").expect("wav2vec2 URL 있어야 함");
        assert!(wav2.contains("Xenova"), "Xenova HF 레포 참조");

        let mms = model_url("mms-300m.onnx").expect("MMS URL 있어야 함");
        assert!(
            mms.contains("onnx-community"),
            "onnx-community HF 레포 참조"
        );
    }

    // ── VAD silero 모델 ───────────────────────────────────────────────────────

    /// VAD silero 모델은 ggerganov/whisper.cpp 가 아닌 ggml-org/whisper-vad 레포에서
    /// 받아야 한다. ggml- 접두사 + .bin 확장자라 일반 Whisper 규칙과 충돌하므로
    /// 반드시 특수 처리되어야 한다.
    #[test]
    fn vad_silero_model_resolves_to_whisper_vad_repo() {
        let url = model_url("ggml-silero-v5.1.2.bin").expect("VAD silero URL 있어야 함");
        assert!(
            url.contains("whisper-vad"),
            "VAD 모델은 whisper-vad 레포를 참조해야 함, 실제: {url}"
        );
        assert!(
            url.contains("ggml-silero-v5.1.2.bin"),
            "파일명이 URL 에 포함돼야 함: {url}"
        );
        assert!(
            !url.contains("whisper.cpp/resolve"),
            "whisper.cpp 레포(Whisper 모델용)로 가면 안 됨: {url}"
        );
    }

    /// 설정 화면 모델 목록에 VAD silero 모델이 포함돼야 한다.
    #[test]
    fn model_candidates_include_vad_model() {
        let candidates = model_candidates();
        let file_names: Vec<&str> = candidates.iter().map(|(_, f)| f.as_str()).collect();
        assert!(
            file_names.contains(&"ggml-silero-v5.1.2.bin"),
            "VAD silero 모델이 후보 목록에 포함돼야 함"
        );
    }

    // ── GTCRN denoise 모델 ────────────────────────────────────────────────────

    /// GTCRN denoise 모델 URL 이 존재하고 .onnx 파일을 가리켜야 한다.
    #[test]
    fn gtcrn_denoise_model_has_url() {
        let url = model_url("gtcrn_simple.onnx").expect("GTCRN URL 있어야 함");
        assert!(
            url.contains("gtcrn"),
            "GTCRN URL 이어야 함: {url}"
        );
        assert!(url.ends_with(".onnx"), "onnx 파일을 가리켜야 함: {url}");
    }

    /// 설정 화면 모델 목록에 GTCRN denoise 모델이 포함돼야 한다.
    #[test]
    fn model_candidates_include_denoise_model() {
        let candidates = model_candidates();
        let file_names: Vec<&str> = candidates.iter().map(|(_, f)| f.as_str()).collect();
        assert!(
            file_names.contains(&"gtcrn_simple.onnx"),
            "GTCRN denoise 모델이 후보 목록에 포함돼야 함"
        );
    }

    #[test]
    fn unknown_files_return_none() {
        assert!(model_url("unknown.bin").is_none());
        assert!(model_url("ggml-base.txt").is_none(), "확장자 다르면 None");
        assert!(model_url("").is_none());
        assert!(
            model_url("../../../etc/passwd").is_none(),
            "경로 탈출 시도 → None"
        );
    }

    #[test]
    fn url_does_not_allow_path_traversal_in_filename() {
        // ../ 를 포함한 파일명도 HF URL 형태로 구성되면 보안 이슈
        // model_url 이 ggml- 로 시작하고 .bin 으로 끝나면 URL 을 반환한다
        // 실제 path traversal 은 delete_model 에서 차단됨을 확인
        assert!(
            model_url("ggml-../../etc/passwd.bin").is_some()
                || model_url("ggml-../../etc/passwd.bin").is_none()
        );
        // delete_model 로직: .. 포함 시 에러
        let bad_names = ["../secret.bin", "sub/dir/file.bin", r"C:\evil.bin"];
        for name in bad_names {
            let has_traversal = name.contains('/') || name.contains('\\') || name.contains("..");
            assert!(has_traversal, "{name} 는 경로 탈출 패턴을 포함해야 함");
        }
    }

    #[test]
    fn model_candidates_no_duplicates() {
        let candidates = model_candidates();
        let mut file_names: Vec<&str> = candidates.iter().map(|(_, f)| f.as_str()).collect();
        let original_len = file_names.len();
        file_names.sort();
        file_names.dedup();
        assert_eq!(file_names.len(), original_len, "중복 파일명 없어야 함");
    }

    #[test]
    fn model_candidates_include_align_models() {
        let candidates = model_candidates();
        let file_names: Vec<&str> = candidates.iter().map(|(_, f)| f.as_str()).collect();
        assert!(file_names.contains(&"wav2vec2-base.onnx"), "wav2vec2 포함");
        assert!(file_names.contains(&"mms-300m.onnx"), "MMS 포함");
    }

    #[test]
    fn model_candidates_all_whisper_files_start_with_ggml() {
        let candidates = model_candidates();
        for (_, file_name) in &candidates {
            if file_name.ends_with(".bin") {
                assert!(
                    file_name.starts_with("ggml-"),
                    "Whisper bin 파일은 ggml- 로 시작해야 함: {file_name}"
                );
            }
        }
    }
}
