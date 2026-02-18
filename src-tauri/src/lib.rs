use std::fs;
use std::path::PathBuf;
use tauri::Manager;

fn get_data_dir(app: &tauri::AppHandle) -> PathBuf {
    let base = app.path().app_data_dir().expect("failed to get app data dir");
    let data_dir = base.join("data");
    if !data_dir.exists() {
        fs::create_dir_all(&data_dir).expect("failed to create data dir");
    }
    data_dir
}

#[tauri::command]
fn read_accounts(app: tauri::AppHandle) -> Result<String, String> {
    let path = get_data_dir(&app).join("accounts.json");
    if !path.exists() {
        return Ok("[]".to_string());
    }
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_accounts(app: tauri::AppHandle, data: String) -> Result<(), String> {
    let path = get_data_dir(&app).join("accounts.json");
    fs::write(&path, data).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_groups(app: tauri::AppHandle) -> Result<String, String> {
    let path = get_data_dir(&app).join("groups.json");
    if !path.exists() {
        return Ok("[]".to_string());
    }
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_groups(app: tauri::AppHandle, data: String) -> Result<(), String> {
    let path = get_data_dir(&app).join("groups.json");
    fs::write(&path, data).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_accounts,
            write_accounts,
            read_groups,
            write_groups
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
