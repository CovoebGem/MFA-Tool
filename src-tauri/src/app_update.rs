use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::Engine;
use futures_util::StreamExt;
use minisign_verify::{PublicKey, Signature};
use reqwest_updater::header::{ACCEPT, CONTENT_LENGTH, CONTENT_TYPE};
use reqwest_updater::redirect::Policy as RedirectPolicy;
use reqwest_updater::{Client, ClientBuilder, StatusCode};
use semver::Version;
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tauri::utils::config::BundleType;
use tauri::utils::platform::bundle_type;
use tauri::{AppHandle, Manager, Resource, ResourceId, Runtime, Webview};
use tauri_plugin_updater::{Config as UpdaterConfig, Error as UpdaterError, Update, UpdaterExt};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use url::Url;

const MIRROR_HOST: &str = "github.cbcsec.cc";
const OFFICIAL_HOST: &str = "github.com";
const OFFICIAL_REDIRECT_HOSTS: [&str; 4] = [
    "github.com",
    "release-assets.githubusercontent.com",
    "objects.githubusercontent.com",
    "github-releases.githubusercontent.com",
];
const REPO_DOWNLOAD_PREFIX: &str = "/CovoebGem/MFA-Tool/releases/download/";
const DEFAULT_MIRROR_ENDPOINT: &str =
    "https://github.cbcsec.cc/CovoebGem/MFA-Tool/releases/latest/download/latest.json";
const DEFAULT_OFFICIAL_ENDPOINT: &str =
    "https://github.com/CovoebGem/MFA-Tool/releases/latest/download/latest.json";
const DEFAULT_UPDATER_PUBKEY: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDFCM0ZEQzc1QzlBRTJGQjYKUldTMkw2N0pkZHcvRzM3TFBTS2tsNXdvTTlNenpKZngxOGljOVY5RkMrYVZ2d203cnZuMWRLL3UK";
const APP_UPDATER_USER_AGENT: &str = concat!("MFA-Tool/", env!("CARGO_PKG_VERSION"));
const MAX_REDIRECTS: usize = 5;
const CONNECT_TIMEOUT_SECS: u64 = 5;
const MIRROR_CHECK_TIMEOUT_SECS: u64 = 8;
const OFFICIAL_CHECK_TIMEOUT_SECS: u64 = 20;
const ASSET_READ_TIMEOUT_SECS: u64 = 30;
const ASSET_TOTAL_TIMEOUT_SECS: u64 = 600;
const MAX_MANIFEST_BYTES: usize = 512 * 1024;
const MAX_ASSET_BYTES: usize = 150 * 1024 * 1024;

