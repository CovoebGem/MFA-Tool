import { describe, it, expect, vi, afterEach } from "vitest";
import {
  generateTOTP,
  getCurrentTimeStep,
  getRemainingSeconds,
} from "./totp-generator";

describe("generateTOTP", () => {
  it("should generate a 6-digit numeric string", () => {
    // 使用一个已知的 base32 密钥
    const secret = "JBSWY3DPEHPK3PXP";
    const code = generateTOTP(secret);

    expect(code).toHaveLength(6);
    expect(code).toMatch(/^\d{6}$/);
  });

  it("should generate an 8-digit code when digits=8", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const code = generateTOTP(secret, 30, 8);

    expect(code).toHaveLength(8);
    expect(code).toMatch(/^\d{8}$/);
  });

  it("should pad code with leading zeros if needed", () => {
    // generateTOTP 应始终返回指定位数的字符串
    const secret = "JBSWY3DPEHPK3PXP";
    const code = generateTOTP(secret);

    // 验证长度始终为 digits 位
    expect(code.length).toBe(6);
  });

  it("should generate consistent code for same time window", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const code1 = generateTOTP(secret);
    const code2 = generateTOTP(secret);

    // 在同一时间窗口内，两次调用应返回相同的验证码
    expect(code1).toBe(code2);
  });

  it("should use SHA-1 algorithm (RFC 6238 compliance)", () => {
    // RFC 6238 测试向量：SHA1, secret = "12345678901234567890" (ASCII)
    // 对应 base32: GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ
    // 时间 59 秒 (step 0x1) → 验证码 287082
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

    // 固定时间为 59000 毫秒 (Unix epoch + 59s)
    vi.spyOn(Date, "now").mockReturnValue(59000);

    const code = generateTOTP(secret, 30, 8);
    expect(code).toBe("94287082");

    vi.restoreAllMocks();
  });

  it("should use the explicit timestamp when provided", () => {
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

    vi.spyOn(Date, "now").mockReturnValue(123456789000);

    const code = generateTOTP(secret, 30, 8, 59000);
    expect(code).toBe("94287082");
  });
});

describe("getRemainingSeconds", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return a value between 1 and period (default 30)", () => {
    const remaining = getRemainingSeconds();
    expect(remaining).toBeGreaterThanOrEqual(1);
    expect(remaining).toBeLessThanOrEqual(30);
  });

  it("should return period when at the start of a window", () => {
    // 模拟时间恰好在窗口起始点：epoch 0
    vi.spyOn(Date, "now").mockReturnValue(0);
    expect(getRemainingSeconds(30)).toBe(30);
  });

  it("should return 1 when at the end of a window", () => {
    // 模拟时间在窗口结束前 1 秒：29 秒
    vi.spyOn(Date, "now").mockReturnValue(29000);
    expect(getRemainingSeconds(30)).toBe(1);
  });

  it("should work with custom period", () => {
    vi.spyOn(Date, "now").mockReturnValue(0);
    expect(getRemainingSeconds(60)).toBe(60);

    vi.spyOn(Date, "now").mockReturnValue(45000);
    expect(getRemainingSeconds(60)).toBe(15);
  });

  it("should use the explicit timestamp when provided", () => {
    vi.spyOn(Date, "now").mockReturnValue(45000);
    expect(getRemainingSeconds(30, 0)).toBe(30);
  });
});

describe("getCurrentTimeStep", () => {
  it("should return the current time-step counter", () => {
    expect(getCurrentTimeStep(30, 59000)).toBe(1);
    expect(getCurrentTimeStep(30, 60000)).toBe(2);
  });
});
