import { invoke, isTauri } from "@tauri-apps/api/core";

let calibratedEpochMs: number | null = null;
let calibratedPerfMs = 0;
let syncPromise: Promise<void> | null = null;

function getPerfNow() {
  return performance.now();
}

export function getRuntimeNowMs(): number {
  if (calibratedEpochMs === null) {
    return Date.now();
  }

  return Math.round(calibratedEpochMs + (getPerfNow() - calibratedPerfMs));
}

export async function syncRuntimeClock(): Promise<void> {
  if (!isTauri()) {
    return;
  }

  if (syncPromise) {
    return syncPromise;
  }

  syncPromise = (async () => {
    const before = getPerfNow();
    const hostNow = await invoke<number>("read_current_timestamp_ms");
    const after = getPerfNow();

    calibratedEpochMs = hostNow;
    calibratedPerfMs = (before + after) / 2;
  })().finally(() => {
    syncPromise = null;
  });

  return syncPromise;
}
