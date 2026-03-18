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
): string {
  const totp = new OTPAuth.TOTP({
    algorithm: "SHA1",
    digits,
    period,
    secret: OTPAuth.Secret.fromBase32(secret),
  });

  const code = totp.generate();
  return code.padStart(digits, "0");
}

/**
 * 获取当前时间窗口的剩余秒数
 * @param period - 时间步长（默认 30 秒）
 * @returns 剩余秒数（1 到 period 之间）
 */
export function getRemainingSeconds(period: number = 30): number {
  return period - (Math.floor(Date.now() / 1000) % period);
}
