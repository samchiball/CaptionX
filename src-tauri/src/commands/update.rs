use tauri::command;

use crate::types::{UpdatePhase, UpdateStatus};

#[command]
pub async fn update_check() -> Result<UpdateStatus, String> {
    // TODO: tauri-plugin-updater로 구현
    Ok(UpdateStatus {
        phase: UpdatePhase::Idle,
        version: None,
        percent: None,
        message: None,
    })
}

#[command]
pub async fn update_download() -> Result<(), String> {
    Err("미구현: update_download".to_string())
}

#[command]
pub async fn update_install() -> Result<(), String> {
    Err("미구현: update_install".to_string())
}

#[command]
pub async fn update_open_release_page() -> Result<(), String> {
    // tauri-plugin-opener 또는 OS 기본 브라우저로 열기
    #[cfg(target_os = "windows")]
    std::process::Command::new("cmd")
        .args([
            "/c",
            "start",
            "https://github.com/samchiball/captionX/releases/latest",
        ])
        .spawn()
        .map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg("https://github.com/samchiball/captionX/releases/latest")
        .spawn()
        .map_err(|e| e.to_string())?;
    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg("https://github.com/samchiball/captionX/releases/latest")
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}
