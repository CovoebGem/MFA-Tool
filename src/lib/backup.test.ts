import { describe, expect, it } from "vitest";
import type { Group, OTPAccount } from "../types";
import { mergeBackupData } from "./backup";

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
});
