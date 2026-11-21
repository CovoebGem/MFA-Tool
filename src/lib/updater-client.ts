import { Channel, invoke } from "@tauri-apps/api/core";

export type UpdateSource = "mirror" | "official";

export interface UpdateRoute {
  source: UpdateSource;
  fallbackFromMirror: boolean;
}

export interface CheckedAppUpdate {
  rid: number;
  currentVersion: string;
  version: string;
  date: string | null;
  body: string | null;
}

export interface CheckAppUpdateResult extends UpdateRoute {
  update: CheckedAppUpdate | null;
}

export type AppUpdateTransferEvent =
  | {
      event: "Started";
      data: UpdateRoute & {
        totalBytes: number | null;
      };
    }
  | {
      event: "Progress";
      data: UpdateRoute & {
        downloadedBytes: number;
        totalBytes: number | null;
      };
    }
  | {
      event: "Fallback";
      data: {
        from: "mirror";
        source: "official";
        fallbackFromMirror: true;
        reason: string;
      };
    }
  | {
      event: "Installing";
      data: UpdateRoute;
    };

export interface AppUpdateErrorPayload {
  stage: string;
  source: UpdateSource;
  kind: string;
  message: string;
}

export function parseAppUpdateError(
  error: unknown,
  fallbackMessage = "更新操作失败，请稍后重试",
): { kind?: string; message: string } {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  if (!raw) {
    return { message: fallbackMessage };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AppUpdateErrorPayload>;
    if (parsed && typeof parsed.message === "string" && parsed.message.trim()) {
      return {
        kind: typeof parsed.kind === "string" ? parsed.kind : undefined,
        message: parsed.message,
      };
    }
  } catch {
    // 非结构化错误字符串直接原样展示
  }

  return { message: raw };
}

export function checkAppUpdate(): Promise<CheckAppUpdateResult> {
  return invoke<CheckAppUpdateResult>("check_app_update");
}

export async function installAppUpdate(
  rid: number,
  onEvent?: (event: AppUpdateTransferEvent) => void,
): Promise<UpdateRoute> {
  const channel = new Channel<AppUpdateTransferEvent>();
  if (onEvent) {
    channel.onmessage = onEvent;
  }
  return invoke<UpdateRoute>("install_app_update", { rid, onEvent: channel });
}

export function closeAppUpdate(rid: number): Promise<void> {
  return invoke<void>("close_app_update", { rid });
}
