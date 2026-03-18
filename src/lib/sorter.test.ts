import { describe, it, expect } from "vitest";
import { sortAccounts } from "./sorter";
import type { OTPAccount } from "../types";

function makeAccount(overrides: Partial<OTPAccount> = {}): OTPAccount {
  return {
    id: crypto.randomUUID(),
    issuer: "Default",
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

describe("sortAccounts", () => {
  it("应返回新数组，不修改原数组", () => {
    const accounts = [makeAccount({ name: "B" }), makeAccount({ name: "A" })];
    const original = [...accounts];
    const result = sortAccounts(accounts, { field: "name", direction: "asc" });

    expect(result).not.toBe(accounts);
    expect(accounts).toEqual(original);
  });

  it("空列表排序返回空数组", () => {
    const result = sortAccounts([], { field: "name", direction: "asc" });
    expect(result).toEqual([]);
  });

  it("单元素列表排序返回相同元素", () => {
    const account = makeAccount({ name: "Solo" });
    const result = sortAccounts([account], { field: "name", direction: "asc" });
    expect(result).toEqual([account]);
  });

  it("按 name 升序排序", () => {
    const a = makeAccount({ name: "Alice" });
    const b = makeAccount({ name: "Bob" });
    const c = makeAccount({ name: "Charlie" });
    const result = sortAccounts([c, a, b], { field: "name", direction: "asc" });
    expect(result.map((x) => x.name)).toEqual(["Alice", "Bob", "Charlie"]);
  });

  it("按 name 降序排序", () => {
    const a = makeAccount({ name: "Alice" });
    const b = makeAccount({ name: "Bob" });
    const c = makeAccount({ name: "Charlie" });
    const result = sortAccounts([a, b, c], {
      field: "name",
      direction: "desc",
    });
    expect(result.map((x) => x.name)).toEqual(["Charlie", "Bob", "Alice"]);
  });

  it("按 issuer 升序排序", () => {
    const g = makeAccount({ issuer: "Google" });
    const a = makeAccount({ issuer: "Apple" });
    const m = makeAccount({ issuer: "Microsoft" });
    const result = sortAccounts([g, a, m], {
      field: "issuer",
      direction: "asc",
    });
    expect(result.map((x) => x.issuer)).toEqual([
      "Apple",
      "Google",
      "Microsoft",
    ]);
  });

  it("按 createdAt 升序排序", () => {
    const old = makeAccount({ createdAt: 1000 });
    const mid = makeAccount({ createdAt: 2000 });
    const recent = makeAccount({ createdAt: 3000 });
    const result = sortAccounts([recent, old, mid], {
      field: "createdAt",
      direction: "asc",
    });
    expect(result.map((x) => x.createdAt)).toEqual([1000, 2000, 3000]);
  });

  it("按 createdAt 降序排序", () => {
    const old = makeAccount({ createdAt: 1000 });
    const mid = makeAccount({ createdAt: 2000 });
    const recent = makeAccount({ createdAt: 3000 });
    const result = sortAccounts([old, mid, recent], {
      field: "createdAt",
      direction: "desc",
    });
    expect(result.map((x) => x.createdAt)).toEqual([3000, 2000, 1000]);
  });
});
