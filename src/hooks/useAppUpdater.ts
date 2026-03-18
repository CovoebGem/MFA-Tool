import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update, type DownloadEvent } from "@tauri-apps/plugin-updater";

const DISMISSED_UPDATE_VERSION_KEY = "mfa-tool:dismissed-update-version";
const AUTO_CHECK_INTERVAL_MS = 60 * 60 * 1000;

export interface UpdateSummary {
  currentVersion: string;
  version: string;
  date?: string;
  body?: string;
}

export interface DownloadProgress {
  downloadedBytes: number;
  totalBytes?: number;
}

interface UseAppUpdaterOptions {
  onToast?: (message: string, type: "success" | "error") => void;
}

function getDismissedVersion() {
  try {
    return window.localStorage.getItem(DISMISSED_UPDATE_VERSION_KEY);
  } catch {
    return null;
  }
}

function saveDismissedVersion(version: string) {
  try {
    window.localStorage.setItem(DISMISSED_UPDATE_VERSION_KEY, version);
  } catch {
    // ignore storage failures, updater can still work without persisted dismissal
  }
}

function clearDismissedVersion() {
  try {
    window.localStorage.removeItem(DISMISSED_UPDATE_VERSION_KEY);
  } catch {
    // ignore storage failures
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "更新操作失败，请稍后重试";
}

function toSummary(update: Update): UpdateSummary {
  return {
    currentVersion: update.currentVersion,
    version: update.version,
    date: update.date,
    body: update.body,
  };
}

export function useAppUpdater({ onToast }: UseAppUpdaterOptions = {}) {
  const updaterRef = useRef<Update | null>(null);
  const checkingRef = useRef(false);
  const installingRef = useRef(false);
  const [availableUpdate, setAvailableUpdate] = useState<UpdateSummary | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [restartReady, setRestartReady] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastCheckResult, setLastCheckResult] = useState<"idle" | "up-to-date" | "available" | "error">("idle");

  const closeUpdater = useCallback(async () => {
    if (!updaterRef.current) {
      return;
    }

    try {
      await updaterRef.current.close();
    } catch {
      // ignore close failures from stale updater handles
    } finally {
      updaterRef.current = null;
    }
  }, []);

  const replaceUpdater = useCallback(async (nextUpdater: Update | null) => {
    const currentUpdater = updaterRef.current;

    if (currentUpdater && currentUpdater !== nextUpdater) {
      try {
        await currentUpdater.close();
      } catch {
        // ignore close failures from stale updater handles
      }
    }

    updaterRef.current = nextUpdater;
  }, []);

  const checkForUpdates = useCallback(async (options?: { manual?: boolean }) => {
    const manual = options?.manual ?? false;

    if (!isTauri() || checkingRef.current || installingRef.current) {
      return;
    }

    setChecking(true);
    setError(null);

    try {
      const update = await check();

      if (!update) {
        await replaceUpdater(null);
        setAvailableUpdate(null);
        setDialogOpen(false);
        setRestartReady(false);
        setDownloadProgress(null);
        setLastCheckResult("up-to-date");

        if (manual) {
          onToast?.("当前已经是最新版本", "success");
        }

        return;
      }

      await replaceUpdater(update);

      const summary = toSummary(update);
      setAvailableUpdate(summary);
      setRestartReady(false);
      setDownloadProgress(null);
      setLastCheckResult("available");

      if (manual || getDismissedVersion() !== update.version) {
        setDialogOpen(true);
      }
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      setLastCheckResult("error");

      if (manual) {
        onToast?.(`检查更新失败：${message}`, "error");
      }
    } finally {
      setChecking(false);
    }
  }, [onToast, replaceUpdater]);

  const dismissUpdate = useCallback(() => {
    if (availableUpdate && !restartReady) {
      saveDismissedVersion(availableUpdate.version);
    }

    setDialogOpen(false);
    setError(null);
  }, [availableUpdate, restartReady]);

  const openUpdateDialog = useCallback(() => {
    if (availableUpdate) {
      setDialogOpen(true);
      setError(null);
      return;
    }

    void checkForUpdates({ manual: true });
  }, [availableUpdate, checkForUpdates]);

  const installUpdate = useCallback(async () => {
    const update = updaterRef.current;
    if (!update || installingRef.current) {
      return;
    }

    let downloadedBytes = 0;

    setInstalling(true);
    setError(null);
    setRestartReady(false);
    setDownloadProgress({ downloadedBytes: 0 });

    try {
      await update.downloadAndInstall((event: DownloadEvent) => {
        switch (event.event) {
          case "Started":
            downloadedBytes = 0;
            setDownloadProgress({
              downloadedBytes: 0,
              totalBytes: event.data.contentLength,
            });
            break;
          case "Progress":
            downloadedBytes += event.data.chunkLength;
            setDownloadProgress((prev) => ({
              downloadedBytes,
              totalBytes: prev?.totalBytes,
            }));
            break;
          case "Finished":
            setDownloadProgress((prev) => {
              if (!prev) {
                return null;
              }

              return {
                downloadedBytes: prev.totalBytes ?? prev.downloadedBytes,
                totalBytes: prev.totalBytes,
              };
            });
            break;
        }
      });

      clearDismissedVersion();
      setRestartReady(true);
      onToast?.("更新已下载完成，重启应用后即可生效", "success");
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      onToast?.(`安装更新失败：${message}`, "error");
    } finally {
      setInstalling(false);
    }
  }, [onToast]);

  const restartToApplyUpdate = useCallback(async () => {
    try {
      await relaunch();
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      onToast?.(`自动重启失败：${message}`, "error");
    }
  }, [onToast]);

  useEffect(() => {
    checkingRef.current = checking;
  }, [checking]);

  useEffect(() => {
    installingRef.current = installing;
  }, [installing]);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    void checkForUpdates();

    const timer = window.setInterval(() => {
      void checkForUpdates();
    }, AUTO_CHECK_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
      void closeUpdater();
    };
  }, [checkForUpdates, closeUpdater]);

  return {
    supported: isTauri(),
    availableUpdate,
    dialogOpen,
    checking,
    installing,
    restartReady,
    downloadProgress,
    error,
    lastCheckResult,
    checkForUpdates,
    dismissUpdate,
    openUpdateDialog,
    installUpdate,
    restartToApplyUpdate,
  };
}
