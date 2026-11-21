use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
#[cfg(unix)]
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
use keyring::Entry;
use reqwest::header::CONTENT_TYPE;
use reqwest::StatusCode;
use tauri::Manager;

mod app_update;

const LEGACY_APP_IDENTIFIER: &str = "com.twofa-web-tool.desktop";
const DATA_FILES: [&str; 2] = ["accounts.json", "groups.json"];
const WEBDAV_PASSWORD_SERVICE: &str = "com.mfa-tool.desktop.webdav";
const WEBDAV_PASSWORD_ACCOUNT: &str = "default";
static ATOMIC_TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

#[cfg(unix)]
fn target_unix_file_mode(path: &Path) -> u32 {
    if let Ok(metadata) = fs::metadata(path) {
        let existing = metadata.permissions().mode() & 0o777;
        return existing & 0o600;
    }
    0o600
}

fn write_file_atomically(path: &Path, data: &str) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "无法解析目标数据目录".to_string())?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;

    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("data");

    #[cfg(unix)]
    let target_mode = target_unix_file_mode(path);

    let mut tmp_path = None;
    let mut created_file = None;
    for _ in 0..8 {
        let seq = ATOMIC_TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
        let candidate = parent.join(format!(".{file_name}.{}.{seq}.tmp", std::process::id()));
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        options.mode(0o600);

        match options.open(&candidate) {
            Ok(file) => {
                tmp_path = Some(candidate);
                created_file = Some(file);
                break;
            }
            Err(err) if err.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(err) => return Err(err.to_string()),
        }
    }

    let tmp_path = tmp_path.ok_or_else(|| "无法创建唯一临时数据文件".to_string())?;
    let mut file = created_file.ok_or_else(|| "无法打开临时数据文件".to_string())?;

    let write_result = (|| -> Result<(), String> {
        file.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        drop(file);
        #[cfg(unix)]
        {
            fs::set_permissions(&tmp_path, fs::Permissions::from_mode(target_mode))
                .map_err(|e| e.to_string())?;
        }
        fs::rename(&tmp_path, path).map_err(|e| e.to_string())?;
        Ok(())
    })();

    if write_result.is_err() {
        let _ = fs::remove_file(&tmp_path);
    }

    write_result
}

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

fn read_json_array_file(path: &Path) -> Result<String, String> {
    match fs::read_to_string(path) {
        Ok(content) => Ok(content),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok("[]".to_string()),
        Err(err) => Err(err.to_string()),
    }
}

#[tauri::command]
fn read_accounts(app: tauri::AppHandle) -> Result<String, String> {
    let path = get_data_dir(&app).join("accounts.json");
    read_json_array_file(&path)
}

#[tauri::command]
fn write_accounts(app: tauri::AppHandle, data: String) -> Result<(), String> {
    let path = get_data_dir(&app).join("accounts.json");
    write_file_atomically(&path, &data)
}

#[tauri::command]
fn read_groups(app: tauri::AppHandle) -> Result<String, String> {
    let path = get_data_dir(&app).join("groups.json");
    read_json_array_file(&path)
}

#[tauri::command]
fn write_groups(app: tauri::AppHandle, data: String) -> Result<(), String> {
    let path = get_data_dir(&app).join("groups.json");
    write_file_atomically(&path, &data)
}

