import { invoke } from "@tauri-apps/api/core";

function normalizePassword(password?: string | null): string | null {
  if (password === undefined || password === null || password === "") {
    return null;
  }
  return password;
}

export async function hasSavedWebDavPassword(): Promise<boolean> {
  return invoke<boolean>("has_webdav_password");
}

export async function saveWebDavPassword(password: string): Promise<void> {
  await invoke("save_webdav_password", {
    password,
  });
}

export async function clearSavedWebDavPassword(): Promise<void> {
  await invoke("clear_webdav_password");
}

export async function readWebDavSync(
  fileUrl: string,
  username: string,
  password?: string | null,
): Promise<string | null> {
  return invoke<string | null>("read_webdav_sync", {
    fileUrl: fileUrl.trim(),
    username: username.trim(),
    password: normalizePassword(password),
  });
}

export async function writeWebDavSync(
  fileUrl: string,
  username: string,
  data: string,
  password?: string | null,
): Promise<void> {
  await invoke("write_webdav_sync", {
    fileUrl: fileUrl.trim(),
    username: username.trim(),
    password: normalizePassword(password),
    data,
  });
}