static INSTALL_LOCK: AtomicBool = AtomicBool::new(false);
static LOCAL_MANIFEST_SEQ: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum UpdateSource {
    Mirror,
    Official,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateRoute {
    pub source: UpdateSource,
    pub fallback_from_mirror: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckedUpdateInfo {
    pub rid: ResourceId,
    pub current_version: String,
    pub version: String,
    pub date: Option<String>,
    pub body: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckUpdateResponse {
    pub source: UpdateSource,
    pub fallback_from_mirror: bool,
    pub update: Option<CheckedUpdateInfo>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "event", content = "data")]
pub enum TransferEvent {
    #[serde(rename_all = "camelCase")]
    Started {
        source: UpdateSource,
        fallback_from_mirror: bool,
        total_bytes: Option<u64>,
    },
    #[serde(rename_all = "camelCase")]
    Progress {
        source: UpdateSource,
        fallback_from_mirror: bool,
        downloaded_bytes: u64,
        total_bytes: Option<u64>,
    },
    #[serde(rename_all = "camelCase")]
    Fallback {
        from: UpdateSource,
        source: UpdateSource,
        fallback_from_mirror: bool,
        reason: String,
    },
    #[serde(rename_all = "camelCase")]
    Installing {
        source: UpdateSource,
        fallback_from_mirror: bool,
    },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppUpdateErrorPayload<'a> {
    stage: &'a str,
    source: UpdateSource,
    kind: &'a str,
    message: &'a str,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum TransferError {
    Retryable {
        kind: &'static str,
        message: &'static str,
    },
    Verification {
        kind: &'static str,
        message: &'static str,
    },
}

#[derive(Debug, Deserialize)]
struct ManifestPlatform {
    url: String,
    signature: String,
}

#[derive(Debug, Deserialize)]
struct ManifestRelease {
    #[serde(alias = "name")]
    version: String,
    platforms: Option<HashMap<String, ManifestPlatform>>,
    url: Option<String>,
    signature: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ParsedManifestCandidate {
    pub target_key: String,
    pub version: String,
    pub asset_url: Url,
    pub signature: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum MaterializedCheckOutcome<T> {
    Available {
        source: UpdateSource,
        fallback_from_mirror: bool,
        candidate: ParsedManifestCandidate,
        materialized: T,
    },
    UpToDate {
        source: UpdateSource,
        fallback_from_mirror: bool,
    },
}

pub struct PreparedUpdate {
    official: Update,
    pubkey: String,
    target_key: String,
    manifest_source: UpdateSource,
    fallback_from_mirror: bool,
    installing: AtomicBool,
}

impl Resource for PreparedUpdate {}

struct AtomicFlagGuard<'a> {
    flag: &'a AtomicBool,
}

impl<'a> AtomicFlagGuard<'a> {
    fn acquire(flag: &'a AtomicBool) -> Result<Self, ()> {
        flag.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .map(|_| Self { flag })
            .map_err(|_| ())
    }
}

impl Drop for AtomicFlagGuard<'_> {
    fn drop(&mut self) {
        self.flag.store(false, Ordering::SeqCst);
    }
}

pub(crate) struct ManifestBridgeGuard {
    handle: Option<tokio::task::JoinHandle<()>>,
}

impl Drop for ManifestBridgeGuard {
    fn drop(&mut self) {
        if let Some(handle) = self.handle.take() {
            handle.abort();
        }
    }
}

fn ensure_rustls_crypto_provider() {
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }

    #[cfg(target_os = "linux")]
    {
        if std::env::var_os("SSL_CERT_FILE").is_none() {
            std::env::set_var("SSL_CERT_FILE", "/etc/ssl/certs/ca-certificates.crt");
        }
        if std::env::var_os("SSL_CERT_DIR").is_none() {
            std::env::set_var("SSL_CERT_DIR", "/etc/ssl/certs");
        }
    }
}

fn format_command_error(stage: &str, source: UpdateSource, kind: &str, message: &str) -> String {
    serde_json::to_string(&AppUpdateErrorPayload {
        stage,
        source,
        kind,
        message,
    })
    .unwrap_or_else(|_| message.to_string())
}

pub(crate) fn classify_endpoint_source(endpoint: &Url) -> UpdateSource {
    if endpoint.host_str() == Some(MIRROR_HOST) {
        UpdateSource::Mirror
    } else {
        UpdateSource::Official
    }
}

fn is_valid_msi_locale_suffix(locale: &str) -> bool {
    let Some((lang, region)) = locale.split_once('-') else {
        return false;
    };
    lang.len() == 2
        && lang.bytes().all(|b| b.is_ascii_alphabetic())
        && (2..=8).contains(&region.len())
        && region.bytes().all(|b| b.is_ascii_alphanumeric())
}

fn matches_msi_filename(prefix: &str, filename: &str, version: &str) -> bool {
    let base = format!("{prefix}_{version}_x64");
    if filename == format!("{base}.msi") {
        return true;
    }
    if let Some(rest) = filename.strip_prefix(&format!("{base}_")) {
        if let Some(locale) = rest.strip_suffix(".msi") {
            return is_valid_msi_locale_suffix(locale);
        }
    }
    false
}

pub(crate) fn matches_expected_url_filename_for_target(
    target_key: &str,
    url_filename: &str,
    version: &str,
) -> bool {
    if version.is_empty() {
        return false;
    }

    match target_key {
        "windows-x86_64-nsis" => url_filename == format!("MFA.Tool_{version}_x64-setup.exe"),
        "windows-x86_64-msi" | "windows-x86_64" => {
            matches_msi_filename("MFA.Tool", url_filename, version)
        }
        "darwin-aarch64-app" | "darwin-aarch64" => url_filename == "MFA.Tool_aarch64.app.tar.gz",
        "linux-x86_64-appimage" | "linux-x86_64" => {
            url_filename == format!("MFA.Tool_{version}_amd64.AppImage")
        }
        "linux-x86_64-deb" => url_filename == format!("MFA.Tool_{version}_amd64.deb"),
        "linux-x86_64-rpm" => url_filename == format!("MFA.Tool-{version}-1.x86_64.rpm"),
        _ => false,
    }
}

pub(crate) fn matches_expected_signed_filename_for_target(
    target_key: &str,
    signed_file: &str,
    version: &str,
) -> bool {
    if version.is_empty() {
        return false;
    }

    match target_key {
        "windows-x86_64-nsis" => signed_file == format!("MFA Tool_{version}_x64-setup.exe"),
        "windows-x86_64-msi" | "windows-x86_64" => {
            matches_msi_filename("MFA Tool", signed_file, version)
        }
        // macOS updater 归档文件名与签名注释固定为 `MFA Tool.app.tar.gz`，不嵌入版本号
        "darwin-aarch64-app" | "darwin-aarch64" => signed_file == "MFA Tool.app.tar.gz",
        "linux-x86_64-appimage" | "linux-x86_64" => {
            signed_file == format!("MFA Tool_{version}_amd64.AppImage")
        }
        "linux-x86_64-deb" => signed_file == format!("MFA Tool_{version}_amd64.deb"),
        "linux-x86_64-rpm" => signed_file == format!("MFA Tool-{version}-1.x86_64.rpm"),
        _ => false,
    }
}

pub(crate) fn validate_official_asset_url(url: &Url, version: &str) -> Result<(), String> {
    if url.scheme() != "https" {
        return Err("更新资产地址必须使用 HTTPS".to_string());
    }
    if url.host_str() != Some(OFFICIAL_HOST) {
        return Err("更新资产地址必须指向 github.com".to_string());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("更新资产地址不允许包含用户信息".to_string());
    }
    if url.port().is_some() {
        return Err("更新资产地址不允许使用非标准端口".to_string());
    }
    if url.query().is_some() || url.fragment().is_some() {
        return Err("更新资产地址不允许包含查询参数或锚点".to_string());
    }

    let expected_prefix = format!("{REPO_DOWNLOAD_PREFIX}v{version}/");
    let path = url.path();
    let Some(filename) = path.strip_prefix(&expected_prefix) else {
        return Err("更新资产路径与目标版本不匹配".to_string());
    };

    if filename.is_empty()
        || filename == "."
        || filename == ".."
        || filename.contains("..")
        || filename.contains('/')
        || filename.contains('\\')
    {
        return Err("更新资产文件名无效".to_string());
    }

    let lower = filename.to_ascii_lowercase();
    if lower.contains("%2f") || lower.contains("%5c") || lower.contains("%2e") {
        return Err("更新资产文件名包含非法编码字符".to_string());
    }

    Ok(())
}

pub(crate) fn validate_official_asset_url_for_target(
    url: &Url,
    version: &str,
    target_key: &str,
) -> Result<(), String> {
    validate_official_asset_url(url, version)?;

    let filename = url
        .path_segments()
        .and_then(|segments| segments.last())
        .ok_or_else(|| "更新资产文件名无效".to_string())?;

    if !matches_expected_url_filename_for_target(target_key, filename, version) {
        return Err("更新资产文件名与当前平台目标或版本不匹配".to_string());
    }

    Ok(())
}

pub(crate) fn rewrite_url_to_mirror(official_url: &Url) -> Result<Url, String> {
    let mut mirrored = official_url.clone();
    mirrored
        .set_host(Some(MIRROR_HOST))
        .map_err(|_| "无法重写更新资产镜像主机".to_string())?;
    Ok(mirrored)
}

pub(crate) fn is_allowed_redirect_target(initial_host: &str, next_url: &Url) -> bool {
    if next_url.scheme() != "https" {
        return false;
    }
    if !next_url.username().is_empty() || next_url.password().is_some() {
        return false;
    }
    if next_url.port().is_some() {
        return false;
    }

    let Some(target_host) = next_url.host_str() else {
        return false;
    };

    if initial_host == MIRROR_HOST {
        target_host == MIRROR_HOST
    } else if initial_host == OFFICIAL_HOST {
        OFFICIAL_REDIRECT_HOSTS.contains(&target_host)
    } else {
        false
    }
}

fn build_redirect_policy() -> RedirectPolicy {
    RedirectPolicy::custom(|attempt| {
        if attempt.previous().len() > MAX_REDIRECTS {
            return attempt.error(std::io::Error::other("too many redirects"));
        }

        let initial_host = attempt
            .previous()
            .first()
            .and_then(|url| url.host_str())
            .unwrap_or("");

        if !is_allowed_redirect_target(initial_host, attempt.url()) {
            return attempt.error(std::io::Error::new(
                std::io::ErrorKind::PermissionDenied,
                "disallowed redirect target",
            ));
        }

        attempt.follow()
    })
}

fn configure_updater_http_client(builder: ClientBuilder) -> ClientBuilder {
    ensure_rustls_crypto_provider();
    builder
        .connect_timeout(Duration::from_secs(CONNECT_TIMEOUT_SECS))
        .read_timeout(Duration::from_secs(ASSET_READ_TIMEOUT_SECS))
        .redirect(build_redirect_policy())
}

fn build_direct_http_client(timeout: Duration) -> Result<Client, TransferError> {
    configure_updater_http_client(ClientBuilder::new().user_agent(APP_UPDATER_USER_AGENT))
        .timeout(timeout)
        .build()
        .map_err(|_| TransferError::Retryable {
            kind: "network",
            message: "初始化更新网络客户端失败",
        })
}

#[cfg(test)]
pub(crate) fn is_signature_or_verification_error(err: &UpdaterError) -> bool {
    matches!(
        err,
        UpdaterError::Minisign(_)
            | UpdaterError::Base64(_)
            | UpdaterError::SignatureUtf8(_)
            | UpdaterError::Extract(_)
            | UpdaterError::BinaryNotFoundInArchive
            | UpdaterError::InvalidUpdaterFormat
    )
}

pub(crate) fn classify_updater_error(err: &UpdaterError, stage: &str) -> (&'static str, &'static str) {
    match err {
        UpdaterError::Minisign(_)
        | UpdaterError::Base64(_)
        | UpdaterError::SignatureUtf8(_) => ("signature", "更新包签名校验失败，已中止安装"),
        UpdaterError::Extract(_)
        | UpdaterError::BinaryNotFoundInArchive
        | UpdaterError::InvalidUpdaterFormat => ("package", "更新包格式无效，无法安装"),
        UpdaterError::Serialization(_) => ("manifest", "更新清单格式无效"),
        UpdaterError::TargetNotFound(_) | UpdaterError::TargetsNotFound(_) => {
            ("platform", "更新清单中缺少当前平台安装包")
        }
        UpdaterError::ReleaseNotFound | UpdaterError::EmptyEndpoints => {
            ("manifest", "无法获取有效的更新清单")
        }
        UpdaterError::AuthenticationFailed
        | UpdaterError::DebInstallFailed
        | UpdaterError::PackageInstallFailed
        | UpdaterError::TempDirNotOnSameMountPoint
        | UpdaterError::TempDirNotFound => ("install", "安装更新包失败，请重试"),
        UpdaterError::Network(_) => ("http", "更新服务器返回错误状态"),
        UpdaterError::Reqwest(req_err) => {
            if req_err.is_timeout() {
                ("timeout", "连接或读取更新服务器超时")
            } else if req_err.is_redirect() {
                ("redirect", "更新源跳转未通过安全校验")
            } else if req_err.status().is_some() {
                ("http", "更新服务器返回异常响应")
            } else {
                ("network", "网络连接更新服务器失败")
            }
        }
        UpdaterError::Io(_) => (
            if stage == "install" { "install" } else { "network" },
            if stage == "install" {
                "写入或启动更新程序失败"
            } else {
                "读取更新数据流失败"
            },
        ),
        _ => (
            if stage == "install" { "install" } else { "network" },
            "更新操作失败，请稍后重试",
        ),
    }
}

fn resolve_updater_config<R: Runtime>(app: &AppHandle<R>) -> Option<UpdaterConfig> {
    app.config()
        .plugins
        .0
        .get("updater")
        .and_then(|raw| serde_json::from_value::<UpdaterConfig>(raw.clone()).ok())
}

fn is_allowed_remote_manifest_endpoint(url: &Url) -> bool {
    url.scheme() == "https"
        && matches!(url.host_str(), Some(MIRROR_HOST) | Some(OFFICIAL_HOST))
        && url.username().is_empty()
        && url.password().is_none()
        && url.port().is_none()
}

fn resolve_endpoints<R: Runtime>(app: &AppHandle<R>) -> Vec<Url> {
    if let Some(cfg) = resolve_updater_config(app) {
        let valid: Vec<Url> = cfg
            .endpoints
            .into_iter()
            .filter(is_allowed_remote_manifest_endpoint)
            .collect();
        if !valid.is_empty() {
            return valid;
        }
    }

    vec![
        Url::parse(DEFAULT_MIRROR_ENDPOINT).expect("valid mirror endpoint"),
        Url::parse(DEFAULT_OFFICIAL_ENDPOINT).expect("valid official endpoint"),
    ]
}

fn resolve_pubkey<R: Runtime>(app: &AppHandle<R>) -> String {
    if let Some(cfg) = resolve_updater_config(app) {
        if !cfg.pubkey.trim().is_empty() {
            return cfg.pubkey;
        }
    }

    DEFAULT_UPDATER_PUBKEY.to_string()
}

fn current_updater_os() -> Option<&'static str> {
    if cfg!(target_os = "linux") {
        Some("linux")
    } else if cfg!(target_os = "macos") {
        Some("darwin")
    } else if cfg!(target_os = "windows") {
        Some("windows")
    } else {
        None
    }
}

fn current_updater_arch() -> Option<&'static str> {
    if cfg!(target_arch = "x86") {
        Some("i686")
    } else if cfg!(target_arch = "x86_64") {
        Some("x86_64")
    } else if cfg!(target_arch = "arm") {
        Some("armv7")
    } else if cfg!(target_arch = "aarch64") {
        Some("aarch64")
    } else if cfg!(target_arch = "riscv64") {
        Some("riscv64")
    } else {
        None
    }
}

pub(crate) fn build_updater_target_keys_for(
    os: &str,
    arch: &str,
    bundle: Option<BundleType>,
) -> Vec<String> {
    match bundle {
        Some(BundleType::Nsis) => vec![format!("{os}-{arch}-nsis")],
        Some(BundleType::Deb) => vec![format!("{os}-{arch}-deb")],
        Some(BundleType::Rpm) => vec![format!("{os}-{arch}-rpm")],
        Some(BundleType::Msi) => vec![format!("{os}-{arch}-msi"), format!("{os}-{arch}")],
        Some(BundleType::AppImage) => {
            vec![format!("{os}-{arch}-appimage"), format!("{os}-{arch}")]
        }
        Some(BundleType::App) => vec![format!("{os}-{arch}-app"), format!("{os}-{arch}")],
        _ => vec![format!("{os}-{arch}")],
    }
}

