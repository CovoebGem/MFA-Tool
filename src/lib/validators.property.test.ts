import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { isValidBase32 } from './validators';

/**
 * Feature: 2fa-web-tool, Property 6: 无效 base32 拒绝
 * Validates: Requirements 2.3
 *
 * 对于任意包含非 base32 字符（即不在 A-Z、2-7 范围内的字符）的字符串，
 * isValidBase32 应返回 false。
 */
describe('Property 6: 无效 base32 拒绝', () => {
  // 非 base32 字符集：0, 1, 8, 9, 以及 A-Z/2-7 之外的任何字符
  const nonBase32Chars = '019!@#$%^&*()_+-=[]{}|;:\'",.<>?/\\`~ \t\n\r';

  /**
   * 生成包含至少一个非 base32 字符的字符串
   * 策略：生成一个随机字符串前缀 + 一个非 base32 字符 + 随机字符串后缀
   */
  const base32CharArb = fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.split(''));
  const base32StringArb = fc.array(base32CharArb, { minLength: 0, maxLength: 10 }).map((chars) => chars.join(''));

  const stringWithNonBase32Char = fc
    .tuple(
      base32StringArb,
      fc.constantFrom(...nonBase32Chars.split('')),
      base32StringArb,
    )
    .map(([prefix, invalidChar, suffix]) => prefix + invalidChar + suffix);

  it('should reject any string containing non-base32 characters', () => {
    fc.assert(
      fc.property(stringWithNonBase32Char, (input) => {
        expect(isValidBase32(input)).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * 补充：使用完全随机的 unicode 字符串（过滤掉纯 base32 有效字符串）
   * 确保更广泛的字符空间也被覆盖
   */
  it('should reject arbitrary strings that contain at least one non-base32 character', () => {
    const base32Regex = /^[A-Za-z2-7]+$/;

    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => !base32Regex.test(s)),
        (input) => {
          expect(isValidBase32(input)).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });
});
