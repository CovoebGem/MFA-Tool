import { useEffect } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { cn } from "../lib/utils";

interface ToastProps {
  message: string;
  type: "success" | "error";
  onClose: () => void;
}

export default function Toast({ message, type, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const isSuccess = type === "success";

  return (
    <div
      role="alert"
      data-toast-type={type}
      className={cn(
        "fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 rounded-xl border px-4 py-2.5 shadow-lg backdrop-blur-md",
        isSuccess
          ? "bg-success-surface border-success/30 text-success-foreground"
          : "bg-destructive-surface border-destructive/30 text-destructive-foreground",
      )}
    >
      {isSuccess ? (
        <CheckCircle2 className="size-4.5 shrink-0" aria-hidden="true" />
      ) : (
        <AlertCircle className="size-4.5 shrink-0" aria-hidden="true" />
      )}
      <span className="text-sm font-medium">{message}</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭通知"
        className={cn(
          "ml-1.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md transition-colors cursor-pointer",
          isSuccess ? "hover:bg-success/15" : "hover:bg-destructive/15",
        )}
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
