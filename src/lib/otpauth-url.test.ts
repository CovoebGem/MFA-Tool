import { describe, it, expect } from "vitest";
import { buildOtpauthUrl } from "./otpauth-url";
import type { OTPAccount } from "../types";

function makeAccount(overrides: Partial<OTPAccount> = {}): OTPAccount {
  return {
    id: "test-id",
    issuer: "GitHub",
    name: "user@example.com",
    secret: "JBSWY3DPEHPK3PXP",
    type: "totp",
    counter: 0,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    createdAt: Date.now(),
    groupId: "default",
    ...overrides,
  };
}

describe("buildOtpauthUrl", () => {
  it("should generate a valid TOTP otpauth URL", () => {
    const account = makeAccount();
    const url = buildOtpauthUrl(account);
    expect(url).toBe(
      "otpauth://totp/GitHub:user%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub"
    );
  });

  it("should generate a valid HOTP otpauth URL with counter", () => {
    const account = makeAccount({ type: "hotp", counter: 42 });
    const url = buildOtpauthUrl(account);
    expect(url).toBe(
      "otpauth://hotp/GitHub:user%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&counter=42"
    );
  });

  it("should not include counter for TOTP type", () => {
    const account = makeAccount({ type: "totp", counter: 10 });
    const url = buildOtpauthUrl(account);
    expect(url).not.toContain("counter=");
  });

  it("should URI-encode issuer with special characters", () => {
    const account = makeAccount({ issuer: "My Company & Co" });
    const url = buildOtpauthUrl(account);
    expect(url).toContain("My%20Company%20%26%20Co");
    expect(url).toContain("issuer=My%20Company%20%26%20Co");
  });

  it("should URI-encode name with special characters", () => {
    const account = makeAccount({ name: "user+test@example.com" });
    const url = buildOtpauthUrl(account);
    expect(url).toContain("user%2Btest%40example.com");
  });

  it("should handle empty issuer", () => {
    const account = makeAccount({ issuer: "" });
    const url = buildOtpauthUrl(account);
    expect(url).toBe(
      "otpauth://totp/user%40example.com?secret=JBSWY3DPEHPK3PXP&issuer="
    );
  });

  it("should include counter=0 for HOTP with zero counter", () => {
    const account = makeAccount({ type: "hotp", counter: 0 });
    const url = buildOtpauthUrl(account);
    expect(url).toContain("counter=0");
  });
});
