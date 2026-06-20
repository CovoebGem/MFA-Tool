import UpdateDialog from "./UpdateDialog";
import { useAppUpdater } from "../hooks/useAppUpdater";

interface AppUpdateManagerProps {
  onToast: (message: string, type: "success" | "error") => void;
}

function UpdateIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V6.75m0 0L8.25 10.5M12 6.75l3.75 3.75M4.5 15.75v1.125A2.625 2.625 0 007.125 19.5h9.75A2.625 2.625 0 0019.5 16.875V15.75" />
    </svg>
  );
}

export default function AppUpdateManager({ onToast }: AppUpdateManagerProps) {
  const {
    supported,
    availableUpdate,
    dialogOpen,
    checking,
    installing,
    restartReady,
    downloadProgress,
    error,
    lastCheckResult,
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
      return "下载更新中...";
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
    ? "border-green-300 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-500/40 dark:bg-green-500/15 dark:text-green-200 dark:hover:bg-green-500/20"
    : availableUpdate
      ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200 dark:hover:bg-amber-500/20"
      : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600";

  return (
    <>
      <button
        type="button"
        onClick={restartReady ? restartToApplyUpdate : openUpdateDialog}
        disabled={checking || installing}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${buttonClassName}`}
      >
        <UpdateIcon className="h-4 w-4" />
        {buttonLabel}
      </button>

      {availableUpdate && (
        <UpdateDialog
          update={availableUpdate}
          open={dialogOpen}
          installing={installing}
          restartReady={restartReady}
          downloadProgress={downloadProgress}
          error={error}
          onClose={dismissUpdate}
          onInstall={installUpdate}
          onRestart={restartToApplyUpdate}
        />
      )}
    </>
  );
}
