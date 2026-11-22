import { useState, useEffect, useRef } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  generateTOTP,
  getCurrentTimeStep,
  getRemainingSeconds,
} from "../lib/totp-generator";
import { isValidDigits, isValidPeriod } from "../lib/backup";
import { getRuntimeNowMs, syncRuntimeClock } from "../lib/runtime-clock";

const CLOCK_RECALIBRATE_INTERVAL_MS = 60_000;

type ClockListener = (timestamp: number) => void;

const clockListeners = new Set<ClockListener>();
let activeClockSession: { stop: () => void } | null = null;

function getMillisecondsUntilNextSecond(timestamp: number = getRuntimeNowMs()): number {
  const remainder = timestamp % 1000;
  return remainder === 0 ? 1000 : 1000 - remainder;
}

function startSharedClockSession(): { stop: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let recalibrateIntervalId: ReturnType<typeof setInterval> | null = null;
  let unlistenWindowFocus: (() => void) | null = null;
  let disposed = false;

  const clearScheduledSync = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  const notifyAllListeners = (timestamp: number) => {
    for (const listener of clockListeners) {
      listener(timestamp);
    }
  };

  const scheduleNextSync = () => {
    clearScheduledSync();
    if (disposed || clockListeners.size === 0) {
      return;
    }
    timeoutId = setTimeout(() => {
      notifyAllListeners(getRuntimeNowMs());
      scheduleNextSync();
    }, getMillisecondsUntilNextSecond(getRuntimeNowMs()));
  };

  const resyncAndSchedule = async () => {
    if (disposed || clockListeners.size === 0) {
      return;
    }

    if (document.visibilityState === "hidden") {
      clearScheduledSync();
      return;
    }

    try {
      await syncRuntimeClock();
    } catch {
      // 宿主时钟校准失败时继续使用当前可用时钟调度
    }
    if (disposed || clockListeners.size === 0) {
      return;
    }

    notifyAllListeners(getRuntimeNowMs());
    scheduleNextSync();
  };

  void resyncAndSchedule();

  const handleWindowFocus = () => {
    void resyncAndSchedule();
  };

  const handleVisibilityChange = () => {
    void resyncAndSchedule();
  };

  window.addEventListener("focus", handleWindowFocus);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  recalibrateIntervalId = setInterval(() => {
    void resyncAndSchedule();
  }, CLOCK_RECALIBRATE_INTERVAL_MS);

  if (isTauri()) {
    void getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (focused) {
          void resyncAndSchedule();
          return;
        }

        clearScheduledSync();
      })
      .then((unlisten) => {
        if (disposed) {
          unlisten();
          return;
        }

        unlistenWindowFocus = unlisten;
      })
      .catch(() => {
        // ignore desktop focus listener setup failures and rely on DOM events
      });
  }

  return {
    stop: () => {
      disposed = true;
      clearScheduledSync();
      if (recalibrateIntervalId !== null) {
        clearInterval(recalibrateIntervalId);
        recalibrateIntervalId = null;
      }
      if (unlistenWindowFocus) {
        unlistenWindowFocus();
        unlistenWindowFocus = null;
      }
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    },
  };
}

function subscribeClock(listener: ClockListener): () => void {
  const shouldStart = clockListeners.size === 0;
  clockListeners.add(listener);
  if (shouldStart && !activeClockSession) {
    activeClockSession = startSharedClockSession();
  }

  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0 && activeClockSession) {
      activeClockSession.stop();
      activeClockSession = null;
    }
  };
}

function safeGenerateTOTP(
  secret: string,
  period: number,
  digits: number,
  hasValidParams: boolean,
  timestamp: number,
): string {
  if (!secret || !hasValidParams) {
    return "";
  }
  try {
    return generateTOTP(secret, period, digits, timestamp);
  } catch {
    return "";
  }
}

/**
 * 管理 TOTP 验证码生成和倒计时状态（全部实例共享单一引用计数时钟引擎）
 * @param secret - base32 编码的密钥
 * @param period - 时间步长（默认 30 秒）
 * @param digits - 验证码位数（默认 6）
 * @param active - 是否激活倒计时订阅（默认 true；屏幕外卡片可传入 false 暂停无效重绘）
 * @returns { code, remaining } 当前验证码和剩余秒数
 */
export function useTOTP(
  secret: string,
  period: number = 30,
  digits: number = 6,
  active: boolean = true,
): { code: string; remaining: number } {
  const hasValidParams = isValidPeriod(period) && isValidDigits(digits);
  const safePeriod = isValidPeriod(period) ? period : 30;
  const safeDigits = isValidDigits(digits) ? digits : 6;

  const initialTimestamp = getRuntimeNowMs();
  const [code, setCode] = useState(() =>
    safeGenerateTOTP(secret, safePeriod, safeDigits, hasValidParams, initialTimestamp),
  );
  const [remaining, setRemaining] = useState(() =>
    getRemainingSeconds(safePeriod, initialTimestamp),
  );
  const timeStepRef = useRef<number | null>(
    secret && hasValidParams ? getCurrentTimeStep(safePeriod, initialTimestamp) : null,
  );

  useEffect(() => {
    if (!active) {
      return;
    }

    const sync = (timestamp: number = getRuntimeNowMs()) => {
      const nextRemaining = getRemainingSeconds(safePeriod, timestamp);
      setRemaining((prev) => (prev === nextRemaining ? prev : nextRemaining));

      if (!secret || !hasValidParams) {
        timeStepRef.current = null;
        setCode((prev) => (prev === "" ? prev : ""));
        return;
      }

      const nextStep = getCurrentTimeStep(safePeriod, timestamp);
      if (timeStepRef.current !== nextStep) {
        timeStepRef.current = nextStep;
        const nextCode = safeGenerateTOTP(
          secret,
          safePeriod,
          safeDigits,
          hasValidParams,
          timestamp,
        );
        setCode((prev) => (prev === nextCode ? prev : nextCode));
      }
    };

    timeStepRef.current = null;
    sync(getRuntimeNowMs());

    return subscribeClock(sync);
  }, [secret, safePeriod, safeDigits, hasValidParams, active]);

  return { code, remaining };
}
