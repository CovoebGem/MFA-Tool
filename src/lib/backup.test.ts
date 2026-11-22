import { describe, expect, it } from "vitest";
import type { Group, OTPAccount } from "../types";
import { mergeBackupData, parseBackupJSON, sanitizeAccountNumbers, validateBackupData } from "./backup";

function createAccount(overrides: Partial<OTPAccount>): OTPAccount {
  return {
    id: "account-id",
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

function createGroup(overrides: Partial<Group>): Group {
  return {
    id: "group-id",
    name: "默认",
    isDefault: false,
    createdAt: 1,
    ...overrides,
  };
}

describe("mergeBackupData", () => {
  it("保留现有账户并只追加导入的唯一账户", () => {
    const existingGroups = [
      createGroup({ id: "default", name: "默认", isDefault: true, createdAt: 0 }),
      createGroup({ id: "github-existing", name: "GitHub" }),
    ];

    const existingAccounts = [
      createAccount({
        id: "existing-1",
        issuer: "GitHub",
        name: "alice@example.com",
        secret: "SECRET-1",
        groupId: "github-existing",
        order: 0,
      }),
    ];

    const importedGroups = [
      createGroup({ id: "default", name: "默认", isDefault: true, createdAt: 0 }),
      createGroup({ id: "github-imported", name: "GitHub" }),
      createGroup({ id: "google-imported", name: "Google" }),
    ];

    const importedAccounts = [
      createAccount({
        id: "dup-secret",
        issuer: "GitHub",
        name: "alice-backup@example.com",
        secret: "SECRET-1",
        groupId: "github-imported",
        order: 2,
      }),
      createAccount({
        id: "new-google",
        issuer: "Google",
        name: "bob@example.com",
        secret: "SECRET-2",
        groupId: "google-imported",
        order: 0,
      }),
    ];

    const merged = mergeBackupData(existingAccounts, existingGroups, importedAccounts, importedGroups);

    expect(merged.groups).toEqual([
      existingGroups[0],
      existingGroups[1],
      importedGroups[2],
    ]);
    expect(merged.accounts).toHaveLength(2);
    expect(merged.accounts[0]).toEqual(existingAccounts[0]);
    expect(merged.accounts[1]).toMatchObject({
      id: "new-google",
      issuer: "Google",
      groupId: "google-imported",
      order: 1,
    });
  });

  it("导入账户命中相同 id 或名称+服务商时应跳过，不覆盖当前数据", () => {
    const existingGroups = [
      createGroup({ id: "default", name: "默认", isDefault: true, createdAt: 0 }),
    ];
    const existingAccounts = [
      createAccount({
        id: "existing-id",
        issuer: "GitHub",
        name: "alice@example.com",
        secret: "SECRET-1",
        order: 0,
      }),
      createAccount({
        id: "existing-id-2",
        issuer: "Google",
        name: "bob@example.com",
        secret: "SECRET-2",
        order: 1,
      }),
    ];

    const importedAccounts = [
      createAccount({
        id: "existing-id",
        issuer: "GitHub",
        name: "alice-renamed@example.com",
        secret: "SECRET-NEW",
      }),
      createAccount({
        id: "new-id",
        issuer: "Google",
        name: "bob@example.com",
        secret: "SECRET-3",
      }),
    ];

    const merged = mergeBackupData(existingAccounts, existingGroups, importedAccounts, existingGroups);

    expect(merged.accounts).toEqual(existingAccounts);
    expect(merged.groups).toEqual(existingGroups);
  });

  it("拒绝 period/digits/counter 非法的备份数据", () => {
    const base = {
      version: 1,
      exportedAt: "2026-01-01T00:00:00.000Z",
      groups: [createGroup({ id: "default", name: "默认", isDefault: true })],
    };

    const badPayloads = [
      { ...base, accounts: [{ ...createAccount({}), period: 0 }] },
      { ...base, accounts: [{ ...createAccount({}), period: -30 }] },
      { ...base, accounts: [{ ...createAccount({}), period: 1e308 }] },
      { ...base, accounts: [{ ...createAccount({}), period: Number.MAX_SAFE_INTEGER }] },
      { ...base, accounts: [{ ...createAccount({}), period: { valueOf: null, toString: null } }] },
      { ...base, accounts: [{ ...createAccount({}), digits: 0 }] },
      { ...base, accounts: [{ ...createAccount({}), digits: 6.5 }] },
      { ...base, accounts: [{ ...createAccount({}), digits: 11 }] },
      { ...base, accounts: [{ ...createAccount({}), counter: -1 }] },
      { ...base, accounts: [{ ...createAccount({}), counter: 1e308 }] },
    ];

    for (const payload of badPayloads) {
      expect(validateBackupData(payload)).toBe(false);
      expect(() => parseBackupJSON(JSON.stringify(payload))).toThrow("无效的备份文件格式");
    }

    const validJson = JSON.stringify({
      ...base,
      accounts: [createAccount({ period: 30, digits: 6, counter: 0 })],
    });
    expect(parseBackupJSON(validJson).accounts).toHaveLength(1);
  });

  it("校验 pinned/pinnedAt 字段合法性并在导入合并时保留置顶状态", () => {
    const base = {
      version: 1,
      exportedAt: "2026-01-01T00:00:00.000Z",
      groups: [createGroup({ id: "default", name: "默认", isDefault: true })],
    };

    const badPayloads = [
      { ...base, accounts: [{ ...createAccount({}), pinned: "yes" }] },
      { ...base, accounts: [{ ...createAccount({}), pinned: 1 }] },
      { ...base, accounts: [{ ...createAccount({}), pinnedAt: -1 }] },
      { ...base, accounts: [{ ...createAccount({}), pinnedAt: 1.5 }] },
      { ...base, accounts: [{ ...createAccount({}), pinnedAt: 1e308 }] },
    ];

    for (const payload of badPayloads) {
      expect(validateBackupData(payload)).toBe(false);
    }

    const validPinned = {
      ...base,
      accounts: [createAccount({ id: "p1", pinned: true, pinnedAt: 123456 })],
    };
    expect(validateBackupData(validPinned)).toBe(true);

    const existing = [
      createAccount({ id: "ex-1", secret: "SECRET-EX", pinned: true, pinnedAt: 500 }),
    ];
    const imported = [
      createAccount({ id: "imp-1", name: "imp@example.com", secret: "SECRET-IMP", pinned: true, pinnedAt: 900 }),
    ];
    const merged = mergeBackupData(existing, base.groups, imported, base.groups);
    expect(merged.accounts).toEqual([
      expect.objectContaining({ id: "ex-1", pinned: true, pinnedAt: 500 }),
      expect.objectContaining({ id: "imp-1", pinned: true, pinnedAt: 900 }),
    ]);
  });

  it("校验 remark 字段并在 sanitizeAccountNumbers 中清洗空白备注", () => {
    const base = {
      version: 1,
      exportedAt: "2026-01-01T00:00:00.000Z",
      groups: [createGroup({ id: "default", name: "默认", isDefault: true })],
    };

    expect(validateBackupData({ ...base, accounts: [{ ...createAccount({}), remark: 123 }] })).toBe(false);
    expect(validateBackupData({ ...base, accounts: [{ ...createAccount({}), remark: "个人主号" }] })).toBe(true);

    const clean = createAccount({ remark: "已清洗备注" });
    expect(sanitizeAccountNumbers(clean)).toBe(clean);

    const trimmed = sanitizeAccountNumbers(createAccount({ remark: "  需要修剪  " }));
    expect(trimmed.remark).toBe("需要修剪");

    const blank = sanitizeAccountNumbers(createAccount({ remark: "   " }));
    expect(blank.remark).toBeUndefined();
    expect("remark" in blank).toBe(false);
  });
});
