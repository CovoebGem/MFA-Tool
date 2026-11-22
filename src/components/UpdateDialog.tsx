import { useEffect, useMemo, useRef } from "react";
import { useOptionalI18n } from "../contexts/I18nContext";
import type { DownloadProgress, InstallPhase, UpdateSummary } from "../hooks/useAppUpdater";
import type { UpdateRoute } from "../lib/updater-client";
import { Alert, AlertDescription } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 outline-none backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="应用更新"
    >
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl">
        <div className="border-b border-border bg-warning-surface/50 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-warning-foreground">
                New Release
              </p>
              <h2 className="mt-1.5 text-lg font-semibold text-foreground">
                {restartReady ? "更新已准备完成" : "发现新版本可更新"}
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                当前版本 {update.currentVersion}，最新版本 {update.version}
              </p>
            </div>
            <Badge variant="warning">
              v{update.version}
            </Badge>
          </div>
        </div>

        <div className="flex flex-col gap-4 px-6 py-5">
          <div className="grid gap-3 rounded-xl border border-border bg-muted/40 p-4 text-sm sm:grid-cols-2">
            <div>
              <div className="text-xs text-muted-foreground">发布时间</div>
              <div className="mt-1 font-medium text-foreground">
                {formatDate(update.date, locale)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">更新方式</div>
              <div className="mt-1 font-medium text-foreground">
                {getRouteLabel(route)}
              </div>
            </div>
          </div>

          {fallbackNotice && (
            <Alert variant="warning">
              <AlertDescription className="text-sm opacity-100">{fallbackNotice}</AlertDescription>
            </Alert>
          )}

          <div>
            <div className="mb-2 text-xs font-semibold text-muted-foreground">更新说明</div>
            <div className="max-h-52 overflow-y-auto rounded-xl border border-border bg-background/60 px-4 py-3 text-sm leading-6 whitespace-pre-wrap text-foreground">
              {notes}
            </div>
          </div>

          {downloadProgress && (
            <div className="rounded-xl border border-info/30 bg-info-surface px-4 py-3 text-info-foreground">
              <div className="flex items-center justify-between gap-3 text-sm font-medium">
                <span>{getProgressTitle(installPhase, route)}</span>
                <span className="tabular-nums">
                  {progressPercent !== null ? `${progressPercent}%` : formatBytes(downloadProgress.downloadedBytes)}
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-info/20">
                <div
                  data-testid="update-progress-bar"
                  data-indeterminate={isIndeterminate ? "true" : "false"}
                  className={cn(
                    "h-full rounded-full bg-primary transition-all duration-200",
                    progressWidthClass,
                  )}
                  style={progressWidthStyle}
                />
              </div>
              <div className="mt-2 text-xs opacity-85 tabular-nums">
                已下载 {formatBytes(downloadProgress.downloadedBytes)}
                {downloadProgress.totalBytes ? ` / ${formatBytes(downloadProgress.totalBytes)}` : ""}
              </div>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription className="text-sm opacity-100">{error}</AlertDescription>
            </Alert>
          )}

          {restartReady && (
            <Alert variant="success">
              <AlertDescription className="text-sm opacity-100">
                更新包已经安装完成。点击“立即重启”后会重新启动应用并进入新版本。
              </AlertDescription>
            </Alert>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2.5 border-t border-border bg-muted/35 px-6 py-4 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={installing}
          >
            {restartReady ? "稍后重启" : "稍后提醒"}
          </Button>

          {restartReady ? (
            <Button
              onClick={onRestart}
              className="bg-success text-white hover:bg-success/90"
            >
              立即重启
            </Button>
          ) : handleExpired ? (
            <Button
              onClick={onRecheck ?? onInstall}
              disabled={installing || checking}
            >
              {checking ? "检查更新中..." : "重新检查更新"}
            </Button>
          ) : (
            <Button
              onClick={onInstall}
              disabled={installing || checking}
            >
              {checking
                ? "检查更新中..."
                : installPhase === "installing"
                  ? "校验安装中..."
                  : installing
                    ? "下载安装中..."
                    : "立即更新"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
