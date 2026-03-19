import * as OTPAuth from "otpauth";

/**
 * 为指定账户生成当前 TOTP 验证码
 * @param secret - base32 编码的密钥
 * @param period - 时间步长（默认 30 秒）
 * @param digits - 验证码位数（默认 6）
 * @returns 当前验证码字符串（左补零）
 */
export function generateTOTP(
  secret: string,
  period: number = 30,
  digits: number = 6,
  timestamp: number = Date.now(),
): string {
  const code = OTPAuth.TOTP.generate({
    algorithm: "SHA1",
    digits,
    period,
    secret: OTPAuth.Secret.fromBase32(secret),
    timestamp,
  });

  return code.padStart(digits, "0");
}

/**
 * 获取当前时间对应的 TOTP 时间窗口序号
 * @param period - 时间步长（默认 30 秒）
 * @param timestamp - 时间戳（毫秒，默认当前时间）
 * @returns 当前时间窗口序号
 */
export function getCurrentTimeStep(
  period: number = 30,
  timestamp: number = Date.now(),
): number {
  return OTPAuth.TOTP.counter({ period, timestamp });
}

/**
 * 获取当前时间窗口的剩余秒数
 * @param period - 时间步长（默认 30 秒）
 * @param timestamp - 时间戳（毫秒，默认当前时间）
 * @returns 剩余秒数（1 到 period 之间）
 */
export function getRemainingSeconds(
  period: number = 30,
  timestamp: number = Date.now(),
): number {
  return Math.max(1, Math.ceil(OTPAuth.TOTP.remaining({ period, timestamp }) / 1000));
}