fn build_updater_target_keys() -> Vec<String> {
    let (Some(os), Some(arch)) = (current_updater_os(), current_updater_arch()) else {
        return Vec::new();
    };

    build_updater_target_keys_for(os, arch, bundle_type())
}

fn extract_release_date(update: &Update) -> Option<String> {
    if let Some(pub_date) = update
        .raw_json
        .get("pub_date")
        .and_then(|value| value.as_str())
    {
        if !pub_date.trim().is_empty() {
            return Some(pub_date.to_string());
        }
    }

    update.date.map(|date| date.to_string())
}

fn is_html_content_type(content_type: &str) -> bool {
    let media_type = content_type
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    media_type == "text/html" || media_type == "application/xhtml+xml"
}

fn decode_base64_utf8(input: &str) -> Result<String, TransferError> {
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(input.trim())
        .map_err(|_| TransferError::Verification {
            kind: "signature",
            message: "更新包签名格式无效，已中止安装",
        })?;
    String::from_utf8(decoded).map_err(|_| TransferError::Verification {
        kind: "signature",
        message: "更新包签名编码无效，已中止安装",
    })
}

pub(crate) fn verify_minisign_signature(
    data: &[u8],
    signature_b64: &str,
    pubkey_b64: &str,
) -> Result<String, TransferError> {
    let pubkey_decoded = decode_base64_utf8(pubkey_b64)?;
    let public_key =
        PublicKey::decode(&pubkey_decoded).map_err(|_| TransferError::Verification {
            kind: "signature",
            message: "更新公钥格式无效，已中止安装",
        })?;

    let signature_decoded = decode_base64_utf8(signature_b64)?;
    let signature =
        Signature::decode(&signature_decoded).map_err(|_| TransferError::Verification {
            kind: "signature",
            message: "更新包签名解析失败，已中止安装",
        })?;

    public_key
        .verify(data, &signature, true)
        .map_err(|_| TransferError::Verification {
            kind: "signature",
            message: "更新包签名校验失败，已中止安装",
        })?;

    Ok(signature.trusted_comment().to_string())
}

fn extract_signed_filename(trusted_comment: &str) -> Option<&str> {
    trusted_comment
        .split('\t')
        .find_map(|part| part.strip_prefix("file:"))
        .map(str::trim)
        .filter(|name| !name.is_empty())
}

pub(crate) fn validate_signature_trusted_comment(
    trusted_comment: &str,
    target_key: &str,
    expected_version: &str,
) -> Result<(), TransferError> {
    let signed_file =
        extract_signed_filename(trusted_comment).ok_or(TransferError::Verification {
            kind: "signature",
            message: "更新包签名缺少目标文件名元数据，已中止安装",
        })?;

    if !matches_expected_signed_filename_for_target(target_key, signed_file, expected_version) {
        return Err(TransferError::Verification {
            kind: "signature",
            message: "更新包签名元数据与当前平台或目标版本不匹配，已中止安装",
        });
    }

    Ok(())
}

pub(crate) async fn fetch_bounded_response<C>(
    client: &Client,
    url: &Url,
    accept: &str,
    max_bytes: usize,
    reject_html: bool,
    mut on_chunk: C,
) -> Result<Vec<u8>, TransferError>
where
    C: FnMut(usize, Option<u64>),
{
    let response = client
        .get(url.clone())
        .header(ACCEPT, accept)
        .send()
        .await
        .map_err(|err| {
            if err.is_timeout() {
                TransferError::Retryable {
                    kind: "timeout",
                    message: "连接或读取更新服务器超时",
                }
            } else if err.is_redirect() {
                TransferError::Retryable {
                    kind: "redirect",
                    message: "更新源跳转未通过安全校验",
                }
            } else {
                TransferError::Retryable {
                    kind: "network",
                    message: "网络连接更新服务器失败",
                }
            }
        })?;

    if response.status() != StatusCode::OK {
        return Err(TransferError::Retryable {
            kind: "http",
            message: "更新服务器返回异常响应",
        });
    }

    if reject_html {
        if let Some(content_type) = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
        {
            if is_html_content_type(content_type) {
                return Err(TransferError::Retryable {
                    kind: "http",
                    message: "更新服务器返回非目标更新内容",
                });
            }
        }
    }

    let content_length = response
        .headers()
        .get(CONTENT_LENGTH)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok())
        .or_else(|| response.content_length());

    if let Some(len) = content_length {
        if len > max_bytes as u64 {
            return Err(TransferError::Retryable {
                kind: "http",
                message: "更新文件体积超过安全上限",
            });
        }
    }

    let initial_capacity = content_length
        .unwrap_or(0)
        .min((max_bytes as u64).min(4 * 1024 * 1024)) as usize;
    let mut buffer = Vec::with_capacity(initial_capacity);
    let mut stream = response.bytes_stream();

    while let Some(chunk_res) = stream.next().await {
        let chunk = chunk_res.map_err(|err| {
            if err.is_timeout() {
                TransferError::Retryable {
                    kind: "timeout",
                    message: "读取更新数据流超时",
                }
            } else {
                TransferError::Retryable {
                    kind: "network",
                    message: "读取更新数据流失败",
                }
            }
        })?;

        if buffer.len().saturating_add(chunk.len()) > max_bytes {
            return Err(TransferError::Retryable {
                kind: "http",
                message: "更新文件体积超过安全上限",
            });
        }

        on_chunk(chunk.len(), content_length);
        buffer.extend_from_slice(&chunk);
    }

    if let Some(expected_len) = content_length {
        if buffer.len() as u64 != expected_len {
            return Err(TransferError::Retryable {
                kind: "network",
                message: "更新文件下载不完整",
            });
        }
    }

    Ok(buffer)
}

pub(crate) fn parse_manifest_candidate<V>(
    bytes: &[u8],
    current_version: &Version,
    target_keys: &[String],
    validate_asset_url: &V,
) -> Result<Option<ParsedManifestCandidate>, TransferError>
where
    V: Fn(&Url, &str, &str) -> Result<(), String>,
{
    let manifest: ManifestRelease =
        serde_json::from_slice(bytes).map_err(|_| TransferError::Retryable {
            kind: "manifest",
            message: "更新清单格式无效",
        })?;

    let raw_version = manifest.version.trim().trim_start_matches('v');
    let release_version = Version::parse(raw_version).map_err(|_| TransferError::Retryable {
        kind: "manifest",
        message: "更新清单版本号格式无效",
    })?;

    if !release_version.pre.is_empty() || !release_version.build.is_empty() {
        return Err(TransferError::Retryable {
            kind: "manifest",
            message: "不支持通过正式更新通道安装预发布版本",
        });
    }

    if release_version <= *current_version {
        return Ok(None);
    }

    let (target_key, raw_url, signature) = if let Some(platforms) = manifest.platforms {
        target_keys
            .iter()
            .find_map(|key| {
                platforms
                    .get(key)
                    .map(|entry| (key.clone(), entry.url.clone(), entry.signature.clone()))
            })
            .ok_or(TransferError::Retryable {
                kind: "platform",
                message: "更新清单中缺少当前平台安装包",
            })?
    } else if let (Some(url), Some(signature), Some(first_target)) =
        (manifest.url, manifest.signature, target_keys.first())
    {
        (first_target.clone(), url, signature)
    } else {
        return Err(TransferError::Retryable {
            kind: "platform",
            message: "更新清单中缺少当前平台安装包",
        });
    };

    let asset_url = Url::parse(&raw_url).map_err(|_| TransferError::Retryable {
        kind: "validation",
        message: "更新清单中的安装包地址未通过安全校验",
    })?;
    let normalized_version = release_version.to_string();

    if validate_asset_url(&asset_url, &normalized_version, &target_key).is_err() {
        return Err(TransferError::Retryable {
            kind: "validation",
            message: "更新清单中的安装包地址未通过安全校验",
        });
    }

    Ok(Some(ParsedManifestCandidate {
        target_key,
        version: normalized_version,
        asset_url,
        signature,
    }))
}

pub(crate) async fn serve_verified_manifest_once(
    manifest_bytes: Vec<u8>,
) -> Result<(Url, ManifestBridgeGuard), TransferError> {
    let listener = TcpListener::bind("127.0.0.1:0").await.map_err(|_| {
        TransferError::Retryable {
            kind: "network",
            message: "初始化本地更新清单桥接失败",
        }
    })?;
    let addr = listener.local_addr().map_err(|_| TransferError::Retryable {
        kind: "network",
        message: "读取本地更新清单端口失败",
    })?;

    let seq = LOCAL_MANIFEST_SEQ.fetch_add(1, Ordering::Relaxed);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let secret_path = format!("/manifest-{}-{seq}-{nanos}.json", std::process::id());
    let local_url = Url::parse(&format!("http://127.0.0.1:{}{}", addr.port(), secret_path))
        .map_err(|_| TransferError::Retryable {
            kind: "network",
            message: "构建本地更新清单地址失败",
        })?;

    let expected_path = secret_path.clone();
    let handle = tokio::spawn(async move {
        for _ in 0..4 {
            let Ok((mut socket, _)) = listener.accept().await else {
                break;
            };
            let mut req_buf = [0u8; 4096];
            let n = socket.read(&mut req_buf).await.unwrap_or(0);
            let req_text = String::from_utf8_lossy(&req_buf[..n]);
            let mut parts = req_text.lines().next().unwrap_or("").split_whitespace();
            let method = parts.next().unwrap_or("");
            let path = parts.next().unwrap_or("");

            if method == "GET" && path == expected_path {
                let header = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    manifest_bytes.len()
                );
                let _ = socket.write_all(header.as_bytes()).await;
                let _ = socket.write_all(&manifest_bytes).await;
                let _ = socket.shutdown().await;
                break;
            }

            let _ = socket
                .write_all(
                    b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                )
                .await;
            let _ = socket.shutdown().await;
        }
    });

    Ok((
        local_url,
        ManifestBridgeGuard {
            handle: Some(handle),
        },
    ))
}

