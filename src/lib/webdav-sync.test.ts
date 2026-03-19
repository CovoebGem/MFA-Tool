import { describe, expect, it } from "vitest";
import type { Group, OTPAccount } from "../types";
import { mergeWebDavSyncData } from "./webdav-sync";

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
    updatedAt: 1,
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
    updatedAt: 1,
    ...overrides,
  };
}

describe("mergeWebDavSyncData", () => {
  it("相同 id 的账户与同名分组应以 updatedAt 较新的记录为准", () => {
    const localGroups = [
      createGroup({ id: "default", name: "默认", isDefault: true, createdAt: 0, updatedAt: 0 }),
      createGroup({ id: "work-local", name: "工作", updatedAt: 100 }),
    ];
    const remoteGroups = [
      createGroup({ id: "default", name: "默认", isDefault: true, createdAt: 0, updatedAt: 0 }),
      createGroup({ id: "work-remote", name: "工作", updatedAt: 200 }),
      createGroup({ id: "personal-remote", name: "个人", updatedAt: 180 }),
    ];

    const localAccounts = [
      createAccount({
        id: "shared",
        issuer: "GitHub",
        name: "alice@example.com",
        secret: "SECRET-1",
        groupId: "work-local",
        updatedAt: 100,
      }),
    ];
    const remoteAccounts = [
      createAccount({
        id: "shared",
        issuer: "GitHub Enterprise",
        name: "alice@corp.example",
        secret: "SECRET-1",
        groupId: "work-remote",
        updatedAt: 200,
      }),
      createAccount({
        id: "remote-only",
        issuer: "Google",
        name: "bob@example.com",
        secret: "SECRET-2",
        groupId: "personal-remote",
        updatedAt: 180,
      }),
    ];

    const merged = mergeWebDavSyncData(localAccounts, localGroups, remoteAccounts, remoteGroups);

    expect(merged.groups).toEqual([
      createGroup({ id: "default", name: "默认", isDefault: true, createdAt: 0, updatedAt: 0 }),
      expect.objectContaining({ id: "work-remote", name: "工作", updatedAt: 200 }),
      expect.objectContaining({ id: "personal-remote", name: "个人", updatedAt: 180 }),
    ]);
    expect(merged.accounts).toEqual([
      expect.objectContaining({
        id: "shared",
        issuer: "GitHub Enterprise",
        name: "alice@corp.example",
        groupId: "work-remote",
        updatedAt: 200,
      }),
      expect.objectContaining({
        id: "remote-only",
        groupId: "personal-remote",
      }),
    ]);
  });

  it("不同 id 但相同 secret 时应保留较新的那条记录", () => {
    const localGroups = [
      createGroup({ id: "default", name: "默认", isDefault: true, createdAt: 0, updatedAt: 0 }),
    ];
    const remoteGroups = [
      createGroup({ id: "default", name: "默认", isDefault: true, createdAt: 0, updatedAt: 0 }),
    ];

    const localAccounts = [
      createAccount({
        id: "local-id",
        issuer: "GitHub",
        name: "alice@example.com",
        secret: "SECRET-1",
        updatedAt: 100,
      }),
    ];
    const remoteAccounts = [
      createAccount({
        id: "remote-id",
        issuer: "GitHub",
        name: "alice+renamed@example.com",
        secret: "SECRET-1",
        updatedAt: 300,
      }),
    ];

    const merged = mergeWebDavSyncData(localAccounts, localGroups, remoteAccounts, remoteGroups);

    expect(merged.accounts).toEqual([
      expect.objectContaining({
        id: "remote-id",
        name: "alice+renamed@example.com",
        secret: "SECRET-1",
        updatedAt: 300,
      }),
    ]);
  });
});
