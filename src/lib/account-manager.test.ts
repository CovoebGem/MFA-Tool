import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  addAccounts,
  removeAccount,
  removeAccounts,
  updateAccount,
  moveAccountsToGroup,
  loadAccounts,
  toggleAccountPin,
  setAccountsPinned,
} from "./account-manager";
import type { OTPAccount } from "../types";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocks.invoke,
}));

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

describe("removeAccounts", () => {
  it("removes all accounts whose id is in the target collection", () => {
    const accounts = [
      makeAccount({ id: "a1" }),
      makeAccount({ id: "a2" }),
      makeAccount({ id: "a3" }),
      makeAccount({ id: "a4" }),
    ];

    const result = removeAccounts(accounts, ["a1", "a3", "missing"]);

    expect(result.map((a) => a.id)).toEqual(["a2", "a4"]);
  });

  it("keeps original order and handles empty id list", () => {
    const accounts = [makeAccount({ id: "a1" }), makeAccount({ id: "a2" })];
    expect(removeAccounts(accounts, [])).toEqual(accounts);
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

describe("loadAccounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-array JSON payloads such as {} instead of returning malformed data", async () => {
    mocks.invoke.mockResolvedValueOnce("{}");
    await expect(loadAccounts()).rejects.toThrow("账户数据格式无效");

    mocks.invoke.mockResolvedValueOnce("[]");
    await expect(loadAccounts()).resolves.toEqual([]);
  });
});

describe("toggleAccountPin", () => {
  it("pins an unpinned account, sets pinnedAt/updatedAt, and does not mutate input", () => {
    const accounts = [
      makeAccount({ id: "a1", createdAt: 100, updatedAt: 100 }),
      makeAccount({ id: "a2", createdAt: 200, updatedAt: 200 }),
    ];
    const snapshot = accounts.map((a) => ({ ...a }));

    const pinned = toggleAccountPin(accounts, "a2");

    expect(pinned).not.toBe(accounts);
    expect(accounts).toEqual(snapshot);
    expect(pinned[0]).toBe(accounts[0]);
    expect(pinned[1].pinned).toBe(true);
    expect(typeof pinned[1].pinnedAt).toBe("number");
    expect(pinned[1].updatedAt).toBeGreaterThanOrEqual(pinned[1].pinnedAt!);
  });

  it("unpins a pinned account, clears pinnedAt, and preserves pinned: false for sync", () => {
    const accounts = [
      makeAccount({ id: "a1", pinned: true, pinnedAt: 500, createdAt: 100, updatedAt: 500 }),
    ];

    const unpinned = toggleAccountPin(accounts, "a1");

    expect(unpinned[0].pinned).toBe(false);
    expect(unpinned[0].pinnedAt).toBeUndefined();
    expect("pinnedAt" in unpinned[0]).toBe(false);
    expect(unpinned[0].updatedAt).toBeGreaterThanOrEqual(500);
  });

  it("is idempotent for explicit pinned flag and ignores unknown ids", () => {
    const accounts = [
      makeAccount({ id: "a1", pinned: true, pinnedAt: 500 }),
      makeAccount({ id: "a2", pinned: false }),
    ];

    expect(toggleAccountPin(accounts, "a1", true)).toBe(accounts);
    expect(toggleAccountPin(accounts, "a2", false)).toBe(accounts);
    expect(toggleAccountPin(accounts, "missing")).toBe(accounts);
  });
});

describe("setAccountsPinned", () => {
  it("batch pins multiple unpinned accounts and preserves existing pinnedAt without mutating input", () => {
    const existingPinned = makeAccount({
      id: "a1",
      pinned: true,
      pinnedAt: 500,
      createdAt: 100,
      updatedAt: 500,
    });
    const unpinnedOne = makeAccount({ id: "a2", createdAt: 200, updatedAt: 200 });
    const unpinnedTwo = makeAccount({ id: "a3", createdAt: 300, updatedAt: 300 });
    const accounts = [existingPinned, unpinnedOne, unpinnedTwo];
    const snapshot = accounts.map((a) => ({ ...a }));

    const result = setAccountsPinned(accounts, ["a1", "a2", "a3"], true);

    expect(result).not.toBe(accounts);
    expect(accounts).toEqual(snapshot);
    expect(result[0]).toBe(existingPinned);
    expect(result[0].pinnedAt).toBe(500);
    expect(result[1].pinned).toBe(true);
    expect(typeof result[1].pinnedAt).toBe("number");
    expect(result[1].updatedAt).toBeGreaterThanOrEqual(result[1].pinnedAt!);
    expect(result[2].pinned).toBe(true);
    expect(typeof result[2].pinnedAt).toBe("number");
  });

  it("batch unpins pinned accounts, removes pinnedAt, and keeps pinned: false for sync", () => {
    const pinnedOne = makeAccount({ id: "a1", pinned: true, pinnedAt: 500, updatedAt: 500 });
    const pinnedTwo = makeAccount({ id: "a2", pinned: true, pinnedAt: 600, updatedAt: 600 });
    const untouched = makeAccount({ id: "a3", pinned: false, updatedAt: 300 });

    const result = setAccountsPinned([pinnedOne, pinnedTwo, untouched], ["a1", "a2", "a3"], false);

    expect(result[0].pinned).toBe(false);
    expect("pinnedAt" in result[0]).toBe(false);
    expect(result[0].updatedAt).toBeGreaterThanOrEqual(500);
    expect(result[1].pinned).toBe(false);
    expect("pinnedAt" in result[1]).toBe(false);
    expect(result[2]).toBe(untouched);
  });

  it("returns original array reference when id list is empty, unknown, or no state changes", () => {
    const accounts = [
      makeAccount({ id: "a1", pinned: true, pinnedAt: 500 }),
      makeAccount({ id: "a2", pinned: false }),
    ];

    expect(setAccountsPinned(accounts, [], true)).toBe(accounts);
    expect(setAccountsPinned(accounts, ["missing"], true)).toBe(accounts);
    expect(setAccountsPinned(accounts, ["a1"], true)).toBe(accounts);
    expect(setAccountsPinned(accounts, ["a2"], false)).toBe(accounts);
  });
});

describe("updateAccount", () => {
  it("adds, trims, updates, and clears remark without affecting omitted remark", () => {
    const accounts = [makeAccount({ id: "a1", updatedAt: 100 })];

    const withRemark = updateAccount(accounts, "a1", { remark: "  公司主号  " });
    expect(withRemark[0].remark).toBe("公司主号");
    expect(withRemark[0].updatedAt).toBeGreaterThanOrEqual(100);

    const editedOther = updateAccount(withRemark, "a1", { issuer: "GitHub Enterprise" });
    expect(editedOther[0].issuer).toBe("GitHub Enterprise");
    expect(editedOther[0].remark).toBe("公司主号");

    const clearedRemark = updateAccount(editedOther, "a1", { remark: "   " });
    expect(clearedRemark[0].remark).toBeUndefined();
    expect("remark" in clearedRemark[0]).toBe(false);
  });
});