pub(crate) async fn check_and_materialize_endpoints_with_classifier<F, V, M, S, Fut, T>(
    endpoints: &[Url],
    current_version: &Version,
    target_keys: &[String],
    build_client: &F,
    validate_asset_url: &V,
    classify_source: &S,
    materialize: &M,
) -> Result<MaterializedCheckOutcome<T>, (UpdateSource, &'static str, &'static str, bool)>
where
    F: Fn(UpdateSource) -> Result<Client, TransferError>,
    V: Fn(&Url, &str, &str) -> Result<(), String>,
    S: Fn(&Url) -> UpdateSource,
    M: Fn(UpdateSource, ParsedManifestCandidate, Vec<u8>) -> Fut,
    Fut: std::future::Future<Output = Result<T, (&'static str, &'static str)>>,
{
    let mut tried_mirror = false;
    let mut last_error: Option<(UpdateSource, &'static str, &'static str)> = None;

    for endpoint in endpoints {
        let source = classify_source(endpoint);
        let fallback_from_mirror = tried_mirror && source == UpdateSource::Official;
        if source == UpdateSource::Mirror {
            tried_mirror = true;
        }

        let client = match build_client(source) {
            Ok(client) => client,
            Err(TransferError::Retryable { kind, message })
            | Err(TransferError::Verification { kind, message }) => {
                last_error = Some((source, kind, message));
                continue;
            }
        };

        let bytes = match fetch_bounded_response(
            &client,
            endpoint,
            "application/json",
            MAX_MANIFEST_BYTES,
            true,
            |_, _| {},
        )
        .await
        {
            Ok(bytes) => bytes,
            Err(TransferError::Retryable { kind, message })
            | Err(TransferError::Verification { kind, message }) => {
                last_error = Some((source, kind, message));
                continue;
            }
        };

        let candidate =
            match parse_manifest_candidate(&bytes, current_version, target_keys, validate_asset_url)
            {
                Ok(Some(candidate)) => candidate,
                Ok(None) => {
                    return Ok(MaterializedCheckOutcome::UpToDate {
                        source,
                        fallback_from_mirror,
                    });
                }
                Err(TransferError::Retryable { kind, message })
                | Err(TransferError::Verification { kind, message }) => {
                    last_error = Some((source, kind, message));
                    continue;
                }
            };

        match materialize(source, candidate.clone(), bytes).await {
            Ok(materialized) => {
                return Ok(MaterializedCheckOutcome::Available {
                    source,
                    fallback_from_mirror,
                    candidate,
                    materialized,
                });
            }
            Err((kind, message)) => {
                last_error = Some((source, kind, message));
            }
        }
    }

    let (source, kind, message) = last_error.unwrap_or((
        UpdateSource::Official,
        "network",
        "无法连接更新服务器，请稍后重试",
    ));
    Err((source, kind, message, tried_mirror))
}

pub(crate) async fn check_and_materialize_endpoints<F, V, M, Fut, T>(
    endpoints: &[Url],
    current_version: &Version,
    target_keys: &[String],
    build_client: &F,
    validate_asset_url: &V,
    materialize: &M,
) -> Result<MaterializedCheckOutcome<T>, (UpdateSource, &'static str, &'static str, bool)>
where
    F: Fn(UpdateSource) -> Result<Client, TransferError>,
    V: Fn(&Url, &str, &str) -> Result<(), String>,
    M: Fn(UpdateSource, ParsedManifestCandidate, Vec<u8>) -> Fut,
    Fut: std::future::Future<Output = Result<T, (&'static str, &'static str)>>,
{
    check_and_materialize_endpoints_with_classifier(
        endpoints,
        current_version,
        target_keys,
        build_client,
        validate_asset_url,
        &classify_endpoint_source,
        materialize,
    )
    .await
}

async fn run_bounded_download<E>(
    client: &Client,
    url: &Url,
    source: UpdateSource,
    fallback_from_mirror: bool,
    emit: &mut E,
) -> Result<Vec<u8>, TransferError>
where
    E: FnMut(TransferEvent),
{
    let mut downloaded_bytes: u64 = 0;
    let mut started = false;

    fetch_bounded_response(
        client,
        url,
        "application/octet-stream",
        MAX_ASSET_BYTES,
        true,
        |chunk_length, total_bytes| {
            if !started {
                started = true;
                emit(TransferEvent::Started {
                    source,
                    fallback_from_mirror,
                    total_bytes,
                });
            }

            downloaded_bytes = downloaded_bytes.saturating_add(chunk_length as u64);
            emit(TransferEvent::Progress {
                source,
                fallback_from_mirror,
                downloaded_bytes,
                total_bytes,
            });
        },
    )
    .await
}

pub(crate) async fn download_urls_with_fallback<F, E>(
    primary_url: &Url,
    fallback_url: &Url,
    target_key: &str,
    expected_version: &str,
    expected_signature: &str,
    pubkey: &str,
    initial_source: UpdateSource,
    initial_fallback_from_mirror: bool,
    build_client: &F,
    mut emit: E,
) -> Result<(Vec<u8>, UpdateSource, bool), (UpdateSource, bool, TransferError)>
where
    F: Fn(UpdateSource) -> Result<Client, TransferError>,
    E: FnMut(TransferEvent),
{
    let verify_bytes = |bytes: &[u8]| -> Result<(), TransferError> {
        let trusted_comment = verify_minisign_signature(bytes, expected_signature, pubkey)?;
        validate_signature_trusted_comment(&trusted_comment, target_key, expected_version)
    };

    if initial_source == UpdateSource::Mirror {
        let mirror_attempt = match build_client(UpdateSource::Mirror) {
            Ok(client) => {
                run_bounded_download(
                    &client,
                    primary_url,
                    UpdateSource::Mirror,
                    initial_fallback_from_mirror,
                    &mut emit,
                )
                .await
            }
            Err(err) => Err(err),
        };

        match mirror_attempt {
            Ok(bytes) => {
                verify_bytes(&bytes)
                    .map_err(|err| (UpdateSource::Mirror, initial_fallback_from_mirror, err))?;
                return Ok((bytes, UpdateSource::Mirror, initial_fallback_from_mirror));
            }
            Err(TransferError::Verification { kind, message }) => {
                return Err((
                    UpdateSource::Mirror,
                    initial_fallback_from_mirror,
                    TransferError::Verification { kind, message },
                ));
            }
            Err(TransferError::Retryable { kind, .. }) => {
                emit(TransferEvent::Fallback {
                    from: UpdateSource::Mirror,
                    source: UpdateSource::Official,
                    fallback_from_mirror: true,
                    reason: kind.to_string(),
                });

                let official_client = build_client(UpdateSource::Official)
                    .map_err(|err| (UpdateSource::Official, true, err))?;
                let bytes = run_bounded_download(
                    &official_client,
                    fallback_url,
                    UpdateSource::Official,
                    true,
                    &mut emit,
                )
                .await
                .map_err(|err| (UpdateSource::Official, true, err))?;

                verify_bytes(&bytes).map_err(|err| (UpdateSource::Official, true, err))?;
                return Ok((bytes, UpdateSource::Official, true));
            }
        }
    }

    let official_client = build_client(UpdateSource::Official)
        .map_err(|err| (UpdateSource::Official, initial_fallback_from_mirror, err))?;
    let bytes = run_bounded_download(
        &official_client,
        fallback_url,
        UpdateSource::Official,
        initial_fallback_from_mirror,
        &mut emit,
    )
    .await
    .map_err(|err| (UpdateSource::Official, initial_fallback_from_mirror, err))?;

    verify_bytes(&bytes)
        .map_err(|err| (UpdateSource::Official, initial_fallback_from_mirror, err))?;

    Ok((bytes, UpdateSource::Official, initial_fallback_from_mirror))
}

pub(crate) async fn download_and_verify_with_fallback<F, E>(
    official_url: &Url,
    target_key: &str,
    expected_version: &str,
    expected_signature: &str,
    pubkey: &str,
    initial_source: UpdateSource,
    initial_fallback_from_mirror: bool,
    build_client: &F,
    emit: E,
) -> Result<(Vec<u8>, UpdateSource, bool), (UpdateSource, bool, TransferError)>
where
    F: Fn(UpdateSource) -> Result<Client, TransferError>,
    E: FnMut(TransferEvent),
{
    let primary_url = if initial_source == UpdateSource::Mirror {
        rewrite_url_to_mirror(official_url).map_err(|_| {
            (
                UpdateSource::Mirror,
                initial_fallback_from_mirror,
                TransferError::Retryable {
                    kind: "validation",
                    message: "无法重写更新资产镜像主机",
                },
            )
        })?
    } else {
        official_url.clone()
    };

    download_urls_with_fallback(
        &primary_url,
        official_url,
        target_key,
        expected_version,
        expected_signature,
        pubkey,
        initial_source,
        initial_fallback_from_mirror,
        build_client,
        emit,
    )
    .await
}

