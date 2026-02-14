import { useState, useEffect, useRef } from "react";
import { generateTOTP, getRemainingSeconds } from "../lib/totp-generator";

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
  const [code, setCode] = useState(() =>
    secret ? generateTOTP(secret, period, digits) : "",
  );
  const [remaining, setRemaining] = useState(() => getRemainingSeconds(period));

  const secretRef = useRef(secret);
  const periodRef = useRef(period);
  const digitsRef = useRef(digits);

  // secret/period/digits 变化时立即重新生成
  useEffect(() => {
    secretRef.current = secret;
    periodRef.current = period;
    digitsRef.current = digits;

    if (secret) {
      setCode(generateTOTP(secret, period, digits));
    } else {
      setCode("");
    }
    setRemaining(getRemainingSeconds(period));
  }, [secret, period, digits]);

  // 每秒更新倒计时，窗口到期时重新生成验证码
  useEffect(() => {
    if (!secret) return;

    const intervalId = setInterval(() => {
      const newRemaining = getRemainingSeconds(periodRef.current);
      setRemaining(newRemaining);

      // 当 remaining 等于 period 时，说明进入了新的时间窗口
      if (newRemaining === periodRef.current) {
        setCode(
          generateTOTP(
            secretRef.current,
            periodRef.current,
            digitsRef.current,
          ),
        );
      }
    }, 1000);

    return () => clearInterval(intervalId);
  }, [secret]);

  return { code, remaining };
}
