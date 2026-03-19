import { useEffect, useMemo, useState } from "react";
import type { Group, OTPAccount } from "../types";
import { exportToJSON, parseBackupJSON } from "../lib/backup";
import {
  clearSavedWebDavPassword,
  hasSavedWebDavPassword,
  readWebDavSync,
  saveWebDavPassword,
  writeWebDavSync,
} from "../lib/webdav-client";
import {
  clearWebDavConfig,
  loadWebDavConfig,
  saveWebDavConfig,
  type WebDavConfig,
} from "../lib/webdav-store";
import { mergeWebDavSyncData } from "../lib/webdav-sync";

type BusyAction =
  | "testing"
  | "pulling"
  | "pushing"
  | "syncing"
  | "saving-password"
  | "clearing-password"
  | null;

interface WebDavSyncPanelProps {
  accounts: OTPAccount[];
  groups: Group[];
  onApplyData: (accounts: OTPAccount[], groups: Group[]) => Promise<void>;
  onToast: (message: string, type: "success" | "error") => void;
}

function CloudIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75A4.5 4.5 0 016.75 11.25h.258a6 6 0 1111.728 1.5A3.75 3.75 0 0118.75 20.25H6.75a4.5 4.5 0 01-4.5-4.5z" />
    </svg>
  );
}

function validateConfig(draft: WebDavConfig): WebDavConfig {
  const fileUrl = draft.fileUrl.trim();
  const username = draft.username.trim();

  if (!fileUrl) {
    throw new Error("请填写 WebDAV 文件 URL");
  }
  if (!username) {
    throw new Error("请填写 WebDAV 用户名");
  }

  let parsed: URL;
  try {
    parsed = new URL(fileUrl);
  } catch {
    throw new Error("WebDAV 文件 URL 格式无效");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("WebDAV 文件 URL 仅支持 http/https");
  }
  if (parsed.username || parsed.password) {
    throw new Error("请不要把用户名或密码直接写进 URL");
  }
  if (parsed.pathname.endsWith("/")) {
    throw new Error("请输入具体的远端 sync.json 文件地址");
  }

  return { fileUrl, username };
}

