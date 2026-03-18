import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { buildOtpauthUrl } from "./otpauth-url";
import { parseOtpauthUrl } from "./migration-parser";
import type { OTPAccount } from "../types";

/**
 * Feature: 2fa-web-tool, Property 2: otpauth URL round-trip
 * Validates: Requirements 2.2, 6.1, 6.2
 *
 * 对于任意有效的 OTPAccount（随机 issuer、name、base32 secret、type），
 * 通过 buildOtpauthUrl 生成 otpauth:// URL，再通过 parseOtpauthUrl 解析回来，
 * 应得到与原始账户等价的 OTPAccount（issuer、name、secret、type、counter 字段一致）。
 */
describe("Property 2: otpauth URL round-trip", () => {
  // --- fast-check 生成器 ---

  const base32CharArb = fc.constantFrom(
    ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".split("")
  );
  const base32SecretArb = fc
    .array(base32CharArb, { minLength: 16, maxLength: 32 })
    .map((chars) => chars.join(""));

  // issuer 和 name 避免包含 ':' 和 '/' 等影响 URL 解析的特殊字符
  const safeCharArb = fc.constantFrom(
    ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split(
      ""
    )
  );
  const safeStringArb = fc
    .array(safeCharArb, { minLength: 1, maxLength: 20 })
    .map((chars) => chars.join(""));

  const otpAccountArb: fc.Arbitrary<OTPAccount> = fc.record({
    id: fc.uuid(),
    issuer: safeStringArb,
    name: safeStringArb,
    secret: base32SecretArb,
    type: fc.constantFrom("totp" as const, "hotp" as const),
    counter: fc.integer({ min: 0, max: 1000000 }),
    algorithm: fc.constant("SHA1" as const),
    digits: fc.constant(6),
    period: fc.constant(30),
    createdAt: fc.integer({ min: 0, max: Date.now() }),
    groupId: fc.string({ minLength: 1, maxLength: 20 }),
  });

  it("should round-trip arbitrary OTPAccount through buildOtpauthUrl and parseOtpauthUrl", () => {
    fc.assert(
      fc.property(otpAccountArb, (account) => {
        const url = buildOtpauthUrl(account);
        const parsed = parseOtpauthUrl(url);

        // issuer 一致
        expect(parsed.issuer).toBe(account.issuer);

        // name 一致
        expect(parsed.name).toBe(account.name);

        // secret 一致（大写）
        expect(parsed.secret).toBe(account.secret.toUpperCase());

        // type 一致
        expect(parsed.type).toBe(account.type);

        // counter 一致（仅 hotp 类型，totp 不在 URL 中包含 counter）
        if (account.type === "hotp") {
          expect(parsed.counter).toBe(account.counter);
        }
      }),
      { numRuns: 200 }
    );
  });
});
