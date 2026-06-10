use tauri::{command, Manager};

use crate::audio::{get_waveform as waveform_impl, prepare_media_audio, probe_audio_tracks};
use crate::types::{AudioTrack, DataPaths};

#[command]
pub async fn select_files(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let files = app
        .dialog()
        .file()
        .add_filter(
            "미디어 파일",
            &[
                "mp3", "wav", "m4a", "flac", "ogg", "aac", "opus", "mp4", "mkv", "mov", "webm",
                "avi",
            ],
        )
        .blocking_pick_files();

    match files {
        Some(paths) => Ok(paths
            .into_iter()
            .filter_map(|p| p.into_path().ok())
            .map(|p| p.to_string_lossy().into_owned())
            .collect()),
        None => Ok(vec![]),
    }
}

#[command]
pub async fn prepare_media(
    file_path: String,
    track_index: Option<u32>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("preview-cache");

    tokio::task::spawn_blocking(move || {
        prepare_media_audio(&file_path, track_index, &cache_dir).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[command]
pub async fn get_waveform(audio_path: String) -> Result<Vec<f32>, String> {
    tokio::task::spawn_blocking(move || waveform_impl(&audio_path).map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}

#[command]
pub async fn probe_tracks(file_path: String) -> Result<Vec<AudioTrack>, String> {
    tokio::task::spawn_blocking(move || probe_audio_tracks(&file_path).map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}

fn mask_home(path: std::path::PathBuf) -> String {
    let s = path.to_string_lossy().into_owned();
    if let Some(home) = dirs::home_dir() {
        let home_s = home.to_string_lossy();
        if s.starts_with(home_s.as_ref()) {
            return format!("~{}", &s[home_s.len()..]);
        }
    }
    s
}

#[command]
pub async fn get_data_paths(app: tauri::AppHandle) -> Result<DataPaths, String> {
    let data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(DataPaths {
        history: mask_home(data.join("history")),
        audio_cache: mask_home(
            app.path()
                .app_cache_dir()
                .map_err(|e| e.to_string())?
                .join("preview-cache"),
        ),
    })
}

#[command]
pub async fn open_data_path(key: String, app: tauri::AppHandle) -> Result<(), String> {
    let target = match key.as_str() {
        "history" => app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("history"),
        "audioCache" => app
            .path()
            .app_cache_dir()
            .map_err(|e| e.to_string())?
            .join("preview-cache"),
        _ => return Err(format!("알 수 없는 키: {key}")),
    };
    std::fs::create_dir_all(&target).map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer")
        .arg(&target)
        .spawn()
        .map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&target)
        .spawn()
        .map_err(|e| e.to_string())?;
    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(&target)
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}
