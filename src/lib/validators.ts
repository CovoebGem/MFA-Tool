/**
 * 验证 base32 编码字符串是否有效
 * 有效字符集：A-Z, 2-7（忽略大小写）
 * 空字符串视为无效
 * @param input - 待验证的字符串
 * @returns 是否为有效的 base32 编码
 */
export function isValidBase32(input: string): boolean {
  if (!input || input.length === 0) {
    return false;
  }
  const normalized = input.toUpperCase();
  return /^[A-Z2-7]+$/.test(normalized);
}

/**
 * 验证 otpauth:// URL 格式是否有效
 * 检查项：协议前缀、type（totp/hotp）、secret 参数
 * @param url - 待验证的 URL 字符串
 * @returns 验证结果，包含是否有效和错误信息
 */
export function validateOtpauthUrl(url: string): { valid: boolean; error?: string } {
  if (!url || url.trim().length === 0) {
    return { valid: false, error: 'URL 不能为空' };
  }

  if (!url.startsWith('otpauth://')) {
    return { valid: false, error: 'URL 必须以 otpauth:// 开头' };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, error: 'URL 格式无效' };
  }

  const type = parsed.hostname || parsed.host;
  if (type !== 'totp' && type !== 'hotp') {
    return { valid: false, error: `不支持的类型 "${type}"，仅支持 totp 或 hotp` };
  }

  const secret = parsed.searchParams.get('secret');
  if (!secret) {
    return { valid: false, error: '缺少必要参数 secret' };
  }

  if (!isValidBase32(secret)) {
    return { valid: false, error: 'secret 参数不是有效的 base32 编码' };
  }

  return { valid: true };
}