#[tauri::command]
fn read_current_timestamp_ms() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .map_err(|e| e.to_string())
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
                        .level_for("tauri_plugin_updater", log::LevelFilter::Off)
                        .level_for("reqwest", log::LevelFilter::Warn)
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
            read_current_timestamp_ms,
            has_webdav_password,
            save_webdav_password,
            clear_webdav_password,
            read_webdav_sync,
            write_webdav_sync,
            app_update::check_app_update,
            app_update::install_app_update,
            app_update::close_app_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_file_atomically_creates_overwrites_and_cleans_temp_files() {
        let test_dir = std::env::temp_dir().join(format!(
            "mfa_tool_atomic_write_test_{}_{}",
            std::process::id(),
            ATOMIC_TEMP_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        let target = test_dir.join("accounts.json");

        write_file_atomically(&target, "{\"step\":1}").expect("create should succeed");
        assert_eq!(fs::read_to_string(&target).unwrap(), "{\"step\":1}");

        write_file_atomically(&target, "{\"step\":2}").expect("overwrite should succeed");
        assert_eq!(fs::read_to_string(&target).unwrap(), "{\"step\":2}");

        let entries: Vec<String> = fs::read_dir(&test_dir)
            .unwrap()
            .filter_map(|entry| entry.ok())
            .filter_map(|entry| entry.file_name().into_string().ok())
            .collect();
        assert_eq!(entries, vec!["accounts.json".to_string()]);

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn write_file_atomically_cleans_up_temp_file_when_rename_fails() {
        let test_dir = std::env::temp_dir().join(format!(
            "mfa_tool_atomic_write_fail_{}_{}",
            std::process::id(),
            ATOMIC_TEMP_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        let dir_target = test_dir.join("occupied_dir");
        fs::create_dir_all(&dir_target).unwrap();

        let result = write_file_atomically(&dir_target, "{\"broken\":true}");
        assert!(result.is_err());

        let leftovers: Vec<String> = fs::read_dir(&test_dir)
            .unwrap()
            .filter_map(|entry| entry.ok())
            .filter_map(|entry| entry.file_name().into_string().ok())
            .collect();
        assert_eq!(leftovers, vec!["occupied_dir".to_string()]);

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[cfg(unix)]
    #[test]
    fn write_file_atomically_enforces_0600_and_preserves_stricter_existing_permissions() {
        use std::os::unix::fs::PermissionsExt;

        let test_dir = std::env::temp_dir().join(format!(
            "mfa_tool_atomic_perm_{}_{}",
            std::process::id(),
            ATOMIC_TEMP_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        let target = test_dir.join("accounts.json");

        write_file_atomically(&target, "{\"step\":1}").unwrap();
        let initial_mode = fs::metadata(&target).unwrap().permissions().mode() & 0o777;
        assert_eq!(initial_mode, 0o600);

        // 即使已有文件权限更宽松，也收紧为 0600
        fs::set_permissions(&target, fs::Permissions::from_mode(0o644)).unwrap();
        write_file_atomically(&target, "{\"step\":2}").unwrap();
        let tightened_mode = fs::metadata(&target).unwrap().permissions().mode() & 0o777;
        assert_eq!(tightened_mode, 0o600);

        // 若原有权限比 0600 更严格（如 0400），覆盖写入后保留 0400
        fs::set_permissions(&target, fs::Permissions::from_mode(0o400)).unwrap();
        write_file_atomically(&target, "{\"step\":3}").unwrap();
        let strict_mode = fs::metadata(&target).unwrap().permissions().mode() & 0o777;
        assert_eq!(strict_mode, 0o400);

        let _ = fs::set_permissions(&target, fs::Permissions::from_mode(0o600));
        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn read_json_array_file_maps_only_not_found_to_empty_array() {
        let test_dir = std::env::temp_dir().join(format!(
            "mfa_tool_read_json_{}_{}",
            std::process::id(),
            ATOMIC_TEMP_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&test_dir).unwrap();

        let missing_path = test_dir.join("missing.json");
        assert_eq!(read_json_array_file(&missing_path).unwrap(), "[]");

        let valid_path = test_dir.join("accounts.json");
        fs::write(&valid_path, "[{\"id\":\"1\"}]").unwrap();
        assert_eq!(
            read_json_array_file(&valid_path).unwrap(),
            "[{\"id\":\"1\"}]"
        );

        // 读取目录会触发非 NotFound IO 错误，不得静默伪装成空数组 "[]"
        assert!(read_json_array_file(&test_dir).is_err());

        let _ = fs::remove_dir_all(&test_dir);
    }
}
