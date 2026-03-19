import { useState, useEffect, useRef } from "react";
import {
  generateTOTP,
  getCurrentTimeStep,
  getRemainingSeconds,
} from "../lib/totp-generator";

function getMillisecondsUntilNextSecond(timestamp: number = Date.now()): number {
  const remainder = timestamp % 1000;
  return remainder === 0 ? 1000 : 1000 - remainder;
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
  const initialTimestamp = Date.now();
  const [code, setCode] = useState(() =>
    secret ? generateTOTP(secret, period, digits, initialTimestamp) : "",
  );
  const [remaining, setRemaining] = useState(() =>
    getRemainingSeconds(period, initialTimestamp),
  );
  const timeStepRef = useRef<number | null>(
    secret ? getCurrentTimeStep(period, initialTimestamp) : null,
  );

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const clearScheduledSync = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const sync = (timestamp: number = Date.now()) => {
      setRemaining(getRemainingSeconds(period, timestamp));

      if (!secret) {
        timeStepRef.current = null;
        setCode("");
        return;
      }

      const nextStep = getCurrentTimeStep(period, timestamp);
      if (timeStepRef.current !== nextStep) {
        timeStepRef.current = nextStep;
        setCode(generateTOTP(secret, period, digits, timestamp));
      }
    };

    const scheduleNextSync = () => {
      clearScheduledSync();
      timeoutId = setTimeout(() => {
        sync(Date.now());
        scheduleNextSync();
      }, getMillisecondsUntilNextSecond());
    };

    const resyncAndSchedule = () => {
      if (document.visibilityState === "hidden") {
        clearScheduledSync();
        return;
      }

      sync(Date.now());
      scheduleNextSync();
    };

    timeStepRef.current = null;
    resyncAndSchedule();

    window.addEventListener("focus", resyncAndSchedule);
    document.addEventListener("visibilitychange", resyncAndSchedule);

    return () => {
      clearScheduledSync();
      window.removeEventListener("focus", resyncAndSchedule);
      document.removeEventListener("visibilitychange", resyncAndSchedule);
    };
  }, [secret, period, digits]);

  return { code, remaining };
}
