import { describe, it, expect } from "vitest";
import protobuf from "protobufjs";
import {
  bytesToBase32,
  parseMigrationUrl,
  parseOtpauthUrl,
  parseQRContent,
} from "./migration-parser";
import { ParseError } from "../types";

// ============================================================
// bytesToBase32 辅助函数测试
// ============================================================
describe("bytesToBase32", () => {
  it("空字节数组返回空字符串", () => {
    expect(bytesToBase32(new Uint8Array([]))).toBe("");
  });

  it("已知向量: 'f' → MY", () => {
    // 'f' = 0x66
    expect(bytesToBase32(new Uint8Array([0x66]))).toBe("MY");
  });

  it("已知向量: 'fo' → MZXQ", () => {
    expect(bytesToBase32(new Uint8Array([0x66, 0x6f]))).toBe("MZXQ");
  });

  it("已知向量: 'foo' → MZXW6", () => {
    expect(bytesToBase32(new Uint8Array([0x66, 0x6f, 0x6f]))).toBe("MZXW6");
  });

  it("已知向量: 'foob' → MZXW6YQ", () => {
    expect(bytesToBase32(new Uint8Array([0x66, 0x6f, 0x6f, 0x62]))).toBe(
      "MZXW6YQ"
    );
  });

  it("已知向量: 'fooba' → MZXW6YTB", () => {
    expect(
      bytesToBase32(new Uint8Array([0x66, 0x6f, 0x6f, 0x62, 0x61]))
    ).toBe("MZXW6YTB");
  });

  it("已知向量: 'foobar' → MZXW6YTBOI", () => {
    expect(
      bytesToBase32(new Uint8Array([0x66, 0x6f, 0x6f, 0x62, 0x61, 0x72]))
    ).toBe("MZXW6YTBOI");
  });
});

// ============================================================
// parseOtpauthUrl 测试
// ============================================================
describe("parseOtpauthUrl", () => {
  it("解析标准 totp URL", () => {
    const url = "otpauth://totp/GitHub:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub";
    const account = parseOtpauthUrl(url);

    expect(account.type).toBe("totp");
    expect(account.name).toBe("user@example.com");
    expect(account.issuer).toBe("GitHub");
    expect(account.secret).toBe("JBSWY3DPEHPK3PXP");
    expect(account.algorithm).toBe("SHA1");
    expect(account.digits).toBe(6);
    expect(account.period).toBe(30);
    expect(account.counter).toBe(0);
    expect(account.id).toBeTruthy();
    expect(account.createdAt).toBeGreaterThan(0);
  });

  it("解析 hotp URL 带 counter", () => {
    const url = "otpauth://hotp/Test?secret=JBSWY3DPEHPK3PXP&counter=5";
    const account = parseOtpauthUrl(url);

    expect(account.type).toBe("hotp");
    expect(account.name).toBe("Test");
    expect(account.counter).toBe(5);
  });

  it("路径中无 issuer 前缀时 name 为完整路径", () => {
    const url = "otpauth://totp/myaccount?secret=JBSWY3DPEHPK3PXP&issuer=Google";
    const account = parseOtpauthUrl(url);

    expect(account.name).toBe("myaccount");
    expect(account.issuer).toBe("Google");
  });

  it("路径中有 issuer 前缀但 URL 参数无 issuer 时从路径提取", () => {
    const url = "otpauth://totp/Google:user@gmail.com?secret=JBSWY3DPEHPK3PXP";
    const account = parseOtpauthUrl(url);

    expect(account.name).toBe("user@gmail.com");
    expect(account.issuer).toBe("Google");
  });

  it("缺少 secret 参数时抛出 ParseError", () => {
    const url = "otpauth://totp/Test?issuer=Test";
    expect(() => parseOtpauthUrl(url)).toThrow(ParseError);
    expect(() => parseOtpauthUrl(url)).toThrow("缺少必要参数 secret");
  });

  it("无效 URL 格式时抛出 ParseError", () => {
    expect(() => parseOtpauthUrl("not-a-url")).toThrow(ParseError);
  });

  it("不支持的类型时抛出 ParseError", () => {
    const url = "otpauth://unknown/Test?secret=JBSWY3DPEHPK3PXP";
    expect(() => parseOtpauthUrl(url)).toThrow(ParseError);
    expect(() => parseOtpauthUrl(url)).toThrow("不支持的类型");
  });

  it("无效 base32 secret 时抛出 ParseError", () => {
    const url = "otpauth://totp/Test?secret=invalid!!!";
    expect(() => parseOtpauthUrl(url)).toThrow(ParseError);
    expect(() => parseOtpauthUrl(url)).toThrow("secret 参数不是有效的 base32 编码");
  });

  it("自定义 digits 和 period", () => {
    const url = "otpauth://totp/Test?secret=JBSWY3DPEHPK3PXP&digits=8&period=60";
    const account = parseOtpauthUrl(url);

    expect(account.digits).toBe(8);
    expect(account.period).toBe(60);
  });
});

