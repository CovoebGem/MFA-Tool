export interface WebDavConfig {
  baseUrl: string;
  path: string;
  username: string;
}

interface LegacyWebDavConfig {
  fileUrl: string;
  username: string;
}

const WEBDAV_CONFIG_KEY = "mfa-tool:webdav-config";
const DEFAULT_WEBDAV_PATH = "/MFA-Tool/";

export const DEFAULT_WEBDAV_CONFIG: WebDavConfig = {
  baseUrl: "",
  path: DEFAULT_WEBDAV_PATH,
  username: "",
};

function isLegacyWebDavConfig(value: unknown): value is LegacyWebDavConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const obj = value as Record<string, unknown>;
  return typeof obj.fileUrl === "string" && typeof obj.username === "string";
}

export function isValidWebDavConfig(value: unknown): value is WebDavConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const obj = value as Record<string, unknown>;
  return (
    typeof obj.baseUrl === "string"
    && typeof obj.path === "string"
    && typeof obj.username === "string"
  );
}

export function normalizeWebDavPath(path: string): string {
  const trimmed = path.trim();

  if (!trimmed) {
    return DEFAULT_WEBDAV_PATH;
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const parsed = new URL(trimmed);
    const normalizedPath = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.origin}${normalizedPath}`;
  } catch {
    return trimmed;
  }
}

function normalizeConfig(config: WebDavConfig): WebDavConfig {
  return {
    baseUrl: normalizeBaseUrl(config.baseUrl),
    path: normalizeWebDavPath(config.path),
    username: config.username.trim(),
  };
}

function migrateLegacyConfig(config: LegacyWebDavConfig): WebDavConfig {
  try {
    const parsed = new URL(config.fileUrl.trim());
    const filePath = parsed.pathname.endsWith("/sync.json")
      ? parsed.pathname.slice(0, -"/sync.json".length) || "/"
      : parsed.pathname || "/";
    const normalizedPath = filePath.endsWith(".json")
      ? filePath
      : filePath.endsWith("/") ? filePath : `${filePath}/`;

    return normalizeConfig({
      baseUrl: parsed.origin,
      path: normalizedPath,
      username: config.username,
    });
  } catch {
    return DEFAULT_WEBDAV_CONFIG;
  }
}

export function buildWebDavFileUrl(config: WebDavConfig): string {
  const parsed = new URL(config.baseUrl.trim());
  const basePath = parsed.pathname.replace(/\/+$/, "");
  const normalizedPath = normalizeWebDavPath(config.path);
  const remoteFilePath = normalizedPath.endsWith(".json")
    ? normalizedPath
    : `${normalizedPath.replace(/\/+$/, "") || ""}/sync.json`;

  parsed.pathname = `${basePath}${remoteFilePath}`.replace(/\/{2,}/g, "/");
  parsed.search = "";
  parsed.hash = "";

  return parsed.toString();
}

export function saveWebDavConfig(config: WebDavConfig): void {
  try {
    localStorage.setItem(WEBDAV_CONFIG_KEY, JSON.stringify(normalizeConfig(config)));
  } catch {
    // localStorage 不可用时静默失败
  }
}

export function loadWebDavConfig(): WebDavConfig {
  try {
    const raw = localStorage.getItem(WEBDAV_CONFIG_KEY);
    if (!raw) {
      return DEFAULT_WEBDAV_CONFIG;
    }

    const parsed = JSON.parse(raw);
    if (isValidWebDavConfig(parsed)) {
      return normalizeConfig(parsed);
    }
    if (isLegacyWebDavConfig(parsed)) {
      return migrateLegacyConfig(parsed);
    }
    return DEFAULT_WEBDAV_CONFIG;
  } catch {
    return DEFAULT_WEBDAV_CONFIG;
  }
}

export function clearWebDavConfig(): void {
  try {
    localStorage.removeItem(WEBDAV_CONFIG_KEY);
  } catch {
    // localStorage 不可用时静默失败
  }
}
