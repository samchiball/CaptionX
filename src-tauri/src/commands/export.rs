use tauri::{command, State};
use tauri_plugin_dialog::DialogExt;

use crate::export::serialize;
use crate::state::AppState;
use crate::types::ExportOptions;

#[command]
pub async fn export_subtitle(
    job_id: String,
    options: ExportOptions,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<Option<String>, String> {
    let (source_path, result, format, include_words) = {
        let results = state.results.lock().await;
        let entry = results
            .get(&job_id)
            .ok_or("내보낼 전사 결과를 찾을 수 없습니다.")?;
        (
            entry.source_path.clone(),
            entry.current_result.clone(),
            options.format.clone(),
            options.include_words,
        )
    };

    let ext = match &format {
        crate::types::ExportFormat::Srt => "srt",
        crate::types::ExportFormat::Vtt => "vtt",
        crate::types::ExportFormat::Json => "json",
    };
    let stem = std::path::Path::new(&source_path)
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "output".to_string());

    let save_path = app
        .dialog()
        .file()
        .add_filter(ext.to_uppercase().as_str(), &[ext])
        .set_file_name(format!("{stem}.{ext}"))
        .blocking_save_file();

    match save_path {
        Some(path) => {
            let path = path.into_path().map_err(|e| e.to_string())?;
            let content = serialize(&result, &format, include_words);
            std::fs::write(&path, content).map_err(|e| e.to_string())?;
            Ok(Some(path.to_string_lossy().into_owned()))
        }
        None => Ok(None),
    }
}
