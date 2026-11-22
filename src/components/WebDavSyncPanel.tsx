import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, CheckCircle2, Cloud, KeyRound, ShieldAlert } from "lucide-react";
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
import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from "./ui/frame";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";

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
  onApplyData?: (accounts: OTPAccount[], groups: Group[]) => Promise<void>;
  onMergeRemoteData?: (
    remoteAccounts: OTPAccount[],
    remoteGroups: Group[],
  ) => Promise<{ accounts: OTPAccount[]; groups: Group[] }>;
  onGetLatestSnapshot?: () => Promise<{ accounts: OTPAccount[]; groups: Group[] }>;
  onToast: (message: string, type: "success" | "error") => void;
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

function getStatusMeta(state: ConnectionState, hasConfig: boolean): {
  label: string;
  variant: "success" | "destructive" | "secondary";
} {
  if (state === "connected") {
    return { label: "已连接", variant: "success" };
  }

  if (state === "failed") {
    return { label: "连接失败", variant: "destructive" };
  }

  return {
    label: hasConfig ? "未测试" : "未连接",
    variant: "secondary",
  };
}

export default function WebDavSyncPanel({
  accounts,
  groups,
  onApplyData,
  onMergeRemoteData,
  onGetLatestSnapshot,
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
      if (onMergeRemoteData) {
        await onMergeRemoteData(remoteData.accounts, remoteData.groups);
      } else if (onApplyData) {
        const merged = mergeWebDavSyncData(accounts, groups, remoteData.accounts, remoteData.groups);
        await onApplyData(merged.accounts, merged.groups);
      }
      onToast("已从云端拉取并合并数据", "success");
    });
  };

  const handlePushToCloud = async () => {
    await runSyncAction("pushing", async ({ fileUrl, username, password: nextPassword }) => {
      const snapshot = onGetLatestSnapshot ? await onGetLatestSnapshot() : { accounts, groups };
      const json = await exportToJSON(snapshot.accounts, snapshot.groups);
      await writeWebDavSync(fileUrl, username, json, nextPassword);
      onToast("已把当前本地数据上传到云端", "success");
    });
  };

  const handleSyncNow = async () => {
    await runSyncAction("syncing", async ({ fileUrl, username, password: nextPassword }) => {
      const remoteJson = await readWebDavSync(fileUrl, username, nextPassword);
      let committed: { accounts: OTPAccount[]; groups: Group[] };

      if (remoteJson) {
        const remoteData = parseBackupJSON(remoteJson);
        if (onMergeRemoteData) {
          committed = await onMergeRemoteData(remoteData.accounts, remoteData.groups);
        } else {
          committed = mergeWebDavSyncData(accounts, groups, remoteData.accounts, remoteData.groups);
          await onApplyData?.(committed.accounts, committed.groups);
        }
      } else {
        committed = onGetLatestSnapshot ? await onGetLatestSnapshot() : { accounts, groups };
      }

      const uploadJson = await exportToJSON(committed.accounts, committed.groups);
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
    <div className="flex flex-col gap-6 px-6 py-5">
      <Frame>
        <FrameHeader>
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <Cloud className="size-4 text-primary" aria-hidden="true" />
              <FrameTitle className="text-base">WebDAV 配置</FrameTitle>
              <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
              {passwordSaved && (
                <Badge variant="info">
                  <KeyRound className="size-3" aria-hidden="true" />
                  已保存密码
                </Badge>
              )}
            </div>
            <FrameDescription>
              地址填服务根路径，路径填同步目录或具体 JSON 文件名。目录模式下会自动补 sync.json。
            </FrameDescription>
          </div>
          {resolvedFileUrl && (
            <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground md:max-w-sm">
              <span className="font-medium text-foreground">目标文件：</span>
              <span className="break-all font-mono">{resolvedFileUrl}</span>
            </div>
          )}
        </FrameHeader>

        <FramePanel className="flex flex-col gap-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="webdav-base-url" className="mb-1.5 block text-xs font-medium text-foreground">
                WebDAV 地址
              </label>
              <Input
                id="webdav-base-url"
                type="url"
                value={draft.baseUrl}
                onChange={(event) => updateDraft((prev) => ({ ...prev, baseUrl: event.target.value }))}
                placeholder="https://dav.example.com/remote.php/dav/files/you"
              />
            </div>

            <div>
              <label htmlFor="webdav-path" className="mb-1.5 block text-xs font-medium text-foreground">
                WebDAV 路径
              </label>
              <Input
                id="webdav-path"
                type="text"
                value={draft.path}
                onChange={(event) => updateDraft((prev) => ({ ...prev, path: event.target.value }))}
                placeholder="/MFA-Tool/"
                className="font-mono"
              />
            </div>

            <div>
              <label htmlFor="webdav-username" className="mb-1.5 block text-xs font-medium text-foreground">
                用户名
              </label>
              <Input
                id="webdav-username"
                type="text"
                value={draft.username}
                onChange={(event) => updateDraft((prev) => ({ ...prev, username: event.target.value }))}
                placeholder="admin"
              />
            </div>

            <div>
              <label htmlFor="webdav-password" className="mb-1.5 block text-xs font-medium text-foreground">
                密码
              </label>
              <Input
                id="webdav-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={passwordSaved ? "留空时使用系统钥匙串中的已保存密码" : "输入本次操作要用的密码"}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-border/70 pt-4 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-0.5">
              <p>保存配置时，如果密码输入框有内容，会一起写入系统钥匙串。</p>
              <p>不想改密码时可以留空，后续同步会继续使用已保存的密码。</p>
            </div>
            <div className="flex flex-wrap justify-end gap-2 shrink-0">
              <Button
                variant="outline"
                onClick={handleTestConnection}
                disabled={busyAction !== null}
              >
                {busyAction === "testing" ? "测试中..." : "测试连接"}
              </Button>
              <Button
                onClick={handleSaveConfig}
                disabled={busyAction !== null}
              >
                {busyAction === "saving" ? "保存中..." : "保存配置"}
              </Button>
            </div>
          </div>
        </FramePanel>
      </Frame>

      <Frame>
        <FrameHeader>
          <div>
            <FrameTitle className="text-base">同步操作</FrameTitle>
            <FrameDescription>
              建议第一次先测试连接，再执行同步。当前删除不会跨端传播。
            </FrameDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearSavedPassword}
              disabled={busyAction !== null || !passwordSaved}
            >
              清除已保存密码
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearConfig}
              disabled={busyAction !== null}
            >
              清空配置
            </Button>
          </div>
        </FrameHeader>

        <FramePanel className="flex flex-col gap-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Button
              variant="soft"
              onClick={handleSyncNow}
              disabled={busyAction !== null || !hasConfig}
              className="h-11 justify-center text-sm font-semibold"
            >
              <ArrowLeftRight className="size-4" aria-hidden="true" />
              {busyAction === "syncing" ? "同步中..." : "立即同步"}
            </Button>

            <Button
              variant="outline"
              onClick={handlePullAndMerge}
              disabled={busyAction !== null || !hasConfig}
              className="h-11 justify-center text-sm font-semibold"
            >
              <ArrowDownToLine className="size-4" aria-hidden="true" />
              {busyAction === "pulling" ? "拉取中..." : "拉取并合并"}
            </Button>

            <Button
              variant="outline"
              onClick={handlePushToCloud}
              disabled={busyAction !== null || !hasConfig}
              className="h-11 justify-center text-sm font-semibold"
            >
              <ArrowUpFromLine className="size-4" aria-hidden="true" />
              {busyAction === "pushing" ? "上传中..." : "上传本地数据"}
            </Button>
          </div>

          <Alert>
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <AlertTitle className="text-xs">当前同步策略</AlertTitle>
              <AlertDescription className="mt-0.5">
                先读取云端，再按最近更新时间合并，最后把合并结果回写到本地和云端。
              </AlertDescription>
            </div>
          </Alert>

          {usingInsecureHttp && (
            <Alert variant="warning">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <div>
                <AlertTitle className="flex items-center gap-1.5 text-xs">
                  <AlertTriangle className="size-3.5" aria-hidden="true" />
                  明文传输提醒
                </AlertTitle>
                <AlertDescription className="mt-0.5">
                  当前使用的是 HTTP 明文传输。同步的是 2FA 密钥，建议改成 HTTPS 后再长期使用。
                </AlertDescription>
              </div>
            </Alert>
          )}
        </FramePanel>
      </Frame>
    </div>
  );
}
