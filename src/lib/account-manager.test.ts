import { describe, it, expect } from "vitest";
import { addAccounts, removeAccount, moveAccountsToGroup } from "./account-manager";
import type { OTPAccount } from "../types";

function makeAccount(overrides: Partial<OTPAccount> = {}): OTPAccount {
  return {
    id: crypto.randomUUID(),
    issuer: "TestIssuer",
    name: "test@example.com",
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

describe("addAccounts", () => {
  it("should append new accounts to existing list", () => {
    const existing = [makeAccount({ id: "a1" })];
    const newAccounts = [makeAccount({ id: "b1" }), makeAccount({ id: "b2" })];

    const result = addAccounts(existing, newAccounts);

    expect(result).toHaveLength(3);
    expect(result[0].id).toBe("a1");
    expect(result[1].id).toBe("b1");
    expect(result[2].id).toBe("b2");
  });

  it("should return new accounts when existing is empty", () => {
    const newAccounts = [makeAccount({ id: "c1" })];
    const result = addAccounts([], newAccounts);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("c1");
  });

  it("should return existing accounts when new accounts is empty", () => {
    const existing = [makeAccount({ id: "d1" })];
    const result = addAccounts(existing, []);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("d1");
  });

  it("should not mutate the original arrays", () => {
    const existing = [makeAccount({ id: "e1" })];
    const newAccounts = [makeAccount({ id: "e2" })];
    const existingCopy = [...existing];
    const newCopy = [...newAccounts];

    addAccounts(existing, newAccounts);

    expect(existing).toEqual(existingCopy);
    expect(newAccounts).toEqual(newCopy);
  });
});

describe("removeAccount", () => {
  it("should remove the account with matching id", () => {
    const accounts = [
      makeAccount({ id: "r1" }),
      makeAccount({ id: "r2" }),
      makeAccount({ id: "r3" }),
    ];

    const result = removeAccount(accounts, "r2");

    expect(result).toHaveLength(2);
    expect(result.map((a) => a.id)).toEqual(["r1", "r3"]);
  });

  it("should return same-length list when id not found", () => {
    const accounts = [makeAccount({ id: "s1" }), makeAccount({ id: "s2" })];
    const result = removeAccount(accounts, "nonexistent");

    expect(result).toHaveLength(2);
  });

  it("should return empty array when removing from single-item list", () => {
    const accounts = [makeAccount({ id: "t1" })];
    const result = removeAccount(accounts, "t1");

    expect(result).toHaveLength(0);
  });

  it("should return empty array when input is empty", () => {
    const result = removeAccount([], "any-id");
    expect(result).toHaveLength(0);
  });

  it("should not mutate the original array", () => {
    const accounts = [makeAccount({ id: "u1" }), makeAccount({ id: "u2" })];
    const copy = [...accounts];

    removeAccount(accounts, "u1");

    expect(accounts).toEqual(copy);
  });
});


/**
 * moveAccountsToGroup 单元测试
 * Validates: Requirements 4.1, 4.5, 4.6
 */
describe("moveAccountsToGroup", () => {
  it("should return accounts unchanged when accountIds is empty", () => {
    const accounts = [
      makeAccount({ id: "m1", groupId: "group-a" }),
      makeAccount({ id: "m2", groupId: "group-b" }),
    ];

    const result = moveAccountsToGroup(accounts, [], "group-c");

    expect(result).toHaveLength(2);
    expect(result[0].groupId).toBe("group-a");
    expect(result[1].groupId).toBe("group-b");
  });

  it("should update all accounts when all are selected", () => {
    const accounts = [
      makeAccount({ id: "n1", groupId: "old-group" }),
      makeAccount({ id: "n2", groupId: "old-group" }),
      makeAccount({ id: "n3", groupId: "other-group" }),
    ];

    const result = moveAccountsToGroup(accounts, ["n1", "n2", "n3"], "new-group");

    expect(result).toHaveLength(3);
    expect(result.every((a) => a.groupId === "new-group")).toBe(true);
  });

  it("should safely ignore non-existent IDs in accountIds", () => {
    const accounts = [
      makeAccount({ id: "p1", groupId: "group-x" }),
      makeAccount({ id: "p2", groupId: "group-y" }),
    ];

    const result = moveAccountsToGroup(
      accounts,
      ["p1", "nonexistent-1", "nonexistent-2"],
      "group-z",
    );

    expect(result).toHaveLength(2);
    expect(result[0].groupId).toBe("group-z");
    expect(result[1].groupId).toBe("group-y");
  });

  it("should keep accounts unchanged when moving to the same group", () => {
    const accounts = [
      makeAccount({ id: "q1", groupId: "same-group" }),
      makeAccount({ id: "q2", groupId: "same-group" }),
    ];

    const result = moveAccountsToGroup(accounts, ["q1", "q2"], "same-group");

    expect(result).toHaveLength(2);
    expect(result[0].groupId).toBe("same-group");
    expect(result[1].groupId).toBe("same-group");
  });

  it("should not mutate the original accounts array", () => {
    const accounts = [
      makeAccount({ id: "v1", groupId: "original" }),
      makeAccount({ id: "v2", groupId: "original" }),
    ];
    const copy = accounts.map((a) => ({ ...a }));

    moveAccountsToGroup(accounts, ["v1"], "new-group");

    expect(accounts[0].groupId).toBe(copy[0].groupId);
    expect(accounts[1].groupId).toBe(copy[1].groupId);
  });

  it("should return empty array when input accounts is empty", () => {
    const result = moveAccountsToGroup([], ["any-id"], "group-z");
    expect(result).toHaveLength(0);
  });
});
