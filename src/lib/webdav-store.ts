export interface WebDavConfig {
  fileUrl: string;
  username: string;
}

const WEBDAV_CONFIG_KEY = "mfa-tool:webdav-config";

export const DEFAULT_WEBDAV_CONFIG: WebDavConfig = {
  fileUrl: "",
  username: "",
};

export function isValidWebDavConfig(value: unknown): value is WebDavConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const obj = value as Record<string, unknown>;
  return typeof obj.fileUrl === "string" && typeof obj.username === "string";
}

function normalizeConfig(config: WebDavConfig): WebDavConfig {
  return {
    fileUrl: config.fileUrl.trim(),
    username: config.username.trim(),
  };
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
    return isValidWebDavConfig(parsed) ? normalizeConfig(parsed) : DEFAULT_WEBDAV_CONFIG;
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
