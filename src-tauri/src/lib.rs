use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;
use keyring::Entry;
use reqwest::header::CONTENT_TYPE;
use reqwest::StatusCode;
use tauri::Manager;

const LEGACY_APP_IDENTIFIER: &str = "com.twofa-web-tool.desktop";
const DATA_FILES: [&str; 2] = ["accounts.json", "groups.json"];
const WEBDAV_PASSWORD_SERVICE: &str = "com.mfa-tool.desktop.webdav";
const WEBDAV_PASSWORD_ACCOUNT: &str = "default";

fn migrate_legacy_data(app: &tauri::AppHandle, data_dir: &Path) -> Result<(), String> {
    let current_base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let Some(parent_dir) = current_base.parent() else {
        return Ok(());
    };

    let legacy_data_dir = parent_dir.join(LEGACY_APP_IDENTIFIER).join("data");
    if !legacy_data_dir.exists() {
        return Ok(());
    }

    fs::create_dir_all(data_dir).map_err(|e| e.to_string())?;

    for file_name in DATA_FILES {
        let source_path = legacy_data_dir.join(file_name);
        let target_path = data_dir.join(file_name);

        if source_path.exists() && !target_path.exists() {
            fs::copy(&source_path, &target_path).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

fn get_data_dir(app: &tauri::AppHandle) -> PathBuf {
    let base = app.path().app_data_dir().expect("failed to get app data dir");
    let data_dir = base.join("data");
    if !data_dir.exists() {
        migrate_legacy_data(app, &data_dir).expect("failed to migrate legacy data dir");
    }
    if !data_dir.exists() {
        fs::create_dir_all(&data_dir).expect("failed to create data dir");
    }
    data_dir
}

fn webdav_password_entry() -> Result<Entry, String> {
    Entry::new(WEBDAV_PASSWORD_SERVICE, WEBDAV_PASSWORD_ACCOUNT).map_err(|e| e.to_string())
}

fn read_saved_webdav_password() -> Result<Option<String>, String> {
    let entry = webdav_password_entry()?;
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn resolve_webdav_password(password: Option<String>) -> Result<String, String> {
    if let Some(password) = password {
        if !password.is_empty() {
            return Ok(password);
        }
    }

    read_saved_webdav_password()?.ok_or_else(|| "请输入密码，或先保存到系统钥匙串".to_string())
}

fn build_webdav_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent(concat!("MFA-Tool/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())
}

fn validate_webdav_url(file_url: &str) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(file_url).map_err(|_| "WebDAV 文件 URL 格式无效".to_string())?;
    if url.scheme() != "http" && url.scheme() != "https" {
        return Err("WebDAV 文件 URL 仅支持 http/https".to_string());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("请不要在 URL 中内嵌用户名或密码".to_string());
    }
    if url.path().ends_with('/') {
        return Err("请输入具体的远端 sync.json 文件地址".to_string());
    }
    Ok(url)
}

fn format_webdav_request_error(error: reqwest::Error) -> String {
    if error.is_timeout() {
        "连接 WebDAV 服务器超时".to_string()
    } else if error.is_connect() {
        "无法连接到 WebDAV 服务器".to_string()
    } else {
        error.to_string()
    }
}

fn classify_webdav_status(status: StatusCode) -> String {
    match status {
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => {
            "WebDAV 认证失败，请检查用户名或密码".to_string()
        }
        StatusCode::METHOD_NOT_ALLOWED => {
            "WebDAV 服务器拒绝当前请求方法".to_string()
        }
        _ => format!("WebDAV 请求失败（HTTP {}）", status.as_u16()),
    }
}

fn apply_webdav_auth(
    request: reqwest::RequestBuilder,
    username: &str,
    password: &str,
) -> reqwest::RequestBuilder {
    request.basic_auth(username, Some(password))
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

#[tauri::command]
fn has_webdav_password() -> Result<bool, String> {
    Ok(read_saved_webdav_password()?.is_some())
}

#[tauri::command]
fn save_webdav_password(password: String) -> Result<(), String> {
    if password.is_empty() {
        return Err("密码不能为空".to_string());
    }

    let entry = webdav_password_entry()?;
    entry.set_password(&password).map_err(|e| e.to_string())
}

#[tauri::command]
fn clear_webdav_password() -> Result<(), String> {
    let entry = webdav_password_entry()?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn read_webdav_sync(
    file_url: String,
    username: String,
    password: Option<String>,
) -> Result<Option<String>, String> {
    if username.trim().is_empty() {
        return Err("用户名不能为空".to_string());
    }

    let url = validate_webdav_url(&file_url)?;
    let password = resolve_webdav_password(password)?;
    let client = build_webdav_client()?;
    let response = apply_webdav_auth(client.get(url), username.trim(), &password)
        .send()
        .await
        .map_err(format_webdav_request_error)?;

    match response.status() {
        StatusCode::OK => response.text().await.map(Some).map_err(|e| e.to_string()),
        StatusCode::NOT_FOUND => Ok(None),
        status => Err(classify_webdav_status(status)),
    }
}

#[tauri::command]
async fn write_webdav_sync(
    file_url: String,
    username: String,
    password: Option<String>,
    data: String,
) -> Result<(), String> {
    if username.trim().is_empty() {
        return Err("用户名不能为空".to_string());
    }

    let url = validate_webdav_url(&file_url)?;
    let password = resolve_webdav_password(password)?;
    let client = build_webdav_client()?;
    let response = apply_webdav_auth(client.put(url), username.trim(), &password)
        .header(CONTENT_TYPE, "application/json; charset=utf-8")
        .body(data)
        .send()
        .await
        .map_err(format_webdav_request_error)?;

    match response.status() {
        StatusCode::OK | StatusCode::CREATED | StatusCode::NO_CONTENT | StatusCode::ACCEPTED => Ok(()),
        status => Err(classify_webdav_status(status)),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;

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
            write_groups,
            has_webdav_password,
            save_webdav_password,
            clear_webdav_password,
            read_webdav_sync,
            write_webdav_sync
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