export default function WebDavSyncPanel({
  accounts,
  groups,
  onApplyData,
  onToast,
}: WebDavSyncPanelProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<WebDavConfig>(() => loadWebDavConfig());
  const [password, setPassword] = useState("");
  const [rememberPassword, setRememberPassword] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const saved = await hasSavedWebDavPassword();
        if (!cancelled) {
          setPasswordSaved(saved);
        }
      } catch {
        if (!cancelled) {
          setPasswordSaved(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const hasConfig = useMemo(
    () => draft.fileUrl.trim().length > 0 && draft.username.trim().length > 0,
    [draft.fileUrl, draft.username],
  );
  const usingInsecureHttp = useMemo(
    () => draft.fileUrl.trim().startsWith("http://"),
    [draft.fileUrl],
  );

  const resetSensitiveInput = () => {
    setPassword("");
    setRememberPassword(false);
  };

  const closeDialog = () => {
    saveWebDavConfig(draft);
    setOpen(false);
    resetSensitiveInput();
  };

  const persistDraft = async () => {
    const normalized = validateConfig(draft);
    saveWebDavConfig(normalized);
    setDraft(normalized);

    const enteredPassword = password;
    if (!enteredPassword && !passwordSaved) {
      throw new Error("请输入密码，或先保存到系统钥匙串");
    }

    if (rememberPassword && enteredPassword) {
      await saveWebDavPassword(enteredPassword);
      setPasswordSaved(true);
    }

    return {
      ...normalized,
      password: enteredPassword || null,
    };
  };

  const runAction = async (
    action: Exclude<BusyAction, "saving-password" | "clearing-password" | null>,
    handler: (request: { fileUrl: string; username: string; password: string | null }) => Promise<void>,
  ) => {
    setBusyAction(action);
    try {
      const request = await persistDraft();
      await handler(request);
      resetSensitiveInput();
    } catch (err) {
      const message = err instanceof Error ? err.message : "WebDAV 同步失败";
      onToast(message, "error");
    } finally {
      setBusyAction(null);
    }
  };

  const handleSavePassword = async () => {
    if (!password) {
      onToast("请输入要保存到系统钥匙串的密码", "error");
      return;
    }

    setBusyAction("saving-password");
    try {
      await saveWebDavPassword(password);
      setPasswordSaved(true);
      setPassword("");
      setRememberPassword(false);
      onToast("WebDAV 密码已保存到系统钥匙串", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "保存密码失败";
      onToast(message, "error");
    } finally {
      setBusyAction(null);
    }
  };

  const handleClearPassword = async () => {
    setBusyAction("clearing-password");
    try {
      await clearSavedWebDavPassword();
      setPasswordSaved(false);
      setPassword("");
      setRememberPassword(false);
      onToast("已清除系统钥匙串中的 WebDAV 密码", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "清除密码失败";
      onToast(message, "error");
    } finally {
      setBusyAction(null);
    }
  };

  const handleTestConnection = async () => {
    await runAction("testing", async ({ fileUrl, username, password }) => {
      const remoteJson = await readWebDavSync(fileUrl, username, password);
      onToast(
        remoteJson
          ? "连接成功，已读取云端同步文件"
          : "连接成功，云端同步文件尚未创建",
        "success",
      );
    });
  };

  const handlePullAndMerge = async () => {
    await runAction("pulling", async ({ fileUrl, username, password }) => {
      const remoteJson = await readWebDavSync(fileUrl, username, password);
      if (!remoteJson) {
        throw new Error("云端同步文件不存在，无法拉取");
      }

      const remoteData = parseBackupJSON(remoteJson);
      const merged = mergeWebDavSyncData(accounts, groups, remoteData.accounts, remoteData.groups);
      await onApplyData(merged.accounts, merged.groups);
      onToast("已从 WebDAV 拉取并合并云端数据", "success");
    });
  };

  const handlePushToCloud = async () => {
    await runAction("pushing", async ({ fileUrl, username, password }) => {
      const json = await exportToJSON(accounts, groups);
      await writeWebDavSync(fileUrl, username, json, password);
      onToast("已将当前本地数据上传到 WebDAV", "success");
    });
  };

  const handleSyncNow = async () => {
    await runAction("syncing", async ({ fileUrl, username, password }) => {
      const remoteJson = await readWebDavSync(fileUrl, username, password);
      const nextData = remoteJson
        ? (() => {
            const remoteData = parseBackupJSON(remoteJson);
            return mergeWebDavSyncData(accounts, groups, remoteData.accounts, remoteData.groups);
          })()
        : { accounts, groups };

      if (remoteJson) {
        await onApplyData(nextData.accounts, nextData.groups);
      }

      const uploadJson = await exportToJSON(nextData.accounts, nextData.groups);
      await writeWebDavSync(fileUrl, username, uploadJson, password);
      onToast(
        remoteJson
          ? "已完成 WebDAV 合并同步"
          : "已创建首个 WebDAV 云端同步文件",
        "success",
      );
    });
  };

  const handleClearConfig = () => {
    clearWebDavConfig();
    setDraft({ fileUrl: "", username: "" });
    onToast("已清空本地 WebDAV 配置", "success");
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
      >
        <CloudIcon className="w-4 h-4" />
        云同步
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          role="dialog"
          aria-modal="true"
          aria-label="WebDAV 云同步"
        >
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800">
            <div className="border-b border-gray-200 bg-gradient-to-r from-sky-50 via-white to-white px-6 py-5 dark:border-gray-700 dark:from-sky-950/30 dark:via-gray-800 dark:to-gray-800">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-600 dark:text-sky-300">
                    WebDAV Sync
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-gray-900 dark:text-gray-100">
                    WebDAV 云同步
                  </h2>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                    当前版本使用单文件 `sync.json` 进行合并同步。删除操作暂不会跨端传播。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeDialog}
                  className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                  aria-label="关闭"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="space-y-5 px-6 py-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="webdav-file-url" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-200">
                    WebDAV 文件 URL
                  </label>
                  <input
                    id="webdav-file-url"
                    type="url"
                    value={draft.fileUrl}
                    onChange={(event) => setDraft((prev) => ({ ...prev, fileUrl: event.target.value }))}
                    placeholder="https://dav.example.com/remote.php/dav/files/you/MFA-Tool/sync.json"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  />
                </div>

                <div>
                  <label htmlFor="webdav-username" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-200">
                    用户名
                  </label>
                  <input
                    id="webdav-username"
                    type="text"
                    value={draft.username}
                    onChange={(event) => setDraft((prev) => ({ ...prev, username: event.target.value }))}
                    placeholder="your-webdav-user"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  />
                </div>

                <div>
                  <label htmlFor="webdav-password" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-200">
                    密码
                  </label>
                  <input
                    id="webdav-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={passwordSaved ? "留空则使用系统钥匙串中的已保存密码" : "本次操作使用的密码"}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  />
                </div>
              </div>

              <div className="grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-300">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-gray-900 dark:text-gray-100">密码状态</span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${passwordSaved ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300" : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"}`}>
                    {passwordSaved ? "已保存到系统钥匙串" : "未保存密码"}
                  </span>
                </div>

                <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={rememberPassword}
                    onChange={(event) => setRememberPassword(event.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                  />
                  当前输入的密码同步时一起保存到系统钥匙串
                </label>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleSavePassword}
                    disabled={busyAction !== null}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    保存密码
                  </button>
                  <button
                    type="button"
                    onClick={handleClearPassword}
                    disabled={busyAction !== null || !passwordSaved}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    清除已保存密码
                  </button>
                  <button
                    type="button"
                    onClick={handleClearConfig}
                    disabled={busyAction !== null}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    清空配置
                  </button>
                </div>
              </div>

              {usingInsecureHttp && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                  当前使用的是 HTTP 明文传输。同步的是 2FA 密钥，强烈建议改用 HTTPS 的 WebDAV 地址。
                </div>
              )}

              <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900/30 dark:text-gray-300">
                <p className="font-medium text-gray-900 dark:text-gray-100">建议用法</p>
                <p className="mt-2">
                  让 WebDAV URL 指向一个具体 JSON 文件，例如 `.../MFA-Tool/sync.json`。首次同步会自动创建文件。
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-700 dark:bg-gray-900/40">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={busyAction !== null || !hasConfig}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  {busyAction === "testing" ? "测试中..." : "测试连接"}
                </button>
                <button
                  type="button"
                  onClick={handlePullAndMerge}
                  disabled={busyAction !== null || !hasConfig}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  {busyAction === "pulling" ? "拉取中..." : "拉取并合并"}
                </button>
                <button
                  type="button"
                  onClick={handlePushToCloud}
                  disabled={busyAction !== null || !hasConfig}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  {busyAction === "pushing" ? "上传中..." : "上传本地到云端"}
                </button>
                <button
                  type="button"
                  onClick={handleSyncNow}
                  disabled={busyAction !== null || !hasConfig}
                  className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-sky-400"
                >
                  {busyAction === "syncing" ? "同步中..." : "立即同步"}
                </button>
              </div>
              <button
                type="button"
                onClick={closeDialog}
                disabled={busyAction !== null}
                className="self-end rounded-lg px-3 py-2 text-sm font-medium text-gray-500 transition-colors hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-60 dark:text-gray-400 dark:hover:text-gray-200"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
