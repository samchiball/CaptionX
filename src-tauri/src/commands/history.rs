use tauri::{command, Manager, State};

use crate::history::{delete_entry, get_entry, list_entries, save_entry};
use crate::state::{AppState, ResultEntry};
use crate::types::{HistoryEntryMeta, TranscriptResult};

fn history_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.join("history"))
        .map_err(|e| e.to_string())
}

#[command]
pub async fn history_list(app: tauri::AppHandle) -> Result<Vec<HistoryEntryMeta>, String> {
    let dir = history_dir(&app)?;
    tokio::task::spawn_blocking(move || list_entries(&dir).map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}

#[command]
pub async fn history_delete(id: String, app: tauri::AppHandle) -> Result<(), String> {
    let dir = history_dir(&app)?;
    tokio::task::spawn_blocking(move || delete_entry(&dir, &id).map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}

#[command]
pub async fn history_load(
    id: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<TranscriptResult, String> {
    let dir = history_dir(&app)?;
    let entry =
        tokio::task::spawn_blocking(move || get_entry(&dir, &id).map_err(|e| e.to_string()))
            .await
            .map_err(|e| e.to_string())??;

    let entry = entry.ok_or("불러올 보관함 항목을 찾을 수 없습니다.")?;
    let result = entry.result.clone();
    let source_path = entry.meta.source_path.clone();
    let id = entry.meta.id.clone();

    state.results.lock().await.insert(
        id,
        ResultEntry {
            original_result: result.clone(),
            current_result: result.clone(),
            source_path,
        },
    );

    Ok(result)
}

/// 전사 완료 후 보관함에 저장 (내부 호출용)
pub async fn persist_to_history(
    app: &tauri::AppHandle,
    meta: &HistoryEntryMeta,
    result: &TranscriptResult,
) {
    let dir = match app.path().app_data_dir() {
        Ok(d) => d.join("history"),
        Err(_) => return,
    };
    let m = meta.clone();
    let r = result.clone();
    let _ = tokio::task::spawn_blocking(move || save_entry(&dir, &m, &r)).await;
}
