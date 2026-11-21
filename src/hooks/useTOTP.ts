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

function getMillisecondsUntilNextSecond(timestamp: number = getRuntimeNowMs()): number {
  const remainder = timestamp % 1000;
  return remainder === 0 ? 1000 : 1000 - remainder;
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
 * 管理 TOTP 验证码生成和倒计时状态
 * @param secret - base32 编码的密钥
 * @param period - 时间步长（默认 30 秒）
 * @param digits - 验证码位数（默认 6）
 * @returns { code, remaining } 当前验证码和剩余秒数
 */
export function useTOTP(
  secret: string,
  period: number = 30,
  digits: number = 6,
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

    const sync = (timestamp: number = getRuntimeNowMs()) => {
      setRemaining(getRemainingSeconds(safePeriod, timestamp));

      if (!secret || !hasValidParams) {
        timeStepRef.current = null;
        setCode("");
        return;
      }

      const nextStep = getCurrentTimeStep(safePeriod, timestamp);
      if (timeStepRef.current !== nextStep) {
        timeStepRef.current = nextStep;
        setCode(safeGenerateTOTP(secret, safePeriod, safeDigits, hasValidParams, timestamp));
      }
    };

    const scheduleNextSync = () => {
      clearScheduledSync();
      timeoutId = setTimeout(() => {
        sync(getRuntimeNowMs());
        scheduleNextSync();
      }, getMillisecondsUntilNextSecond(getRuntimeNowMs()));
    };

    const resyncAndSchedule = async () => {
      if (document.visibilityState === "hidden") {
        clearScheduledSync();
        return;
      }

      try {
        await syncRuntimeClock();
      } catch {
        // 宿主时钟校准失败时继续使用当前可用时钟调度
      }
      if (disposed) {
        return;
      }

      sync(getRuntimeNowMs());
      scheduleNextSync();
    };

    timeStepRef.current = null;
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

    return () => {
      disposed = true;
      clearScheduledSync();
      if (recalibrateIntervalId !== null) {
        clearInterval(recalibrateIntervalId);
      }
      if (unlistenWindowFocus) {
        unlistenWindowFocus();
      }
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [secret, safePeriod, safeDigits, hasValidParams]);

  return { code, remaining };
}