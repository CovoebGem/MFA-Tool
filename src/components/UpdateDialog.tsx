import { useEffect, useMemo, useRef } from "react";
import { useOptionalI18n } from "../contexts/I18nContext";
import type { DownloadProgress, InstallPhase, UpdateSummary } from "../hooks/useAppUpdater";
import type { UpdateRoute } from "../lib/updater-client";

interface UpdateDialogProps {
  update: UpdateSummary;
  route?: UpdateRoute | null;
  installPhase?: InstallPhase;
  fallbackNotice?: string | null;
  open: boolean;
  checking?: boolean;
  installing: boolean;
  restartReady: boolean;
  handleExpired?: boolean;
  downloadProgress: DownloadProgress | null;
  error: string | null;
  onClose: () => void;
  onInstall: () => void;
  onRecheck?: () => void;
  onRestart: () => void;
}

function formatDate(date: string | undefined, locale: string) {
  if (!date) {
    return "未知";
  }

  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function getRouteLabel(route?: UpdateRoute | null): string {
  if (!route || route.source === "mirror") {
    return "GitHub 镜像加速 (github.cbcsec.cc)";
  }

  if (route.fallbackFromMirror) {
    return "GitHub 官方源（加速通道不可用，已自动回退）";
  }

  return "GitHub Release 官方源";
}

function getProgressTitle(installPhase: InstallPhase, route?: UpdateRoute | null): string {
  switch (installPhase) {
    case "retrying-official":
      return "正在从 GitHub 官方源重试下载";
    case "installing":
      return "正在校验签名并安装更新";
    case "ready-to-restart":
      return "更新已准备完成";
    case "downloading":
      return route?.source === "mirror"
        ? "正在通过加速通道下载更新"
        : "正在通过 GitHub 官方源下载更新";
    default:
      return "下载进度";
  }
}

function isTopmostDialog(dialogEl: HTMLElement | null): boolean {
  if (!dialogEl) {
    return false;
  }

  const dialogs = document.querySelectorAll('[role="dialog"], [aria-modal="true"]');
  return dialogs.length > 0 && dialogs[dialogs.length - 1] === dialogEl;
}

export default function UpdateDialog({
  update,
  route,
  installPhase = "idle",
  fallbackNotice,
  open,
  checking = false,
  installing,
  restartReady,
  handleExpired = false,
  downloadProgress,
  error,
  onClose,
  onInstall,
  onRecheck,
  onRestart,
}: UpdateDialogProps) {
  const { locale } = useOptionalI18n();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const currentDialog = dialogRef.current;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    if (isTopmostDialog(currentDialog)) {
      currentDialog?.focus();
    }

    return () => {
      const previous = previousFocusRef.current;
      previousFocusRef.current = null;
      const hasOtherOpenDialog = Array.from(
        document.querySelectorAll('[role="dialog"], [aria-modal="true"]'),
      ).some((el) => el !== currentDialog);

      if (
        !hasOtherOpenDialog &&
        previous &&
        document.contains(previous) &&
        typeof previous.focus === "function"
      ) {
        previous.focus();
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTopmostDialog(dialogRef.current)) {
        return;
      }

      if (event.key === "Escape") {
        if (!installing && !event.isComposing && event.keyCode !== 229) {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
        return;
      }

      if (event.key === "Tab" && dialogRef.current) {
        const focusables = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])',
          ),
        );

        if (focusables.length === 0) {
          event.preventDefault();
          dialogRef.current.focus();
          return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;

        if (event.shiftKey) {
          if (!active || active === dialogRef.current || active === first || !dialogRef.current.contains(active)) {
            event.preventDefault();
            last.focus();
          }
        } else if (!active || active === last || !dialogRef.current.contains(active)) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [installing, onClose, open]);

  const progressPercent = useMemo(() => {
    if (!downloadProgress?.totalBytes || downloadProgress.totalBytes <= 0) {
      return null;
    }

    return Math.min(
      100,
      Math.round((downloadProgress.downloadedBytes / downloadProgress.totalBytes) * 100),
    );
  }, [downloadProgress]);

  if (!open) {
    return null;
  }

  const notes = update.body?.trim() || "当前 Release 未提供更新说明。";
  const isIndeterminate = progressPercent === null && installing && installPhase !== "installing";
  const progressWidthClass = isIndeterminate ? "w-1/3 animate-pulse" : undefined;
  const progressWidthStyle = isIndeterminate
    ? undefined
    : { width: `${progressPercent ?? (installPhase === "installing" || restartReady ? 100 : 0)}%` };

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      data-app-update-dialog="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 outline-none"
      role="dialog"
      aria-modal="true"
      aria-label="应用更新"
    >
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800">
        <div className="border-b border-gray-200 bg-gradient-to-r from-amber-50 via-white to-white px-6 py-5 dark:border-gray-700 dark:from-amber-950/40 dark:via-gray-800 dark:to-gray-800">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-600 dark:text-amber-400">
                New Release
              </p>
              <h2 className="mt-2 text-xl font-semibold text-gray-900 dark:text-gray-100">
                {restartReady ? "更新已准备完成" : "发现新版本可更新"}
              </h2>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                当前版本 {update.currentVersion}，最新版本 {update.version}
              </p>
            </div>
            <span className="rounded-full border border-amber-200 bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300">
              v{update.version}
            </span>
          </div>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div className="grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-300 sm:grid-cols-2">
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">发布时间</div>
              <div className="mt-1 font-medium text-gray-900 dark:text-gray-100">
                {formatDate(update.date, locale)}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">更新方式</div>
              <div className="mt-1 font-medium text-gray-900 dark:text-gray-100">
                {getRouteLabel(route)}
              </div>
            </div>
          </div>

          {fallbackNotice && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              {fallbackNotice}
            </div>
          )}

          <div>
            <div className="mb-2 text-sm font-medium text-gray-800 dark:text-gray-100">更新说明</div>
            <div className="max-h-52 overflow-y-auto rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm leading-6 whitespace-pre-wrap text-gray-700 dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-200">
              {notes}
            </div>
          </div>

          {downloadProgress && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-500/30 dark:bg-blue-500/10">
              <div className="flex items-center justify-between gap-3 text-sm font-medium text-blue-800 dark:text-blue-200">
                <span>{getProgressTitle(installPhase, route)}</span>
                <span>
                  {progressPercent !== null ? `${progressPercent}%` : formatBytes(downloadProgress.downloadedBytes)}
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-blue-100 dark:bg-blue-950/50">
                <div
                  data-testid="update-progress-bar"
                  data-indeterminate={isIndeterminate ? "true" : "false"}
                  className={`h-full rounded-full bg-blue-500 transition-all duration-200 ${progressWidthClass ?? ""}`}
                  style={progressWidthStyle}
                />
              </div>
              <div className="mt-2 text-xs text-blue-700 dark:text-blue-200/80">
                已下载 {formatBytes(downloadProgress.downloadedBytes)}
                {downloadProgress.totalBytes ? ` / ${formatBytes(downloadProgress.totalBytes)}` : ""}
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </div>
          )}

          {restartReady && (
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300">
              更新包已经安装完成。点击“立即重启”后会重新启动应用并进入新版本。
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-700 dark:bg-gray-900/40 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={installing}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            {restartReady ? "稍后重启" : "稍后提醒"}
          </button>

          {restartReady ? (
            <button
              type="button"
              onClick={onRestart}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700"
            >
              立即重启
            </button>
          ) : handleExpired ? (
            <button
              type="button"
              onClick={onRecheck ?? onInstall}
              disabled={installing || checking}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
            >
              {checking ? "检查更新中..." : "重新检查更新"}
            </button>
          ) : (
            <button
              type="button"
              onClick={onInstall}
              disabled={installing || checking}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
            >
              {checking
                ? "检查更新中..."
                : installPhase === "installing"
                  ? "校验安装中..."
                  : installing
                    ? "下载安装中..."
                    : "立即更新"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
