import type { OTPAccount } from "../types";

/**
 * 为 OTP 账户生成标准 otpauth:// URL
 * @param account - OTP 账户
 * @returns otpauth:// URL 字符串
 */
export function buildOtpauthUrl(account: OTPAccount): string {
  const encodedIssuer = encodeURIComponent(account.issuer);
  const encodedName = encodeURIComponent(account.name);

  // 构建 label 部分: issuer:name
  const label = account.issuer
    ? `${encodedIssuer}:${encodedName}`
    : encodedName;

  let url = `otpauth://${account.type}/${label}?secret=${account.secret}&issuer=${encodedIssuer}`;

  // HOTP 类型额外添加 counter 参数
  if (account.type === "hotp") {
    url += `&counter=${account.counter}`;
  }

  return url;
}
