import { describe, it, expect } from 'vitest';
import { isValidBase32, validateOtpauthUrl } from './validators';

describe('isValidBase32', () => {
  it('应接受有效的大写 base32 字符串', () => {
    expect(isValidBase32('JBSWY3DPEHPK3PXP')).toBe(true);
  });

  it('应接受有效的小写 base32 字符串（忽略大小写）', () => {
    expect(isValidBase32('jbswy3dpehpk3pxp')).toBe(true);
  });

  it('应接受混合大小写的 base32 字符串', () => {
    expect(isValidBase32('JbSwY3DpEhPk3PxP')).toBe(true);
  });

  it('应拒绝空字符串', () => {
    expect(isValidBase32('')).toBe(false);
  });

  it('应拒绝包含数字 0、1、8、9 的字符串', () => {
    expect(isValidBase32('JBSWY0')).toBe(false);
    expect(isValidBase32('JBSWY1')).toBe(false);
    expect(isValidBase32('JBSWY8')).toBe(false);
    expect(isValidBase32('JBSWY9')).toBe(false);
  });

  it('应拒绝包含特殊字符的字符串', () => {
    expect(isValidBase32('JBSWY3DP=')).toBe(false);
    expect(isValidBase32('JBSWY+3DP')).toBe(false);
    expect(isValidBase32('JBSWY 3DP')).toBe(false);
  });

  it('应接受仅包含字母的 base32 字符串', () => {
    expect(isValidBase32('ABCDEFGHIJKLMNOPQRSTUVWXYZ')).toBe(true);
  });

  it('应接受仅包含有效数字的 base32 字符串', () => {
    expect(isValidBase32('234567')).toBe(true);
  });
});

describe('validateOtpauthUrl', () => {
  it('应接受有效的 totp URL', () => {
    const result = validateOtpauthUrl('otpauth://totp/Example:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('应接受有效的 hotp URL', () => {
    const result = validateOtpauthUrl('otpauth://hotp/Example:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example&counter=0');
    expect(result.valid).toBe(true);
  });

  it('应拒绝空字符串', () => {
    const result = validateOtpauthUrl('');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('URL 不能为空');
  });

  it('应拒绝非 otpauth:// 开头的 URL', () => {
    const result = validateOtpauthUrl('https://example.com');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('URL 必须以 otpauth:// 开头');
  });

  it('应拒绝不支持的类型', () => {
    const result = validateOtpauthUrl('otpauth://unknown/name?secret=JBSWY3DPEHPK3PXP');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('不支持的类型');
  });

  it('应拒绝缺少 secret 参数的 URL', () => {
    const result = validateOtpauthUrl('otpauth://totp/Example:user@example.com?issuer=Example');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('缺少必要参数 secret');
  });

  it('应拒绝 secret 为无效 base32 的 URL', () => {
    const result = validateOtpauthUrl('otpauth://totp/Example:user@example.com?secret=INVALID!!&issuer=Example');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('secret 参数不是有效的 base32 编码');
  });

  it('应接受仅有 secret 参数的最简 URL', () => {
    const result = validateOtpauthUrl('otpauth://totp/name?secret=JBSWY3DPEHPK3PXP');
    expect(result.valid).toBe(true);
  });
});
