import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import protobuf from "protobufjs";
import { parseMigrationUrl, bytesToBase32 } from "./migration-parser";

/**
 * Feature: 2fa-web-tool, Property 1: Migration URL round-trip
 * Validates: Requirements 1.2, 1.3
 *
 * 对于任意有效的 OTP 参数列表（包含随机的 secret 字节、name、issuer、type 和 counter），
 * 将其序列化为 protobuf Migration_Payload，编码为 base64 构建
 * `otpauth-migration://offline?data=` URL，然后通过 `parseMigrationUrl` 解析，
 * 应得到与原始参数等价的 OTPAccount 列表（secret 为 base32 编码，其余字段一致）。
 */
describe("Property 1: Migration URL round-trip", () => {
  // 使用与 migration-parser.ts 相同的 protobuf 定义进行序列化
  const protoRoot = protobuf.Root.fromJSON({
    nested: {
      googleauth: {
        nested: {
          Algorithm: {
            values: { ALGORITHM_UNSPECIFIED: 0, SHA1: 1 },
          },
          DigitCount: {
            values: { DIGIT_COUNT_UNSPECIFIED: 0, SIX: 1, EIGHT: 2 },
          },
          OtpType: {
            values: { OTP_TYPE_UNSPECIFIED: 0, HOTP: 1, TOTP: 2 },
          },
          OtpParameters: {
            fields: {
              secret: { type: "bytes", id: 1 },
              name: { type: "string", id: 2 },
              issuer: { type: "string", id: 3 },
              algorithm: { type: "Algorithm", id: 4 },
              digits: { type: "DigitCount", id: 5 },
              type: { type: "OtpType", id: 6 },
              counter: { type: "int64", id: 7 },
            },
          },
          MigrationPayload: {
            fields: {
              otpParameters: {
                rule: "repeated",
                type: "OtpParameters",
                id: 1,
              },
            },
          },
        },
      },
    },
  });

  const MigrationPayload = protoRoot.lookupType(
    "googleauth.MigrationPayload"
  );

  /**
   * 将 protobuf payload 序列化并构建 migration URL
   */
  function buildMigrationUrl(
    params: Array<{
      secret: Uint8Array;
      name: string;
      issuer: string;
      type: number;
      counter: number;
      algorithm: number;
      digits: number;
    }>
  ): string {
    const payload = MigrationPayload.create({
      otpParameters: params,
    });
    const buffer = MigrationPayload.encode(payload).finish();
    const binaryStr = Array.from(buffer)
      .map((b) => String.fromCharCode(b))
      .join("");
    const base64Data = btoa(binaryStr);
    return `otpauth-migration://offline?data=${encodeURIComponent(base64Data)}`;
  }

  // --- fast-check 生成器 ---

  const otpParamArb = fc.record({
    secret: fc.uint8Array({ minLength: 1, maxLength: 32 }),
    name: fc
      .string({ minLength: 0, maxLength: 50 })
      .filter((s) => !s.includes("\0")),
    issuer: fc
      .string({ minLength: 0, maxLength: 50 })
      .filter((s) => !s.includes("\0")),
    type: fc.constantFrom(1, 2), // 1=HOTP, 2=TOTP
    counter: fc.integer({ min: 0, max: 1000000 }),
    algorithm: fc.constant(1), // SHA1
    digits: fc.constantFrom(0, 1, 2), // UNSPECIFIED, SIX, EIGHT
  });

  const otpParamsListArb = fc.array(otpParamArb, {
    minLength: 1,
    maxLength: 5,
  });

  // type 枚举映射：1→hotp, 2→totp
  function expectedType(typeValue: number): "totp" | "hotp" {
    return typeValue === 1 ? "hotp" : "totp";
  }

  // digits 枚举映射：0→6, 1→6, 2→8
  function expectedDigits(digitValue: number): number {
    return digitValue === 2 ? 8 : 6;
  }

  it("should round-trip arbitrary OTP params through protobuf serialization and parseMigrationUrl", () => {
    fc.assert(
      fc.property(otpParamsListArb, (params) => {
        const url = buildMigrationUrl(params);
        const accounts = parseMigrationUrl(url);

        // 解析出的账户数量应与原始参数数量一致
        expect(accounts).toHaveLength(params.length);

        for (let i = 0; i < params.length; i++) {
          const original = params[i];
          const parsed = accounts[i];

          // secret 应为原始字节的 base32 编码
          expect(parsed.secret).toBe(bytesToBase32(original.secret));

          // name、issuer 应一致
          expect(parsed.name).toBe(original.name);
          expect(parsed.issuer).toBe(original.issuer);

          // type 映射正确
          expect(parsed.type).toBe(expectedType(original.type));

          // counter 一致
          expect(parsed.counter).toBe(original.counter);

          // digits 映射正确
          expect(parsed.digits).toBe(expectedDigits(original.digits));

          // algorithm 固定为 SHA1
          expect(parsed.algorithm).toBe("SHA1");
        }
      }),
      { numRuns: 200 }
    );
  });
});
