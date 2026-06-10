pub mod audio;
pub mod commands;
pub mod download;
pub mod edit;
pub mod export;
pub mod history;
pub mod state;
pub mod types;

pub mod align;
pub mod asr;

use state::AppState;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        // tauri-plugin-updater triggers a STATUS_STACK_BUFFER_OVERRUN crash during
        // initialization of rustls-platform-verifier on Windows when unimplemented.
        // Uncomment this when implementing updater features.
        // .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let models_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."))
                .join("models");
            app.manage(AppState::new(models_dir));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_hardware_info,
            commands::get_models_dir,
            commands::open_models_dir,
            commands::list_models,
            commands::download_model,
            commands::cancel_download,
            commands::delete_model,
            commands::get_version,
            commands::select_files,
            commands::get_data_paths,
            commands::open_data_path,
            commands::prepare_media,
            commands::get_waveform,
            commands::probe_tracks,
            commands::transcribe,
            commands::cancel_job,
            commands::release_result,
            commands::resplit,
            commands::export_subtitle,
            commands::history_list,
            commands::history_delete,
            commands::history_load,
            commands::update_check,
            commands::update_download,
            commands::update_install,
            commands::update_open_release_page,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
