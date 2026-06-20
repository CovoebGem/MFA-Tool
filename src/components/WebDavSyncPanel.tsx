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
  DEFAULT_WEBDAV_CONFIG,
  buildWebDavFileUrl,
  clearWebDavConfig,
  loadWebDavConfig,
  normalizeWebDavPath,
  saveWebDavConfig,
  type WebDavConfig,
} from "../lib/webdav-store";
import { mergeWebDavSyncData } from "../lib/webdav-sync";

type BusyAction =
  | "testing"
  | "saving"
  | "pulling"
  | "pushing"
  | "syncing"
  | "clearing-password"
  | null;

type ConnectionState = "idle" | "connected" | "failed";

interface WebDavSyncPanelProps {
  accounts: OTPAccount[];
  groups: Group[];
  onApplyData: (accounts: OTPAccount[], groups: Group[]) => Promise<void>;
  onToast: (message: string, type: "success" | "error") => void;
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  );
}

function ArrowDownTrayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  );
}

function ArrowUpTrayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
    </svg>
  );
}

function ArrowsRightLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 7.5h13.5m0 0-3-3m3 3-3 3m-12 6H19.5m0 0-3-3m3 3-3 3" />
    </svg>
  );
}

function validateConfig(draft: WebDavConfig): WebDavConfig {
  const baseUrl = draft.baseUrl.trim();
  const username = draft.username.trim();
  const path = normalizeWebDavPath(draft.path);

  if (!baseUrl) {
    throw new Error("请填写 WebDAV 地址");
  }
  if (!username) {
    throw new Error("请填写用户名");
  }

  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error("WebDAV 地址格式无效");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("WebDAV 地址仅支持 http/https");
  }
  if (parsed.username || parsed.password) {
    throw new Error("请不要把用户名或密码直接写进地址");
  }
  if (parsed.search || parsed.hash) {
    throw new Error("WebDAV 地址中不要包含查询参数或锚点");
  }

  const normalizedBaseUrl = `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;

  return {
    baseUrl: normalizedBaseUrl || parsed.origin,
    path,
    username,
  };
}

function getStatusMeta(state: ConnectionState, hasConfig: boolean) {
  if (state === "connected") {
    return {
      label: "已连接",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
    };
  }

  if (state === "failed") {
    return {
      label: "连接失败",
      className: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300",
    };
  }

  return {
    label: hasConfig ? "未测试" : "未连接",
    className: "border-gray-200 bg-white text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300",
  };
}

export default function WebDavSyncPanel({
  accounts,
  groups,
  onApplyData,
  onToast,
}: WebDavSyncPanelProps) {
  const [draft, setDraft] = useState<WebDavConfig>(() => loadWebDavConfig());
  const [password, setPassword] = useState("");
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");

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
    () => draft.baseUrl.trim().length > 0 && draft.username.trim().length > 0,
    [draft.baseUrl, draft.username],
  );

  const resolvedFileUrl = useMemo(() => {
    try {
      return buildWebDavFileUrl(validateConfig(draft));
    } catch {
      return null;
    }
  }, [draft]);

  const usingInsecureHttp = useMemo(
    () => draft.baseUrl.trim().startsWith("http://"),
    [draft.baseUrl],
  );

  const statusMeta = getStatusMeta(connectionState, hasConfig);

  const updateDraft = (updater: (prev: WebDavConfig) => WebDavConfig) => {
    setConnectionState("idle");
    setDraft(updater);
  };

  const prepareSyncRequest = () => {
    const config = validateConfig(draft);
    return {
      ...config,
      fileUrl: buildWebDavFileUrl(config),
      password: password || null,
    };
  };

  const runSyncAction = async (
    action: Exclude<BusyAction, "saving" | "clearing-password" | null>,
    handler: (request: { fileUrl: string; username: string; password: string | null }) => Promise<void>,
  ) => {
    setBusyAction(action);

    try {
      const request = prepareSyncRequest();
      await handler(request);
      setConnectionState("connected");
    } catch (err) {
      setConnectionState("failed");
      const message = err instanceof Error ? err.message : "WebDAV 同步失败";
      onToast(message, "error");
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveConfig = async () => {
    setBusyAction("saving");

    try {
      const config = validateConfig(draft);
      saveWebDavConfig(config);
      setDraft(config);

      if (password) {
        await saveWebDavPassword(password);
        setPasswordSaved(true);
        setPassword("");
        onToast("WebDAV 配置和密码已保存", "success");
      } else {
        onToast("WebDAV 配置已保存", "success");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "保存配置失败";
      onToast(message, "error");
    } finally {
      setBusyAction(null);
    }
  };

  const handleTestConnection = async () => {
    await runSyncAction("testing", async ({ fileUrl, username, password: nextPassword }) => {
      const remoteJson = await readWebDavSync(fileUrl, username, nextPassword);
      onToast(
        remoteJson ? "连接成功，云端同步文件可读" : "连接成功，云端同步文件尚未创建",
        "success",
      );
    });
  };

  const handlePullAndMerge = async () => {
    await runSyncAction("pulling", async ({ fileUrl, username, password: nextPassword }) => {
      const remoteJson = await readWebDavSync(fileUrl, username, nextPassword);
      if (!remoteJson) {
        throw new Error("云端还没有同步文件，暂时无法拉取");
      }

      const remoteData = parseBackupJSON(remoteJson);
      const merged = mergeWebDavSyncData(accounts, groups, remoteData.accounts, remoteData.groups);
      await onApplyData(merged.accounts, merged.groups);
      onToast("已从云端拉取并合并数据", "success");
    });
  };

  const handlePushToCloud = async () => {
    await runSyncAction("pushing", async ({ fileUrl, username, password: nextPassword }) => {
      const json = await exportToJSON(accounts, groups);
      await writeWebDavSync(fileUrl, username, json, nextPassword);
      onToast("已把当前本地数据上传到云端", "success");
    });
  };

  const handleSyncNow = async () => {
    await runSyncAction("syncing", async ({ fileUrl, username, password: nextPassword }) => {
      const remoteJson = await readWebDavSync(fileUrl, username, nextPassword);
      const merged = remoteJson
        ? (() => {
            const remoteData = parseBackupJSON(remoteJson);
            return mergeWebDavSyncData(accounts, groups, remoteData.accounts, remoteData.groups);
          })()
        : { accounts, groups };

      if (remoteJson) {
        await onApplyData(merged.accounts, merged.groups);
      }

      const uploadJson = await exportToJSON(merged.accounts, merged.groups);
      await writeWebDavSync(fileUrl, username, uploadJson, nextPassword);
      onToast(remoteJson ? "已完成一次双向同步" : "已创建首个云端同步文件", "success");
    });
  };

  const handleClearSavedPassword = async () => {
    setBusyAction("clearing-password");

    try {
      await clearSavedWebDavPassword();
      setPasswordSaved(false);
      setPassword("");
      onToast("已清除系统钥匙串中的 WebDAV 密码", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "清除已保存密码失败";
      onToast(message, "error");
    } finally {
      setBusyAction(null);
    }
  };

  const handleClearConfig = () => {
    clearWebDavConfig();
    setDraft(DEFAULT_WEBDAV_CONFIG);
    setPassword("");
    setConnectionState("idle");
    onToast("已清空本地 WebDAV 配置", "success");
  };

  return (
    <div className="space-y-6 px-4 py-5 md:px-6">
      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-col gap-4 border-b border-gray-200 pb-5 dark:border-gray-700 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">WebDAV 配置</h2>
              <span className={`rounded-full border px-3 py-1 text-sm font-medium ${statusMeta.className}`}>
                {statusMeta.label}
              </span>
              {passwordSaved && (
                <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
                  已保存密码
                </span>
              )}
            </div>
            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
              地址填服务根路径，路径填同步目录或具体 JSON 文件名。目录模式下会自动补 `sync.json`。
            </p>
          </div>
          {resolvedFileUrl && (
            <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300 md:max-w-md">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">
                目标文件
              </div>
              <div className="mt-2 break-all font-mono text-xs leading-6">{resolvedFileUrl}</div>
            </div>
          )}
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <div>
            <label htmlFor="webdav-base-url" className="mb-2 block text-sm font-semibold text-gray-800 dark:text-gray-100">
              WebDAV 地址
            </label>
            <input
              id="webdav-base-url"
              type="url"
              value={draft.baseUrl}
              onChange={(event) => updateDraft((prev) => ({ ...prev, baseUrl: event.target.value }))}
              placeholder="https://dav.example.com/remote.php/dav/files/you"
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4 text-lg text-gray-900 outline-none transition-colors focus:border-blue-400 focus:bg-white dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:focus:bg-gray-800"
            />
          </div>

          <div>
            <label htmlFor="webdav-path" className="mb-2 block text-sm font-semibold text-gray-800 dark:text-gray-100">
              WebDAV 路径
            </label>
            <input
              id="webdav-path"
              type="text"
              value={draft.path}
              onChange={(event) => updateDraft((prev) => ({ ...prev, path: event.target.value }))}
              placeholder="/MFA-Tool/"
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4 text-lg text-gray-900 outline-none transition-colors focus:border-blue-400 focus:bg-white dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:focus:bg-gray-800"
            />
          </div>

          <div>
            <label htmlFor="webdav-username" className="mb-2 block text-sm font-semibold text-gray-800 dark:text-gray-100">
              用户名
            </label>
            <input
              id="webdav-username"
              type="text"
              value={draft.username}
              onChange={(event) => updateDraft((prev) => ({ ...prev, username: event.target.value }))}
              placeholder="admin"
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4 text-lg text-gray-900 outline-none transition-colors focus:border-blue-400 focus:bg-white dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:focus:bg-gray-800"
            />
          </div>

          <div>
            <label htmlFor="webdav-password" className="mb-2 block text-sm font-semibold text-gray-800 dark:text-gray-100">
              密码
            </label>
            <input
              id="webdav-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={passwordSaved ? "留空时使用系统钥匙串中的已保存密码" : "输入本次操作要用的密码"}
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4 text-lg text-gray-900 outline-none transition-colors focus:border-blue-400 focus:bg-white dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:focus:bg-gray-800"
            />
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 text-sm text-gray-500 dark:text-gray-400 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p>保存配置时，如果密码输入框有内容，会一起写入系统钥匙串。</p>
            <p>不想改密码时可以留空，后续同步会继续使用已保存的密码。</p>
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={busyAction !== null}
              className="rounded-2xl bg-gray-100 px-6 py-3 text-base font-semibold text-gray-700 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
            >
              {busyAction === "testing" ? "测试中..." : "测试连接"}
            </button>
            <button
              type="button"
              onClick={handleSaveConfig}
              disabled={busyAction !== null}
              className="rounded-2xl bg-blue-500 px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busyAction === "saving" ? "保存中..." : "保存配置"}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">同步操作</h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              建议第一次先测试连接，再执行同步。当前删除不会跨端传播。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleClearSavedPassword}
              disabled={busyAction !== null || !passwordSaved}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              清除已保存密码
            </button>
            <button
              type="button"
              onClick={handleClearConfig}
              disabled={busyAction !== null}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              清空配置
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 xl:grid-cols-3">
          <button
            type="button"
            onClick={handleSyncNow}
            disabled={busyAction !== null || !hasConfig}
            className="flex items-center justify-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-left text-base font-semibold text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200 dark:hover:bg-blue-500/15"
          >
            <ArrowsRightLeftIcon className="h-5 w-5" />
            {busyAction === "syncing" ? "同步中..." : "立即同步"}
          </button>

          <button
            type="button"
            onClick={handlePullAndMerge}
            disabled={busyAction !== null || !hasConfig}
            className="flex items-center justify-center gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-4 text-left text-base font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900/30 dark:text-gray-100 dark:hover:bg-gray-700"
          >
            <ArrowDownTrayIcon className="h-5 w-5" />
            {busyAction === "pulling" ? "拉取中..." : "拉取并合并"}
          </button>

          <button
            type="button"
            onClick={handlePushToCloud}
            disabled={busyAction !== null || !hasConfig}
            className="flex items-center justify-center gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-4 text-left text-base font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900/30 dark:text-gray-100 dark:hover:bg-gray-700"
          >
            <ArrowUpTrayIcon className="h-5 w-5" />
            {busyAction === "pushing" ? "上传中..." : "上传本地数据"}
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300">
          <div className="flex items-center gap-2 font-medium text-gray-800 dark:text-gray-100">
            <CheckIcon className="h-4 w-4" />
            当前同步策略
          </div>
          <p className="mt-2 leading-6">
            先读取云端，再按最近更新时间合并，最后把合并结果回写到本地和云端。
          </p>
        </div>

        {usingInsecureHttp && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            当前使用的是 HTTP 明文传输。同步的是 2FA 密钥，建议改成 HTTPS 后再长期使用。
          </div>
        )}
      </section>
    </div>
  );
}
