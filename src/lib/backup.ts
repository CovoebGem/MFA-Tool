import type { OTPAccount, Group } from "../types";
import { DEFAULT_GROUP_ID, createDefaultGroup, getDefaultGroup } from "./group-manager";

export interface BackupData {
  version: 1;
  exportedAt: string;
  accounts: OTPAccount[];
  groups: Group[];
}

export interface MergedBackupData {
  accounts: OTPAccount[];
  groups: Group[];
}

function ensureDefaultGroup(groups: Group[]): Group[] {
  if (groups.some((group) => group.isDefault || group.id === DEFAULT_GROUP_ID)) {
    return groups;
  }

  return [createDefaultGroup(), ...groups];
}

function normalizeGroupName(name: string): string {
  return name.trim();
}

function accountKey(account: Pick<OTPAccount, "name" | "issuer">): string {
  return `${account.name}\0${account.issuer}`;
}

export function createBackupData(accounts: OTPAccount[], groups: Group[]): BackupData {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    accounts,
    groups,
  };
}

export function validateBackupData(data: unknown): data is BackupData {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  
  if (obj.version !== 1) return false;
  if (typeof obj.exportedAt !== "string") return false;
  if (!Array.isArray(obj.accounts)) return false;
  if (!Array.isArray(obj.groups)) return false;

  for (const account of obj.accounts) {
    if (typeof account !== "object" || account === null) return false;
    const a = account as Record<string, unknown>;
    if (typeof a.id !== "string") return false;
    if (typeof a.issuer !== "string") return false;
    if (typeof a.name !== "string") return false;
    if (typeof a.secret !== "string") return false;
  }

  for (const group of obj.groups) {
    if (typeof group !== "object" || group === null) return false;
    const g = group as Record<string, unknown>;
    if (typeof g.id !== "string") return false;
    if (typeof g.name !== "string") return false;
  }

  return true;
}

export async function exportToJSON(accounts: OTPAccount[], groups: Group[]): Promise<string> {
  const data = createBackupData(accounts, groups);
  return JSON.stringify(data, null, 2);
}

export function parseBackupJSON(json: string): BackupData {
  const data = JSON.parse(json);
  if (!validateBackupData(data)) {
    throw new Error("无效的备份文件格式");
  }
  return data;
}

export function mergeBackupData(
  existingAccounts: OTPAccount[],
  existingGroups: Group[],
  importedAccounts: OTPAccount[],
  importedGroups: Group[],
): MergedBackupData {
  const mergedGroups = [...ensureDefaultGroup(existingGroups)];
  const defaultGroup = getDefaultGroup(mergedGroups);
  const groupIdMap = new Map<string, string>([[DEFAULT_GROUP_ID, defaultGroup.id]]);
  const groupsById = new Map(mergedGroups.map((group) => [group.id, group]));
  const groupsByName = new Map(
    mergedGroups.map((group) => [normalizeGroupName(group.name), group]),
  );

  for (const importedGroup of ensureDefaultGroup(importedGroups)) {
    if (importedGroup.isDefault || importedGroup.id === DEFAULT_GROUP_ID) {
      groupIdMap.set(importedGroup.id, defaultGroup.id);
      continue;
    }

    const sameIdGroup = groupsById.get(importedGroup.id);
    if (sameIdGroup) {
      groupIdMap.set(importedGroup.id, sameIdGroup.id);
      continue;
    }

    const sameNameGroup = groupsByName.get(normalizeGroupName(importedGroup.name));
    if (sameNameGroup) {
      groupIdMap.set(importedGroup.id, sameNameGroup.id);
      continue;
    }

    mergedGroups.push(importedGroup);
    groupsById.set(importedGroup.id, importedGroup);
    groupsByName.set(normalizeGroupName(importedGroup.name), importedGroup);
    groupIdMap.set(importedGroup.id, importedGroup.id);
  }

  const mergedAccounts = [...existingAccounts];
  const existingIds = new Set(existingAccounts.map((account) => account.id));
  const existingSecrets = new Set(existingAccounts.map((account) => account.secret));
  const existingNameIssuers = new Set(existingAccounts.map(accountKey));
  const shouldAssignOrder = [...existingAccounts, ...importedAccounts].some(
    (account) => account.order !== undefined,
  );
  let nextOrder = existingAccounts.reduce(
    (maxOrder, account) => Math.max(maxOrder, account.order ?? -1),
    -1,
  );

  for (const importedAccount of importedAccounts) {
    if (existingIds.has(importedAccount.id)) {
      continue;
    }
    if (existingSecrets.has(importedAccount.secret)) {
      continue;
    }

    const nameIssuerKey = accountKey(importedAccount);
    if (existingNameIssuers.has(nameIssuerKey)) {
      continue;
    }

    const mappedGroupId = groupIdMap.get(importedAccount.groupId)
      ?? (groupsById.has(importedAccount.groupId) ? importedAccount.groupId : defaultGroup.id);

    const mergedAccount: OTPAccount = {
      ...importedAccount,
      groupId: mappedGroupId,
      ...(shouldAssignOrder ? { order: ++nextOrder } : {}),
    };

    mergedAccounts.push(mergedAccount);
    existingIds.add(mergedAccount.id);
    existingSecrets.add(mergedAccount.secret);
    existingNameIssuers.add(nameIssuerKey);
  }

  return {
    accounts: mergedAccounts,
    groups: mergedGroups,
  };
}

export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function generateBackupFilename(): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, "-");
  return `2fa-backup-${dateStr}_${timeStr}.json`;
}
