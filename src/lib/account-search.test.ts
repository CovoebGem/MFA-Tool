import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  normalizeSearchText,
  normalizeSearchQuery,
  tokenizeSearchQuery,
  buildGroupNameMap,
  matchesAccountQuery,
  filterAccountsByQuery,
} from "./account-search";
import type { Group, OTPAccount } from "../types";

function makeAccount(overrides: Partial<OTPAccount> = {}): OTPAccount {
  return {
    id: "acc-1",
    issuer: "GitHub",
    name: "alice@example.com",
    secret: "JBSWY3DPEHPK3PXP",
    type: "totp",
    counter: 0,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    createdAt: 1,
    groupId: "default",
    ...overrides,
  };
}

const sampleGroups: Group[] = [
  { id: "default", name: "默认", isDefault: true, createdAt: 0 },
  { id: "work", name: "工作", isDefault: false, createdAt: 1 },
  { id: "personal", name: "个人", isDefault: false, createdAt: 2 },
];

describe("account-search", () => {
  it("normalizes NFKC width and case", () => {
    expect(normalizeSearchText("ＧｉｔＨｕｂ")).toBe("github");
    expect(normalizeSearchQuery("  ＧｉｔＨｕｂ   工作  ")).toBe("github 工作");
    expect(tokenizeSearchQuery("   ")).toEqual([]);
    expect(tokenizeSearchQuery("  git　工作 ")).toEqual(["git", "工作"]);
  });

  it("returns original array reference for empty or whitespace queries", () => {
    const accounts = [makeAccount()];
    const groupMap = buildGroupNameMap(sampleGroups);

    expect(filterAccountsByQuery(accounts, "", groupMap)).toBe(accounts);
    expect(filterAccountsByQuery(accounts, "   \t  ", groupMap)).toBe(accounts);
  });

  it("matches issuer, name, and group name case-insensitively and across fields", () => {
    const groupMap = buildGroupNameMap(sampleGroups);
    const accounts = [
      makeAccount({ id: "1", issuer: "GitHub", name: "dev@company.com", groupId: "work" }),
      makeAccount({ id: "2", issuer: "Google", name: "alice@gmail.com", groupId: "personal" }),
      makeAccount({ id: "3", issuer: "GitHub", name: "alice@gmail.com", groupId: "personal" }),
      makeAccount({ id: "4", issuer: "GitLab", name: "ops@company.com", groupId: "missing-group" }),
    ];

    expect(filterAccountsByQuery(accounts, "git 工作", groupMap).map((a) => a.id)).toEqual(["1"]);
    expect(filterAccountsByQuery(accounts, "ＧＩＴＨＵＢ alice", groupMap).map((a) => a.id)).toEqual(["3"]);
    expect(filterAccountsByQuery(accounts, "ops", groupMap).map((a) => a.id)).toEqual(["4"]);
    expect(filterAccountsByQuery(accounts, "个人", groupMap).map((a) => a.id)).toEqual(["2", "3"]);
  });

  it("preserves accounts with identical names but distinct IDs", () => {
    const groupMap = buildGroupNameMap(sampleGroups);
    const accounts = [
      makeAccount({ id: "a", issuer: "AWS", name: "admin@corp.com", groupId: "work" }),
      makeAccount({ id: "b", issuer: "AWS", name: "admin@corp.com", groupId: "personal" }),
    ];

    expect(filterAccountsByQuery(accounts, "aws admin", groupMap).map((a) => a.id)).toEqual(["a", "b"]);
    expect(filterAccountsByQuery(accounts, "aws 个人", groupMap).map((a) => a.id)).toEqual(["b"]);
  });

  it("matches account remark including multi-token queries while excluding secret", () => {
    const groupMap = buildGroupNameMap(sampleGroups);
    const accounts = [
      makeAccount({
        id: "r1",
        issuer: "GitHub",
        name: "dev@company.com",
        remark: "生产环境 Root",
        groupId: "work",
      }),
      makeAccount({
        id: "r2",
        issuer: "GitHub",
        name: "qa@company.com",
        remark: "测试账号",
        groupId: "work",
      }),
    ];

    expect(filterAccountsByQuery(accounts, "生产", groupMap).map((a) => a.id)).toEqual(["r1"]);
    expect(filterAccountsByQuery(accounts, "git root", groupMap).map((a) => a.id)).toEqual(["r1"]);
    expect(filterAccountsByQuery(accounts, "测试", groupMap).map((a) => a.id)).toEqual(["r2"]);
    expect(filterAccountsByQuery(accounts, "JBSWY3DPEH", groupMap)).toEqual([]);
  });

  it("never matches tokens that only appear in account.secret", () => {
    const groupMap = buildGroupNameMap(sampleGroups);
    const secretOnlyAccount = makeAccount({
      id: "sec-1",
      issuer: "Cloudflare",
      name: "admin@site.org",
      secret: "GITHUBSECRETTOKEN234567",
      groupId: "work",
    });

    expect(matchesAccountQuery(secretOnlyAccount, ["github"], groupMap)).toBe(false);
    expect(filterAccountsByQuery([secretOnlyAccount], "SECRETTOKEN", groupMap)).toEqual([]);

    const base32CharArb = fc.constantFrom(..."ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".split(""));
    const secretArb = fc.array(base32CharArb, { minLength: 8, maxLength: 32 }).map((chars) => chars.join(""));

    fc.assert(
      fc.property(secretArb, (secret) => {
        const needle = secret.slice(0, 6);
        const acc = makeAccount({
          id: "prop-1",
          issuer: "Alpha",
          name: "user@example.org",
          secret,
          groupId: "default",
        });

        const visibleText = `${acc.issuer} ${acc.name} 默认`.toLowerCase();
        if (!visibleText.includes(needle.toLowerCase())) {
          expect(filterAccountsByQuery([acc], needle, groupMap)).toEqual([]);
        }
      }),
      { numRuns: 50 },
    );
  });
});