async fn materialize_update_via_loopback_bridge<R: Runtime>(
    app: &AppHandle<R>,
    candidate: &ParsedManifestCandidate,
    manifest_bytes: Vec<u8>,
) -> Result<Update, (&'static str, &'static str)> {
    let (local_url, _bridge_guard) = serve_verified_manifest_once(manifest_bytes)
        .await
        .map_err(|err| match err {
            TransferError::Retryable { kind, message }
            | TransferError::Verification { kind, message } => (kind, message),
        })?;

    let updater = app
        .updater_builder()
        .endpoints(vec![local_url])
        .map_err(|err| classify_updater_error(&err, "check"))?
        .no_proxy()
        .timeout(Duration::from_secs(5))
        .configure_client(|builder| {
            ensure_rustls_crypto_provider();
            builder.no_proxy().redirect(RedirectPolicy::none())
        })
        .version_comparator(|current, release| {
            release.version.pre.is_empty()
                && release.version.build.is_empty()
                && release.version > current
        })
        .build()
        .map_err(|err| classify_updater_error(&err, "check"))?;

    let update = updater
        .check()
        .await
        .map_err(|err| classify_updater_error(&err, "check"))?
        .ok_or(("manifest", "无法解析有效的更新清单"))?;

    if update.version != candidate.version
        || update.download_url != candidate.asset_url
        || update.signature != candidate.signature
    {
        return Err(("manifest", "更新清单校验结果不一致，请重试"));
    }

    Ok(update)
}

#[tauri::command]
pub async fn check_app_update<R: Runtime>(
    app: AppHandle<R>,
    webview: Webview<R>,
) -> Result<CheckUpdateResponse, String> {
    let endpoints = resolve_endpoints(&app);
    let pubkey = resolve_pubkey(&app);
    let current_version = app.package_info().version.clone();
    let target_keys = build_updater_target_keys();

    let (source, fallback_from_mirror, candidate, update) = match check_and_materialize_endpoints(
        &endpoints,
        &current_version,
        &target_keys,
        &|source| {
            let secs = if source == UpdateSource::Mirror {
                MIRROR_CHECK_TIMEOUT_SECS
            } else {
                OFFICIAL_CHECK_TIMEOUT_SECS
            };
            build_direct_http_client(Duration::from_secs(secs))
        },
        &validate_official_asset_url_for_target,
        &|_, candidate, manifest_bytes| {
            let app_handle = app.clone();
            async move {
                materialize_update_via_loopback_bridge(&app_handle, &candidate, manifest_bytes)
                    .await
            }
        },
    )
    .await
    {
        Ok(MaterializedCheckOutcome::UpToDate {
            source,
            fallback_from_mirror,
        }) => {
            return Ok(CheckUpdateResponse {
                source,
                fallback_from_mirror,
                update: None,
            });
        }
        Ok(MaterializedCheckOutcome::Available {
            source,
            fallback_from_mirror,
            candidate,
            materialized,
        }) => (source, fallback_from_mirror, candidate, materialized),
        Err((source, kind, message, tried_mirror)) => {
            let final_message = if tried_mirror {
                "加速镜像与 GitHub 官方源均检查失败，请检查网络后重试"
            } else {
                message
            };
            return Err(format_command_error("check", source, kind, final_message));
        }
    };

    let current_version = update.current_version.clone();
    let version = update.version.clone();
    let date = extract_release_date(&update);
    let body = update.body.clone();

    let prepared = PreparedUpdate {
        official: update,
        pubkey,
        target_key: candidate.target_key,
        manifest_source: source,
        fallback_from_mirror,
        installing: AtomicBool::new(false),
    };
    let rid = webview.resources_table().add(prepared);

    Ok(CheckUpdateResponse {
        source,
        fallback_from_mirror,
        update: Some(CheckedUpdateInfo {
            rid,
            current_version,
            version,
            date,
            body,
        }),
    })
}

#[tauri::command]
pub async fn install_app_update<R: Runtime>(
    webview: Webview<R>,
    rid: ResourceId,
    on_event: Channel<TransferEvent>,
) -> Result<UpdateRoute, String> {
    let _process_guard = AtomicFlagGuard::acquire(&INSTALL_LOCK).map_err(|_| {
        format_command_error(
            "install",
            UpdateSource::Official,
            "busy",
            "已有更新安装正在进行中，请勿重复触发",
        )
    })?;

    let resource = webview
        .resources_table()
        .get::<PreparedUpdate>(rid)
        .map_err(|_| {
            format_command_error(
                "install",
                UpdateSource::Official,
                "invalid_handle",
                "更新句柄已失效，请重新检查更新",
            )
        })?;

    let _item_guard = AtomicFlagGuard::acquire(&resource.installing).map_err(|_| {
        format_command_error(
            "install",
            resource.manifest_source,
            "busy",
            "该更新正在下载或安装中",
        )
    })?;

    let official_update = resource.official.clone();
    let pubkey = resource.pubkey.clone();
    let target_key = resource.target_key.clone();

    if let Err(err_msg) = validate_official_asset_url_for_target(
        &official_update.download_url,
        &official_update.version,
        &target_key,
    ) {
        return Err(format_command_error(
            "download",
            resource.manifest_source,
            "validation",
            &err_msg,
        ));
    }

    let (bytes, current_source, fallback_from_mirror) = download_and_verify_with_fallback(
        &official_update.download_url,
        &target_key,
        &official_update.version,
        &official_update.signature,
        &pubkey,
        resource.manifest_source,
        resource.fallback_from_mirror,
        &|_| build_direct_http_client(Duration::from_secs(ASSET_TOTAL_TIMEOUT_SECS)),
        |event| {
            let _ = on_event.send(event);
        },
    )
    .await
    .map_err(|(source, fell_back, err)| match err {
        TransferError::Verification { kind, message } => {
            format_command_error("download", source, kind, message)
        }
        TransferError::Retryable { kind, message } => {
            let final_msg = if fell_back {
                "加速通道与 GitHub 官方源均下载失败，请稍后重试"
            } else {
                message
            };
            format_command_error("download", source, kind, final_msg)
        }
    })?;

    let _ = on_event.send(TransferEvent::Installing {
        source: current_source,
        fallback_from_mirror,
    });

    official_update.install(&bytes).map_err(|err| {
        let (kind, msg) = classify_updater_error(&err, "install");
        format_command_error("install", current_source, kind, msg)
    })?;

    let _ = webview.resources_table().take::<PreparedUpdate>(rid);

    Ok(UpdateRoute {
        source: current_source,
        fallback_from_mirror,
    })
}

