import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  checkAppUpdate,
  closeAppUpdate,
  installAppUpdate,
  parseAppUpdateError,
  type AppUpdateTransferEvent,
  type CheckedAppUpdate,
  type UpdateRoute,
} from "../lib/updater-client";

const DISMISSED_UPDATE_VERSION_KEY = "mfa-tool:dismissed-update-version";
const AUTO_CHECK_INTERVAL_MS = 60 * 60 * 1000;

export type InstallPhase =
  | "idle"
  | "downloading"
  | "retrying-official"
  | "installing"
  | "ready-to-restart"
  | "error";

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

function toSummary(update: CheckedAppUpdate): UpdateSummary {
  return {
    currentVersion: update.currentVersion,
    version: update.version,
    date: update.date ?? undefined,
    body: update.body ?? undefined,
  };
}

export function useAppUpdater({ onToast }: UseAppUpdaterOptions = {}) {
  const activeRidRef = useRef<number | null>(null);
  const checkingRef = useRef(false);
  const installingRef = useRef(false);
  const restartReadyRef = useRef(false);
  const mountedRef = useRef(true);
  const autoOpenObserverRef = useRef<MutationObserver | null>(null);
  const onToastRef = useRef(onToast);

  useEffect(() => {
    onToastRef.current = onToast;
  }, [onToast]);

  const [availableUpdate, setAvailableUpdate] = useState<UpdateSummary | null>(null);
  const [route, setRoute] = useState<UpdateRoute | null>(null);
  const [installPhase, setInstallPhase] = useState<InstallPhase>("idle");
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [restartReady, setRestartReady] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [handleExpired, setHandleExpired] = useState(false);
  const [lastCheckResult, setLastCheckResult] = useState<"idle" | "up-to-date" | "available" | "error">("idle");

  const clearPendingAutoOpenObserver = useCallback(() => {
    if (autoOpenObserverRef.current) {
      autoOpenObserverRef.current.disconnect();
      autoOpenObserverRef.current = null;
    }
  }, []);

  const scheduleAutoOpenDialog = useCallback(() => {
    const hasOtherOpenModal = () =>
      Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"]')).some(
        (el) => !el.hasAttribute("data-app-update-dialog"),
      );

    if (!hasOtherOpenModal()) {
      clearPendingAutoOpenObserver();
      setDialogOpen(true);
      return;
    }

    clearPendingAutoOpenObserver();
    if (typeof MutationObserver === "undefined" || !document.body) {
      return;
    }

    const observer = new MutationObserver(() => {
      if (!mountedRef.current) {
        clearPendingAutoOpenObserver();
        return;
      }

      if (!hasOtherOpenModal()) {
        clearPendingAutoOpenObserver();
        setDialogOpen(true);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["role", "aria-modal"],
    });
    autoOpenObserverRef.current = observer;
  }, [clearPendingAutoOpenObserver]);

  const closeRidSafely = useCallback(async (rid: number | null) => {
    if (rid === null) {
      return;
    }

    try {
      await closeAppUpdate(rid);
    } catch {
      // ignore close failures from stale handles
    }
  }, []);

  const replaceActiveRid = useCallback(
    async (nextRid: number | null) => {
      const currentRid = activeRidRef.current;
      activeRidRef.current = nextRid;

      if (currentRid !== null && currentRid !== nextRid) {
        await closeRidSafely(currentRid);
      }
    },
    [closeRidSafely],
  );

  const checkForUpdates = useCallback(
    async (options?: { manual?: boolean }) => {
      const manual = options?.manual ?? false;

      if (
        !isTauri() ||
        checkingRef.current ||
        installingRef.current ||
        restartReadyRef.current
      ) {
        return;
      }

      checkingRef.current = true;
      setChecking(true);
      setError(null);

      try {
        const result = await checkAppUpdate();

        if (!mountedRef.current || installingRef.current || restartReadyRef.current) {
          if (result.update) {
            void closeRidSafely(result.update.rid);
          }
          return;
        }

        if (!result.update) {
          clearPendingAutoOpenObserver();
          await replaceActiveRid(null);
          setAvailableUpdate(null);
          setRoute({
            source: result.source,
            fallbackFromMirror: result.fallbackFromMirror,
          });
          setFallbackNotice(null);
          setHandleExpired(false);
          setInstallPhase("idle");
          setDialogOpen(false);
          setRestartReady(false);
          setDownloadProgress(null);
          setLastCheckResult("up-to-date");

          if (manual) {
            onToastRef.current?.("当前已经是最新版本", "success");
          }

          return;
        }

        await replaceActiveRid(result.update.rid);

        const summary = toSummary(result.update);
        setAvailableUpdate(summary);
        setRoute({
          source: result.source,
          fallbackFromMirror: result.fallbackFromMirror,
        });
        setFallbackNotice(
          result.fallbackFromMirror
            ? "加速通道不可用，已自动回退 GitHub 官方源"
            : null,
        );
        setHandleExpired(false);
        setInstallPhase("idle");
        setRestartReady(false);
        setDownloadProgress(null);
        setLastCheckResult("available");

        if (manual) {
          clearPendingAutoOpenObserver();
          setDialogOpen(true);
        } else if (getDismissedVersion() !== result.update.version) {
          scheduleAutoOpenDialog();
        }
      } catch (err) {
        if (!mountedRef.current || installingRef.current || restartReadyRef.current) {
          return;
        }
        const { message } = parseAppUpdateError(err);
        setError(message);
        setLastCheckResult("error");

        if (manual) {
          onToastRef.current?.(`检查更新失败：${message}`, "error");
        }
      } finally {
        checkingRef.current = false;
        if (mountedRef.current) {
          setChecking(false);
        }
      }
    },
    [clearPendingAutoOpenObserver, closeRidSafely, replaceActiveRid, scheduleAutoOpenDialog],
  );

  const dismissUpdate = useCallback(() => {
    clearPendingAutoOpenObserver();
    if (availableUpdate && !restartReady) {
      saveDismissedVersion(availableUpdate.version);
    }

    setDialogOpen(false);
    setError(null);
  }, [availableUpdate, clearPendingAutoOpenObserver, restartReady]);

  const openUpdateDialog = useCallback(() => {
    clearPendingAutoOpenObserver();
    if (availableUpdate) {
      setDialogOpen(true);
      setError(null);
      return;
    }

    void checkForUpdates({ manual: true });
  }, [availableUpdate, checkForUpdates, clearPendingAutoOpenObserver]);

  const installUpdate = useCallback(async () => {
    if (
      checkingRef.current ||
      installingRef.current ||
      restartReadyRef.current
    ) {
      return;
    }

    const rid = activeRidRef.current;
    if (rid === null) {
      await checkForUpdates({ manual: true });
      return;
    }

    installingRef.current = true;
    setInstalling(true);
    setError(null);
    setRestartReady(false);
    setInstallPhase("downloading");
    setDownloadProgress({ downloadedBytes: 0 });

    try {
      const finalRoute = await installAppUpdate(rid, (event: AppUpdateTransferEvent) => {
        if (!mountedRef.current) {
          return;
        }

        switch (event.event) {
          case "Started":
            setRoute({
              source: event.data.source,
              fallbackFromMirror: event.data.fallbackFromMirror,
            });
            setInstallPhase(
              event.data.fallbackFromMirror && event.data.source === "official"
                ? "retrying-official"
                : "downloading",
            );
            setDownloadProgress({
              downloadedBytes: 0,
              totalBytes: event.data.totalBytes ?? undefined,
            });
            break;
          case "Progress":
            setDownloadProgress({
              downloadedBytes: event.data.downloadedBytes,
              totalBytes: event.data.totalBytes ?? undefined,
            });
            break;
          case "Fallback":
            setRoute({
              source: "official",
              fallbackFromMirror: true,
            });
            setInstallPhase("retrying-official");
            setFallbackNotice("加速通道下载中断，已自动切换 GitHub 官方源重新下载");
            setDownloadProgress({ downloadedBytes: 0 });
            break;
          case "Installing":
            setRoute({
              source: event.data.source,
              fallbackFromMirror: event.data.fallbackFromMirror,
            });
            setInstallPhase("installing");
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

      if (!mountedRef.current) {
        return;
      }

      if (activeRidRef.current === rid) {
        activeRidRef.current = null;
      }
      setHandleExpired(false);
      clearDismissedVersion();
      setRoute(finalRoute);
      restartReadyRef.current = true;
      setRestartReady(true);
      setInstallPhase("ready-to-restart");
      onToastRef.current?.("更新已下载完成，重启应用后即可生效", "success");
    } catch (err) {
      if (!mountedRef.current) {
        return;
      }

      const { kind, message } = parseAppUpdateError(err);
      if (kind === "invalid_handle") {
        if (activeRidRef.current === rid) {
          activeRidRef.current = null;
        }
        setHandleExpired(true);
      }
      setInstallPhase("error");
      setRestartReady(false);
      setError(message);
      onToastRef.current?.(`安装更新失败：${message}`, "error");
    } finally {
      installingRef.current = false;
      if (mountedRef.current) {
        setInstalling(false);
      }
    }
  }, [checkForUpdates]);

  const recheckUpdates = useCallback(async () => {
    await checkForUpdates({ manual: true });
  }, [checkForUpdates]);

  const restartToApplyUpdate = useCallback(async () => {
    try {
      await relaunch();
    } catch (err) {
      const { message } = parseAppUpdateError(err, "自动重启失败，请手动重启应用");
      setError(message);
      onToastRef.current?.(`自动重启失败：${message}`, "error");
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    if (!isTauri()) {
      return () => {
        mountedRef.current = false;
      };
    }

    void checkForUpdates();

    const timer = window.setInterval(() => {
      void checkForUpdates();
    }, AUTO_CHECK_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      clearPendingAutoOpenObserver();
      window.clearInterval(timer);
      const pendingRid = activeRidRef.current;
      activeRidRef.current = null;
      void closeRidSafely(pendingRid);
    };
  }, [checkForUpdates, clearPendingAutoOpenObserver, closeRidSafely]);

  return {
    supported: isTauri(),
    availableUpdate,
    route,
    installPhase,
    fallbackNotice,
    dialogOpen,
    checking,
    installing,
    restartReady,
    downloadProgress,
    error,
    handleExpired,
    lastCheckResult,
    checkForUpdates,
    recheckUpdates,
    dismissUpdate,
    openUpdateDialog,
    installUpdate,
    restartToApplyUpdate,
  };
}