// ============================================================
// parseMigrationUrl 测试
// ============================================================
describe("parseMigrationUrl", () => {
  // 辅助函数：构建 migration URL
  function buildMigrationUrl(
    otpParams: Array<{
      secret?: Uint8Array;
      name?: string;
      issuer?: string;
      algorithm?: number;
      digits?: number;
      type?: number;
      counter?: number;
    }>
  ): string {
    const root = protobuf.Root.fromJSON({
      nested: {
        googleauth: {
          nested: {
            Algorithm: { values: { ALGORITHM_UNSPECIFIED: 0, SHA1: 1 } },
            DigitCount: { values: { DIGIT_COUNT_UNSPECIFIED: 0, SIX: 1, EIGHT: 2 } },
            OtpType: { values: { OTP_TYPE_UNSPECIFIED: 0, HOTP: 1, TOTP: 2 } },
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
                otpParameters: { rule: "repeated", type: "OtpParameters", id: 1 },
              },
            },
          },
        },
      },
    });

    const PayloadType = root.lookupType("googleauth.MigrationPayload");
    const payload = PayloadType.create({ otpParameters: otpParams });
    const buffer = PayloadType.encode(payload).finish();
    const base64 = btoa(String.fromCharCode(...buffer));
    return `otpauth-migration://offline?data=${encodeURIComponent(base64)}`;
  }

  it("解析包含单个 TOTP 账户的 migration URL", () => {
    const secret = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    const url = buildMigrationUrl([
      {
        secret,
        name: "user@example.com",
        issuer: "GitHub",
        algorithm: 1,
        digits: 1,
        type: 2, // TOTP
        counter: 0,
      },
    ]);

    const accounts = parseMigrationUrl(url);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].name).toBe("user@example.com");
    expect(accounts[0].issuer).toBe("GitHub");
    expect(accounts[0].type).toBe("totp");
    expect(accounts[0].secret).toBe(bytesToBase32(secret));
    expect(accounts[0].digits).toBe(6);
    expect(accounts[0].algorithm).toBe("SHA1");
    expect(accounts[0].period).toBe(30);
  });

  it("解析包含多个账户的 migration URL", () => {
    const url = buildMigrationUrl([
      {
        secret: new Uint8Array([1, 2, 3]),
        name: "account1",
        issuer: "Service1",
        type: 2,
      },
      {
        secret: new Uint8Array([4, 5, 6]),
        name: "account2",
        issuer: "Service2",
        type: 1, // HOTP
        counter: 10,
      },
    ]);

    const accounts = parseMigrationUrl(url);
    expect(accounts).toHaveLength(2);
    expect(accounts[0].name).toBe("account1");
    expect(accounts[0].type).toBe("totp");
    expect(accounts[1].name).toBe("account2");
    expect(accounts[1].type).toBe("hotp");
    expect(accounts[1].counter).toBe(10);
  });

  it("HOTP 类型映射正确 (type=1 → hotp)", () => {
    const url = buildMigrationUrl([
      { secret: new Uint8Array([1]), type: 1, counter: 42 },
    ]);
    const accounts = parseMigrationUrl(url);
    expect(accounts[0].type).toBe("hotp");
    expect(accounts[0].counter).toBe(42);
  });

  it("DigitCount EIGHT 映射为 8 位", () => {
    const url = buildMigrationUrl([
      { secret: new Uint8Array([1]), digits: 2 },
    ]);
    const accounts = parseMigrationUrl(url);
    expect(accounts[0].digits).toBe(8);
  });

  it("缺少 data 参数时抛出 ParseError", () => {
    expect(() => parseMigrationUrl("otpauth-migration://offline")).toThrow(
      ParseError
    );
    expect(() => parseMigrationUrl("otpauth-migration://offline")).toThrow(
      "缺少 data 参数"
    );
  });

  it("无效 base64 data 时抛出 ParseError", () => {
    expect(() =>
      parseMigrationUrl("otpauth-migration://offline?data=!!!invalid!!!")
    ).toThrow(ParseError);
  });

  it("无效 URL 格式时抛出 ParseError", () => {
    expect(() => parseMigrationUrl("not a url at all")).toThrow(ParseError);
  });

  it("空 payload 返回空数组", () => {
    const url = buildMigrationUrl([]);
    const accounts = parseMigrationUrl(url);
    expect(accounts).toHaveLength(0);
  });

  it("每个账户都有唯一 id 和 createdAt", () => {
    const url = buildMigrationUrl([
      { secret: new Uint8Array([1]), name: "a" },
      { secret: new Uint8Array([2]), name: "b" },
    ]);
    const accounts = parseMigrationUrl(url);
    expect(accounts[0].id).toBeTruthy();
    expect(accounts[1].id).toBeTruthy();
    expect(accounts[0].id).not.toBe(accounts[1].id);
    expect(accounts[0].createdAt).toBeGreaterThan(0);
  });
});