#[tauri::command]
pub fn close_app_update<R: Runtime>(webview: Webview<R>, rid: ResourceId) -> Result<(), String> {
    let _ = webview.resources_table().take::<PreparedUpdate>(rid);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicUsize;
    use std::sync::Arc;

    // 确定性 Ed25519 minisign 测试公钥与正式包签名向量（负载均为主体 `b"test"`）
    const TEST_PUBKEY_B64: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXkgdGVzdApSV1FSSWpORVZXWjNpQ0ZTK05HYmVSMGtSVEpDNFY4dXEyeTN6L3A3YWw3VEFKZVdEZ2FZZ2RzUw==";
    const SIG_039_NSIS_B64: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRlc3Qgc2VjcmV0IGtleQpSVVFSSWpORVZXWjNpTWxSY0RDUlFqVFFnSlhPMlhVTmVqcStDbUdsMFdydXg4dzh0QUhOWlR5ZEFkWVJNRThlSVNyTURGaVNrZks3VklqSTNJSjRIbkk1V2xnYjczRnVvQWs9CnRydXN0ZWQgY29tbWVudDogdGltZXN0YW1wOjE3ODIwMjE5OTAJZmlsZTpNRkEgVG9vbF8wLjMuOV94NjQtc2V0dXAuZXhlCnJoaytibHJjeVBwcThGUXZtS3pZNmtkTFMwY2toUUR5UWhoUk1kdWdUblYyeVhMdzJWWHpXczI2Z1kzSlIxQnFZVmh6SXZ2eHY5VUpVbUdxK3NESkF3PT0=";
    const SIG_039_RC1_B64: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRlc3Qgc2VjcmV0IGtleQpSVVFSSWpORVZXWjNpTWxSY0RDUlFqVFFnSlhPMlhVTmVqcStDbUdsMFdydXg4dzh0QUhOWlR5ZEFkWVJNRThlSVNyTURGaVNrZks3VklqSTNJSjRIbkk1V2xnYjczRnVvQWs9CnRydXN0ZWQgY29tbWVudDogdGltZXN0YW1wOjE3ODIwMjE5OTAJZmlsZTpNRkEgVG9vbF8wLjMuOS1yYy4xX3g2NC1zZXR1cC5leGUKVEFjUVBhNmlEZm5MZlczemtmVXBLVzFTdFBJNXlxY3MyUmF1RlVqZU9WSnoxQ1BJcGNtVFNFWE1LUytNRHZKb0dDZW5OdkxJUmw2UmR2WVNQbmk2QUE9PQ==";
    const SIG_038_NSIS_B64: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRlc3Qgc2VjcmV0IGtleQpSVVFSSWpORVZXWjNpTWxSY0RDUlFqVFFnSlhPMlhVTmVqcStDbUdsMFdydXg4dzh0QUhOWlR5ZEFkWVJNRThlSVNyTURGaVNrZks3VklqSTNJSjRIbkk1V2xnYjczRnVvQWs9CnRydXN0ZWQgY29tbWVudDogdGltZXN0YW1wOjE3ODIwMjE5OTAJZmlsZTpNRkEgVG9vbF8wLjMuOF94NjQtc2V0dXAuZXhlCkkxSzI3YlV1S3EyQTNySTc3M3pVQUF0WEQxNTNBL0JPd2xLNm1GVndwVlVGZmt2azhmNFBTUXNRcm4yL0NFVmxVNDhObEViZkhuaHIzVzN3Qm5DMEJBPT0=";

    #[derive(Clone)]
    struct RawHttpResponse {
        raw: Vec<u8>,
        truncate_after: Option<usize>,
    }

    impl RawHttpResponse {
        fn new(status_line: &str, headers: &[(&str, String)], body: &[u8]) -> Self {
            let mut raw = format!("HTTP/1.1 {status_line}\r\nConnection: close\r\n").into_bytes();
            for (name, val) in headers {
                raw.extend_from_slice(format!("{name}: {val}\r\n").as_bytes());
            }
            raw.extend_from_slice(b"\r\n");
            raw.extend_from_slice(body);
            Self {
                raw,
                truncate_after: None,
            }
        }
    }

    async fn spawn_http_server<F>(handler: F) -> (Url, Arc<AtomicUsize>)
    where
        F: Fn(&str) -> RawHttpResponse + Send + Sync + 'static,
    {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let hits = Arc::new(AtomicUsize::new(0));
        let hits_clone = Arc::clone(&hits);
        let handler = Arc::new(handler);

        tokio::spawn(async move {
            loop {
                let Ok((mut socket, _)) = listener.accept().await else {
                    break;
                };
                hits_clone.fetch_add(1, Ordering::SeqCst);
                let handler = Arc::clone(&handler);
                tokio::spawn(async move {
                    let mut req_buf = [0u8; 4096];
                    let n = socket.read(&mut req_buf).await.unwrap_or(0);
                    let req_text = String::from_utf8_lossy(&req_buf[..n]);
                    let path = req_text
                        .lines()
                        .next()
                        .and_then(|line| line.split_whitespace().nth(1))
                        .unwrap_or("/");
                    let resp = handler(path);
                    let slice = match resp.truncate_after {
                        Some(limit) => &resp.raw[..limit.min(resp.raw.len())],
                        None => &resp.raw[..],
                    };
                    let _ = socket.write_all(slice).await;
                    let _ = socket.shutdown().await;
                });
            }
        });

        let url = Url::parse(&format!("http://{addr}")).unwrap();
        (url, hits)
    }

    fn build_local_test_client(max_redirects: usize) -> Client {
        ensure_rustls_crypto_provider();
        ClientBuilder::new()
            .user_agent(APP_UPDATER_USER_AGENT)
            .timeout(Duration::from_secs(5))
            .redirect(RedirectPolicy::custom(move |attempt| {
                if attempt.previous().len() > max_redirects {
                    return attempt.error(std::io::Error::other("too many redirects"));
                }
                if attempt.url().host_str() != Some("127.0.0.1") {
                    return attempt.error(std::io::Error::new(
                        std::io::ErrorKind::PermissionDenied,
                        "disallowed redirect target",
                    ));
                }
                attempt.follow()
            }))
            .build()
            .unwrap()
    }

    #[test]
    fn validates_official_release_asset_urls_strictly_per_target() {
        let valid_nsis = Url::parse(
            "https://github.com/CovoebGem/MFA-Tool/releases/download/v0.3.9/MFA.Tool_0.3.9_x64-setup.exe",
        )
        .unwrap();
        assert!(validate_official_asset_url_for_target(&valid_nsis, "0.3.9", "windows-x86_64-nsis").is_ok());
        // 错配成 MSI 目标或未知目标或预发行文件名应拒绝
        assert!(validate_official_asset_url_for_target(&valid_nsis, "0.3.9", "windows-x86_64-msi").is_err());
        assert!(validate_official_asset_url_for_target(&valid_nsis, "0.3.9", "unknown-target").is_err());

        let valid_cases = [
            (
                "windows-x86_64",
                "https://github.com/CovoebGem/MFA-Tool/releases/download/v0.3.9/MFA.Tool_0.3.9_x64_en-US.msi",
            ),
            (
                "windows-x86_64-msi",
                "https://github.com/CovoebGem/MFA-Tool/releases/download/v0.3.9/MFA.Tool_0.3.9_x64_en-US.msi",
            ),
            (
                "windows-x86_64-nsis",
                "https://github.com/CovoebGem/MFA-Tool/releases/download/v0.3.9/MFA.Tool_0.3.9_x64-setup.exe",
            ),
            (
                "darwin-aarch64",
                "https://github.com/CovoebGem/MFA-Tool/releases/download/v0.3.9/MFA.Tool_aarch64.app.tar.gz",
            ),
            (
                "darwin-aarch64-app",
                "https://github.com/CovoebGem/MFA-Tool/releases/download/v0.3.9/MFA.Tool_aarch64.app.tar.gz",
            ),
            (
                "linux-x86_64",
                "https://github.com/CovoebGem/MFA-Tool/releases/download/v0.3.9/MFA.Tool_0.3.9_amd64.AppImage",
            ),
            (
                "linux-x86_64-appimage",
                "https://github.com/CovoebGem/MFA-Tool/releases/download/v0.3.9/MFA.Tool_0.3.9_amd64.AppImage",
            ),
            (
                "linux-x86_64-deb",
                "https://github.com/CovoebGem/MFA-Tool/releases/download/v0.3.9/MFA.Tool_0.3.9_amd64.deb",
            ),
            (
                "linux-x86_64-rpm",
                "https://github.com/CovoebGem/MFA-Tool/releases/download/v0.3.9/MFA.Tool-0.3.9-1.x86_64.rpm",
            ),
        ];

        for (target_key, raw) in valid_cases {
            let parsed = Url::parse(raw).unwrap();
            assert!(
                validate_official_asset_url_for_target(&parsed, "0.3.9", target_key).is_ok(),
                "expected {target_key} -> {raw} to pass"
            );
        }

        let bad_cases = [
            "http://github.com/CovoebGem/MFA-Tool/releases/download/v0.3.9/MFA.Tool_0.3.9_x64-setup.exe",
            "https://evil.example/CovoebGem/MFA-Tool/releases/download/v0.3.9/MFA.Tool_0.3.9_x64-setup.exe",
            "https://user:pass@github.com/CovoebGem/MFA-Tool/releases/download/v0.3.9/MFA.Tool_0.3.9_x64-setup.exe",
            "https://github.com:8443/CovoebGem/MFA-Tool/releases/download/v0.3.9/MFA.Tool_0.3.9_x64-setup.exe",
            "https://github.com/CovoebGem/MFA-Tool/releases/download/v0.3.9/MFA.Tool_0.3.9_x64-setup.exe?foo=bar",
            "https://github.com/CovoebGem/MFA-Tool/releases/download/v0.3.9/MFA.Tool_0.3.9-rc.1_x64-setup.exe",
            "https://github.com/CovoebGem/MFA-Tool/releases/download/v0.3.9/test",
            "https://github.com/CovoebGem/MFA-Tool/releases/download/v0.3.9/nested/file.exe",
            "https://github.com/CovoebGem/MFA-Tool/releases/download/v0.3.9/..%2Fevil.exe",
            "https://github.com/CovoebGem/MFA-Tool/releases/download/v0.3.9/a%2fb.exe",
            "https://github.com/Other/Repo/releases/download/v0.3.9/file.exe",
        ];

        for raw in bad_cases {
            let parsed = Url::parse(raw).unwrap();
            assert!(
                validate_official_asset_url_for_target(&parsed, "0.3.9", "windows-x86_64-nsis")
                    .is_err(),
                "expected URL to be rejected: {raw}"
            );
        }
    }

    #[test]
    fn rewrites_official_url_host_to_mirror_preserving_path() {
        let official = Url::parse(
            "https://github.com/CovoebGem/MFA-Tool/releases/download/v0.3.9/MFA.Tool_aarch64.app.tar.gz",
        )
        .unwrap();
        let mirrored = rewrite_url_to_mirror(&official).unwrap();
        assert_eq!(
            mirrored.as_str(),
            "https://github.cbcsec.cc/CovoebGem/MFA-Tool/releases/download/v0.3.9/MFA.Tool_aarch64.app.tar.gz"
        );
    }

    #[test]
    fn enforces_redirect_allowlist_by_initial_host() {
        let mirror_asset = Url::parse("https://github.cbcsec.cc/release-assets/abc/file.exe").unwrap();
        let official_release_assets =
            Url::parse("https://release-assets.githubusercontent.com/abc/file.exe?sig=1").unwrap();
        let official_objects =
            Url::parse("https://objects.githubusercontent.com/abc/file.exe").unwrap();
        let official_github_releases =
            Url::parse("https://github-releases.githubusercontent.com/abc/file.exe").unwrap();
        let evil = Url::parse("https://evil.example/file.exe").unwrap();
        let http_mirror = Url::parse("http://github.cbcsec.cc/release-assets/abc").unwrap();

        assert!(is_allowed_redirect_target(MIRROR_HOST, &mirror_asset));
        assert!(!is_allowed_redirect_target(MIRROR_HOST, &official_release_assets));
        assert!(!is_allowed_redirect_target(MIRROR_HOST, &http_mirror));
        assert!(!is_allowed_redirect_target(MIRROR_HOST, &evil));

        assert!(is_allowed_redirect_target(OFFICIAL_HOST, &official_release_assets));
        assert!(is_allowed_redirect_target(OFFICIAL_HOST, &official_objects));
        assert!(is_allowed_redirect_target(OFFICIAL_HOST, &official_github_releases));
        assert!(!is_allowed_redirect_target(OFFICIAL_HOST, &mirror_asset));
        assert!(!is_allowed_redirect_target(OFFICIAL_HOST, &evil));
    }

    #[test]
    fn validates_remote_manifest_endpoints_strictly() {
        assert!(is_allowed_remote_manifest_endpoint(
            &Url::parse(DEFAULT_MIRROR_ENDPOINT).unwrap()
        ));
        assert!(is_allowed_remote_manifest_endpoint(
            &Url::parse(DEFAULT_OFFICIAL_ENDPOINT).unwrap()
        ));
        assert!(!is_allowed_remote_manifest_endpoint(
            &Url::parse("http://github.com/CovoebGem/MFA-Tool/releases/latest/download/latest.json")
                .unwrap()
        ));
        assert!(!is_allowed_remote_manifest_endpoint(
            &Url::parse("http://127.0.0.1:8080/latest.json").unwrap()
        ));
        assert!(!is_allowed_remote_manifest_endpoint(
            &Url::parse("https://evil.example/latest.json").unwrap()
        ));
    }

    #[test]
    fn classifies_signature_and_network_errors_accurately() {
        assert!(is_signature_or_verification_error(&UpdaterError::InvalidUpdaterFormat));
        assert!(is_signature_or_verification_error(&UpdaterError::SignatureUtf8("bad".into())));
        assert!(!is_signature_or_verification_error(&UpdaterError::Network("502".into())));

        let (kind, _) = classify_updater_error(&UpdaterError::Network("502".into()), "download");
        assert_eq!(kind, "http");
        let (sig_kind, _) =
            classify_updater_error(&UpdaterError::SignatureUtf8("bad".into()), "download");
        assert_eq!(sig_kind, "signature");
    }

    #[test]
    fn validates_minisign_and_exact_target_signed_filenames() {
        let trusted = verify_minisign_signature(b"test", SIG_039_NSIS_B64, TEST_PUBKEY_B64).unwrap();
        assert_eq!(trusted, "timestamp:1782021990\tfile:MFA Tool_0.3.9_x64-setup.exe");

        assert!(validate_signature_trusted_comment(&trusted, "windows-x86_64-nsis", "0.3.9").is_ok());
        // 跨目标（MSI / Linux）或未知目标应被严格拒绝
        assert!(validate_signature_trusted_comment(&trusted, "windows-x86_64-msi", "0.3.9").is_err());
        assert!(validate_signature_trusted_comment(&trusted, "linux-x86_64-deb", "0.3.9").is_err());
        assert!(validate_signature_trusted_comment(&trusted, "unknown-target", "0.3.9").is_err());

        // 同号预发行包 `0.3.9-rc.1` 即使密码学签名有效，也不能冒充正式版 `0.3.9`
        let rc_trusted =
            verify_minisign_signature(b"test", SIG_039_RC1_B64, TEST_PUBKEY_B64).unwrap();
        assert!(validate_signature_trusted_comment(
            &rc_trusted,
            "windows-x86_64-nsis",
            "0.3.9"
        )
        .is_err());

        // 历史旧版 `0.3.8` 也必须被正式版本精确匹配拒绝
        let old_trusted =
            verify_minisign_signature(b"test", SIG_038_NSIS_B64, TEST_PUBKEY_B64).unwrap();
        assert!(validate_signature_trusted_comment(
            &old_trusted,
            "windows-x86_64-nsis",
            "0.3.9"
        )
        .is_err());

        // 其余全部官方 9 个目标的签名注释精确规则
        let expected_signed = [
            ("windows-x86_64", "MFA Tool_0.3.9_x64_en-US.msi"),
            ("windows-x86_64-msi", "MFA Tool_0.3.9_x64_en-US.msi"),
            ("windows-x86_64-nsis", "MFA Tool_0.3.9_x64-setup.exe"),
            ("darwin-aarch64", "MFA Tool.app.tar.gz"),
            ("darwin-aarch64-app", "MFA Tool.app.tar.gz"),
            ("linux-x86_64", "MFA Tool_0.3.9_amd64.AppImage"),
            ("linux-x86_64-appimage", "MFA Tool_0.3.9_amd64.AppImage"),
            ("linux-x86_64-deb", "MFA Tool_0.3.9_amd64.deb"),
            ("linux-x86_64-rpm", "MFA Tool-0.3.9-1.x86_64.rpm"),
        ];
        for (target_key, signed_file) in expected_signed {
            let comment = format!("timestamp:1782021990\tfile:{signed_file}");
            assert!(
                validate_signature_trusted_comment(&comment, target_key, "0.3.9").is_ok(),
                "expected {target_key} -> {signed_file} to pass"
            );
        }
    }

    #[tokio::test]
    async fn loopback_bridge_serves_verified_manifest_only_once_for_secret_path() {
        let payload = br#"{"version":"0.3.9"}"#.to_vec();
        let (bridge_url, _guard) = serve_verified_manifest_once(payload.clone()).await.unwrap();
        let client = ClientBuilder::new()
            .no_proxy()
            .redirect(RedirectPolicy::none())
            .build()
            .unwrap();

        // Wrong path does not leak manifest or consume the one-shot budget
        let wrong_url = bridge_url.join("/wrong.json").unwrap();
        let wrong_res = client.get(wrong_url).send().await.unwrap();
        assert_eq!(wrong_res.status(), StatusCode::NOT_FOUND);

        // Exact path delivers bytes cleanly once and then closes listener
        let ok_res = client.get(bridge_url.clone()).send().await.unwrap();
        assert_eq!(ok_res.status(), StatusCode::OK);
        assert_eq!(ok_res.bytes().await.unwrap().as_ref(), payload.as_slice());

        // Second request fails because one-shot server has already exited
        assert!(client.get(bridge_url).send().await.is_err());
    }

    #[tokio::test]
    async fn manifest_check_falls_back_on_http_and_second_phase_materialization_errors() {
        let valid_manifest = serde_json::json!({
            "version": "0.3.9",
            "platforms": {
                "windows-x86_64-nsis": {
                    "url": "https://github.com/CovoebGem/MFA-Tool/releases/download/v0.3.9/MFA.Tool_0.3.9_x64-setup.exe",
                    "signature": SIG_039_NSIS_B64
                }
            }
        })
        .to_string();

        let (base_url, hits) = spawn_http_server(move |path| match path {
            "/204.json" => RawHttpResponse::new("204 No Content", &[], &[]),
            "/502.json" => RawHttpResponse::new("502 Bad Gateway", &[], b"bad gateway"),
            "/html.json" => RawHttpResponse::new(
                "200 OK",
                &[("Content-Type", "text/html; charset=utf-8".into())],
                b"<html>blocked</html>",
            ),
            "/huge.json" => {
                let body = vec![b' '; MAX_MANIFEST_BYTES + 32];
                RawHttpResponse::new("200 OK", &[("Content-Length", body.len().to_string())], &body)
            }
            "/same.json" => RawHttpResponse::new(
                "200 OK",
                &[("Content-Type", "application/json".into())],
                serde_json::json!({
                    "version": "0.3.8",
                    "platforms": {}
                })
                .to_string()
                .as_bytes(),
            ),
            "/mirror-ok.json" | "/official.json" => RawHttpResponse::new(
                "200 OK",
                &[
                    ("Content-Type", "application/json".into()),
                    ("Content-Length", valid_manifest.len().to_string()),
                ],
                valid_manifest.as_bytes(),
            ),
            _ => RawHttpResponse::new("404 Not Found", &[], &[]),
        })
        .await;

        let current = Version::parse("0.3.8").unwrap();
        let targets = vec!["windows-x86_64-nsis".to_string()];
        let build_client = |_: UpdateSource| Ok(build_local_test_client(MAX_REDIRECTS));
        let classify_local_source = |url: &Url| {
            if url.path().starts_with("/official") {
                UpdateSource::Official
            } else {
                UpdateSource::Mirror
            }
        };

        for mirror_path in ["/204.json", "/502.json", "/html.json", "/huge.json"] {
            let endpoints = vec![
                base_url.join(mirror_path).unwrap(),
                base_url.join("/official.json").unwrap(),
            ];
            let outcome = check_and_materialize_endpoints_with_classifier(
                &endpoints,
                &current,
                &targets,
                &build_client,
                &validate_official_asset_url_for_target,
                &classify_local_source,
                &|source, cand, _| async move { Ok((source, cand.version)) },
            )
            .await
            .unwrap();
            assert!(
                matches!(
                    outcome,
                    MaterializedCheckOutcome::Available {
                        source: UpdateSource::Official,
                        fallback_from_mirror: true,
                        ..
                    }
                ),
                "expected fallback for {mirror_path}"
            );
        }

        // 镜像清单成功且无第二阶段错误时，在首跳即止，仅发生 1 次 HTTP GET
        let mirror_ok_hits = hits.load(Ordering::SeqCst);
        let outcome = check_and_materialize_endpoints_with_classifier(
            &[
                base_url.join("/mirror-ok.json").unwrap(),
                base_url.join("/official.json").unwrap(),
            ],
            &current,
            &targets,
            &build_client,
            &validate_official_asset_url_for_target,
            &classify_local_source,
            &|source, _candidate, _bytes| async move {
                assert_eq!(source, UpdateSource::Mirror);
                Ok(())
            },
        )
        .await;
        assert!(matches!(
            outcome,
            Ok(MaterializedCheckOutcome::Available {
                source: UpdateSource::Mirror,
                fallback_from_mirror: false,
                ..
            })
        ));
        assert_eq!(hits.load(Ordering::SeqCst), mirror_ok_hits + 1);

        // 显式模拟第一跳 materializer 返回 Err，验证逐源回退到官方源且每源至多请求一次
        let attempt_counter = Arc::new(AtomicUsize::new(0));
        let attempt_clone = Arc::clone(&attempt_counter);
        let before_second_phase = hits.load(Ordering::SeqCst);
        let second_phase_outcome = check_and_materialize_endpoints_with_classifier(
            &[
                base_url.join("/mirror-ok.json").unwrap(),
                base_url.join("/official.json").unwrap(),
            ],
            &current,
            &targets,
            &build_client,
            &validate_official_asset_url_for_target,
            &classify_local_source,
            &move |_source, _candidate, bytes| {
                let n = attempt_clone.fetch_add(1, Ordering::SeqCst);
                async move {
                    if n == 0 {
                        Err(("manifest", "simulated second-phase failure"))
                    } else {
                        Ok(bytes.len())
                    }
                }
            },
        )
        .await
        .unwrap();
        assert!(matches!(
            second_phase_outcome,
            MaterializedCheckOutcome::Available {
                source: UpdateSource::Official,
                fallback_from_mirror: true,
                ..
            }
        ));
        assert_eq!(attempt_counter.load(Ordering::SeqCst), 2);
        // 严格每跳仅 1 次远程 HTTP 请求（共 2 次），彻底消除第二次重复请求
        assert_eq!(hits.load(Ordering::SeqCst), before_second_phase + 2);

        // 同版本号命中即止，不再发起任何后续请求
        let hits_before_same = hits.load(Ordering::SeqCst);
        let same_outcome = check_and_materialize_endpoints_with_classifier(
            &[
                base_url.join("/same.json").unwrap(),
                base_url.join("/official.json").unwrap(),
            ],
            &current,
            &targets,
            &build_client,
            &validate_official_asset_url_for_target,
            &classify_local_source,
            &|_, _, _| async move { Ok(()) },
        )
        .await
        .unwrap();
        assert!(matches!(
            same_outcome,
            MaterializedCheckOutcome::UpToDate {
                source: UpdateSource::Mirror,
                fallback_from_mirror: false,
            }
        ));
        assert_eq!(hits.load(Ordering::SeqCst), hits_before_same + 1);
    }

    #[tokio::test]
    async fn fetch_allows_five_redirects_and_rejects_six() {
        let (base_url, _) = spawn_http_server(|path| {
            if let Some(step) = path.strip_prefix("/hop/") {
                let n: usize = step.parse().unwrap_or(0);
                if n > 0 {
                    return RawHttpResponse::new(
                        "302 Found",
                        &[("Location", format!("/hop/{}", n - 1))],
                        &[],
                    );
                }
            }
            RawHttpResponse::new("200 OK", &[("Content-Length", "2".into())], b"ok")
        })
        .await;

        let client = build_local_test_client(MAX_REDIRECTS);
        let ok_res = fetch_bounded_response(
            &client,
            &base_url.join("/hop/5").unwrap(),
            "application/octet-stream",
            1024,
            false,
            |_, _| {},
        )
        .await;
        assert_eq!(ok_res.unwrap(), b"ok");

        let err_res = fetch_bounded_response(
            &client,
            &base_url.join("/hop/6").unwrap(),
            "application/octet-stream",
            1024,
            false,
            |_, _| {},
        )
        .await;
        assert!(matches!(
            err_res,
            Err(TransferError::Retryable {
                kind: "redirect",
                ..
            })
        ));
    }

    #[tokio::test]
    async fn download_urls_with_fallback_recovers_and_enforces_exact_target_signature_for_v039() {
        let (mirror_url, _) = spawn_http_server(|path| match path {
            "/html" => RawHttpResponse::new(
                "200 OK",
                &[
                    ("Content-Type", "text/html".into()),
                    ("Content-Length", "4".into()),
                ],
                b"html",
            ),
            "/partial" => RawHttpResponse::new(
                "206 Partial Content",
                &[("Content-Length", "4".into())],
                b"test",
            ),
            "/oversized" => RawHttpResponse::new(
                "200 OK",
                &[
                    ("Content-Type", "application/octet-stream".into()),
                    ("Content-Length", (MAX_ASSET_BYTES + 1).to_string()),
                ],
                b"x",
            ),
            "/truncated" => RawHttpResponse {
                raw: b"HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Type: application/octet-stream\r\nContent-Length: 100\r\n\r\nte".to_vec(),
                truncate_after: None,
            },
            "/chunked-overflow" => {
                let big = vec![b'A'; MAX_ASSET_BYTES + 128];
                RawHttpResponse::new(
                    "200 OK",
                    &[("Content-Type", "application/octet-stream".into())],
                    &big,
                )
            }
            "/tampered" => RawHttpResponse::new(
                "200 OK",
                &[
                    ("Content-Type", "application/octet-stream".into()),
                    ("Content-Length", "4".into()),
                ],
                b"evil",
            ),
            "/signed-payload" => RawHttpResponse::new(
                "200 OK",
                &[
                    ("Content-Type", "application/octet-stream".into()),
                    ("Content-Length", "4".into()),
                ],
                b"test",
            ),
            _ => RawHttpResponse::new("404 Not Found", &[], &[]),
        })
        .await;

        let (official_url, official_hits) = spawn_http_server(|_| {
            RawHttpResponse::new(
                "200 OK",
                &[
                    ("Content-Type", "application/octet-stream".into()),
                    ("Content-Length", "4".into()),
                ],
                b"test",
            )
        })
        .await;

        let build_client = |_: UpdateSource| Ok(build_local_test_client(MAX_REDIRECTS));
        let target_key = "windows-x86_64-nsis";

        // 1. 镜像 200 HTML / 206 / 超限 / 断流 / 无 Content-Length 分块超限均回退官方源并用 0.3.9 NSIS 真实签名验证通过
        for mirror_path in ["/html", "/partial", "/oversized", "/truncated", "/chunked-overflow"] {
            let mut events = Vec::new();
            let (bytes, final_source, fell_back) = download_urls_with_fallback(
                &mirror_url.join(mirror_path).unwrap(),
                &official_url,
                target_key,
                "0.3.9",
                SIG_039_NSIS_B64,
                TEST_PUBKEY_B64,
                UpdateSource::Mirror,
                false,
                &build_client,
                |event| events.push(event),
            )
            .await
            .unwrap();

            assert_eq!(bytes, b"test");
            assert_eq!(final_source, UpdateSource::Official);
            assert!(fell_back);
            assert!(events.iter().any(|e| matches!(
                e,
                TransferEvent::Fallback {
                    source: UpdateSource::Official,
                    fallback_from_mirror: true,
                    ..
                }
            )));
        }

        // 2. 镜像返回有效字节或预发行/旧版本签名文件 -> 非重试 Verification 错误直接中止，绝不访问官方源
        for (mirror_path, sig, label) in [
            ("/tampered", SIG_039_NSIS_B64, "tampered bytes"),
            ("/signed-payload", SIG_039_RC1_B64, "prerelease signature for 0.3.9"),
            ("/signed-payload", SIG_038_NSIS_B64, "downgrade 0.3.8 signature"),
        ] {
            let hits_before = official_hits.load(Ordering::SeqCst);
            let mut sig_events = Vec::new();
            let (_, _, err) = download_urls_with_fallback(
                &mirror_url.join(mirror_path).unwrap(),
                &official_url,
                target_key,
                "0.3.9",
                sig,
                TEST_PUBKEY_B64,
                UpdateSource::Mirror,
                false,
                &build_client,
                |event| sig_events.push(event),
            )
            .await
            .unwrap_err();

            assert!(
                matches!(err, TransferError::Verification { kind: "signature", .. }),
                "expected signature error for {label}"
            );
            assert!(!sig_events
                .iter()
                .any(|e| matches!(e, TransferEvent::Fallback { .. })));
            assert_eq!(official_hits.load(Ordering::SeqCst), hits_before);
        }
    }

    #[test]
    fn rejects_prerelease_manifest_even_when_url_and_filename_match() {
        let manifest = serde_json::json!({
            "version": "0.3.10-rc.1",
            "platforms": {
                "windows-x86_64-nsis": {
                    "url": "https://github.com/CovoebGem/MFA-Tool/releases/download/v0.3.10-rc.1/MFA.Tool_0.3.10-rc.1_x64-setup.exe",
                    "signature": SIG_039_NSIS_B64
                }
            }
        })
        .to_string();

        let current = Version::parse("0.3.9").unwrap();
        let targets = vec!["windows-x86_64-nsis".to_string()];
        let err = parse_manifest_candidate(
            manifest.as_bytes(),
            &current,
            &targets,
            &validate_official_asset_url_for_target,
        )
        .unwrap_err();
        assert!(matches!(err, TransferError::Retryable { kind: "manifest", .. }));
    }

    #[test]
    fn nsis_deb_rpm_targets_do_not_fallback_to_generic_platform_key() {
        assert_eq!(
            build_updater_target_keys_for("windows", "x86_64", Some(BundleType::Nsis)),
            vec!["windows-x86_64-nsis"]
        );
        assert_eq!(
            build_updater_target_keys_for("linux", "x86_64", Some(BundleType::Deb)),
            vec!["linux-x86_64-deb"]
        );
        assert_eq!(
            build_updater_target_keys_for("linux", "x86_64", Some(BundleType::Rpm)),
            vec!["linux-x86_64-rpm"]
        );
        assert_eq!(
            build_updater_target_keys_for("windows", "x86_64", Some(BundleType::Msi)),
            vec!["windows-x86_64-msi", "windows-x86_64"]
        );

        let msi_only_manifest = serde_json::json!({
            "version": "0.3.10",
            "platforms": {
                "windows-x86_64": {
                    "url": "https://github.com/CovoebGem/MFA-Tool/releases/download/v0.3.10/MFA.Tool_0.3.10_x64_en-US.msi",
                    "signature": SIG_039_NSIS_B64
                },
                "linux-x86_64": {
                    "url": "https://github.com/CovoebGem/MFA-Tool/releases/download/v0.3.10/MFA.Tool_0.3.10_amd64.AppImage",
                    "signature": SIG_039_NSIS_B64
                }
            }
        })
        .to_string();

        let current = Version::parse("0.3.9").unwrap();
        for (os, bundle) in [
            ("windows", BundleType::Nsis),
            ("linux", BundleType::Deb),
            ("linux", BundleType::Rpm),
        ] {
            let keys = build_updater_target_keys_for(os, "x86_64", Some(bundle.clone()));
            let err = parse_manifest_candidate(
                msi_only_manifest.as_bytes(),
                &current,
                &keys,
                &validate_official_asset_url_for_target,
            )
            .unwrap_err();
            assert!(
                matches!(err, TransferError::Retryable { kind: "platform", .. }),
                "expected platform rejection for {bundle:?}"
            );
        }
    }
}