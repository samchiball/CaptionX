use sysinfo::System;
use tauri::command;

use crate::types::{HardwareInfo, SystemMemoryInfo};

#[command]
pub async fn get_hardware_info() -> Result<HardwareInfo, String> {
    let mut sys = System::new_all();
    sys.refresh_memory();

    let total_mb = sys.total_memory() / (1024 * 1024);
    let free_mb = sys.available_memory() / (1024 * 1024);

    Ok(HardwareInfo {
        ram: SystemMemoryInfo {
            total: total_mb,
            free: free_mb,
        },
        // GPU 정보는 추후 nvml 또는 wgpu로 구현
        gpu: None,
    })
}

#[command]
pub fn get_version(app: tauri::AppHandle) -> String {
    app.package_info().version.to_string()
}
