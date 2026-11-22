import { ArrowUpCircle } from "lucide-react";
import UpdateDialog from "./UpdateDialog";
import { useAppUpdater } from "../hooks/useAppUpdater";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";

interface AppUpdateManagerProps {
  onToast: (message: string, type: "success" | "error") => void;
  variant?: "default" | "sidebar";
  collapsed?: boolean;
}

export default function AppUpdateManager({
  onToast,
  variant = "default",
  collapsed = false,
}: AppUpdateManagerProps) {
  const {
    supported,
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
    recheckUpdates,
    openUpdateDialog,
    dismissUpdate,
    installUpdate,
    restartToApplyUpdate,
  } = useAppUpdater({ onToast });

  if (!supported) {
    return null;
  }

  const buttonLabel = (() => {
    if (restartReady) {
      return "重启完成更新";
    }

    if (installing) {
      if (installPhase === "installing") {
        return "校验安装中...";
      }
      if (downloadProgress?.totalBytes && downloadProgress.totalBytes > 0) {
        const percent = Math.min(
          100,
          Math.round((downloadProgress.downloadedBytes / downloadProgress.totalBytes) * 100),
        );
        return installPhase === "retrying-official"
          ? `官方源下载中 ${percent}%`
          : `下载更新中 ${percent}%`;
      }
      return installPhase === "retrying-official" ? "官方源下载中..." : "下载更新中...";
    }

    if (checking) {
      return "检查更新中...";
    }

    if (availableUpdate) {
      return `发现新版本 ${availableUpdate.version}`;
    }

    if (lastCheckResult === "error") {
      return "重新检查更新";
    }

    return "检查更新";
  })();

  const buttonClassName = restartReady
    ? "border-success/35 bg-success-surface text-success-foreground hover:bg-success/15"
    : availableUpdate
      ? "border-warning/40 bg-warning-surface text-warning-foreground hover:bg-warning/15"
      : undefined;

  return (
    <>
      {variant === "sidebar" && collapsed ? (
        <Button
          variant="outline"
          size="icon"
          onClick={restartReady ? restartToApplyUpdate : openUpdateDialog}
          disabled={checking || installing}
          aria-label={buttonLabel}
          title={buttonLabel}
          className={cn("relative size-10 shrink-0", buttonClassName)}
        >
          <ArrowUpCircle className="size-4 shrink-0" aria-hidden="true" />
          {(availableUpdate || restartReady) && (
            <span
              className={cn(
                "absolute top-1.5 right-1.5 size-2 rounded-full",
                restartReady ? "bg-success" : "bg-warning",
              )}
              aria-hidden="true"
            />
          )}
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={restartReady ? restartToApplyUpdate : openUpdateDialog}
          disabled={checking || installing}
          title={buttonLabel}
          className={cn(
            variant === "sidebar" && "w-full justify-center",
            buttonClassName,
          )}
        >
          <ArrowUpCircle className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{buttonLabel}</span>
        </Button>
      )}

      {availableUpdate && (
        <UpdateDialog
          update={availableUpdate}
          route={route}
          installPhase={installPhase}
          fallbackNotice={fallbackNotice}
          open={dialogOpen}
          checking={checking}
          installing={installing}
          restartReady={restartReady}
          handleExpired={handleExpired}
          downloadProgress={downloadProgress}
          error={error}
          onClose={dismissUpdate}
          onInstall={installUpdate}
          onRecheck={() => {
            void recheckUpdates();
          }}
          onRestart={restartToApplyUpdate}
        />
      )}
    </>
  );
}
