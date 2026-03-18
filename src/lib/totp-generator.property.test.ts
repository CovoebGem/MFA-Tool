import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { generateTOTP, getRemainingSeconds } from './totp-generator';

/**
 * Feature: 2fa-web-tool, Property 7: TOTP 生成格式正确
 * Validates: Requirements 4.1
 *
 * 对于任意有效的 base32 编码密钥（长度至少 16 字符），
 * generateTOTP 生成的验证码应为恰好 6 个字符的数字字符串（仅包含 0-9）。
 */
describe('Property 7: TOTP 生成格式正确', () => {
  const base32CharArb = fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.split(''));
  const base32SecretArb = fc.array(base32CharArb, { minLength: 16, maxLength: 64 }).map(chars => chars.join(''));

  it('should generate a 6-digit numeric string for any valid base32 secret', () => {
    fc.assert(
      fc.property(base32SecretArb, (secret) => {
        const code = generateTOTP(secret);
        expect(code).toHaveLength(6);
        expect(code).toMatch(/^[0-9]{6}$/);
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * Feature: 2fa-web-tool, Property 8: 剩余秒数范围
 * Validates: Requirements 4.3
 *
 * 对于任意时间步长 period（1 到 60 之间的正整数），
 * getRemainingSeconds(period) 的返回值应在 1 到 period 之间（含两端）。
 */
describe('Property 8: 剩余秒数范围', () => {
  const periodArb = fc.integer({ min: 1, max: 60 });

  it('should return remaining seconds between 1 and period (inclusive)', () => {
    fc.assert(
      fc.property(periodArb, (period) => {
        const remaining = getRemainingSeconds(period);
        expect(remaining).toBeGreaterThanOrEqual(1);
        expect(remaining).toBeLessThanOrEqual(period);
      }),
      { numRuns: 200 },
    );
  });
});