// ============================================================
// parseQRContent 测试
// ============================================================
describe("parseQRContent", () => {
  it("识别 otpauth:// URL 并返回单元素数组", () => {
    const content = "otpauth://totp/Test?secret=JBSWY3DPEHPK3PXP&issuer=Test";
    const accounts = parseQRContent(content);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].type).toBe("totp");
    expect(accounts[0].secret).toBe("JBSWY3DPEHPK3PXP");
  });

  it("识别 otpauth-migration:// URL 并解析", () => {
    // 构建一个简单的 migration URL
    const root = protobuf.Root.fromJSON({
      nested: {
        googleauth: {
          nested: {
            Algorithm: { values: { ALGORITHM_UNSPECIFIED: 0, SHA1: 1 } },
            DigitCount: { values: { DIGIT_COUNT_UNSPECIFIED: 0, SIX: 1 } },
            OtpType: { values: { OTP_TYPE_UNSPECIFIED: 0, HOTP: 1, TOTP: 2 } },
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
                otpParameters: { rule: "repeated", type: "OtpParameters", id: 1 },
              },
            },
          },
        },
      },
    });
    const PayloadType = root.lookupType("googleauth.MigrationPayload");
    const payload = PayloadType.create({
      otpParameters: [{ secret: new Uint8Array([1, 2, 3]), name: "test", type: 2 }],
    });
    const buffer = PayloadType.encode(payload).finish();
    const base64 = btoa(String.fromCharCode(...buffer));
    const content = `otpauth-migration://offline?data=${encodeURIComponent(base64)}`;

    const accounts = parseQRContent(content);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].name).toBe("test");
  });

  it("空内容抛出 ParseError", () => {
    expect(() => parseQRContent("")).toThrow(ParseError);
    expect(() => parseQRContent("  ")).toThrow(ParseError);
  });

  it("不支持的格式抛出 ParseError", () => {
    expect(() => parseQRContent("https://example.com")).toThrow(ParseError);
    expect(() => parseQRContent("https://example.com")).toThrow("不支持的二维码格式");
  });
});
