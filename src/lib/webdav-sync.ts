import type { Group, OTPAccount } from "../types";
import type { MergedBackupData } from "./backup";
import { DEFAULT_GROUP_ID, createDefaultGroup, getDefaultGroup } from "./group-manager";

function normalizeGroupName(name: string): string {
  return name.trim();
}

function accountKey(account: Pick<OTPAccount, "name" | "issuer">): string {
  return `${account.name}\0${account.issuer}`;
}

function entityUpdatedAt(entity: Pick<Group | OTPAccount, "createdAt" | "updatedAt">): number {
  return entity.updatedAt ?? entity.createdAt;
}

function normalizeGroup(group: Group): Group {
  return group.updatedAt === undefined ? { ...group, updatedAt: group.createdAt } : group;
}

function normalizeAccount(account: OTPAccount): OTPAccount {
  return account.updatedAt === undefined ? { ...account, updatedAt: account.createdAt } : account;
}

function ensureDefaultGroup(groups: Group[]): Group[] {
  if (groups.some((group) => group.isDefault || group.id === DEFAULT_GROUP_ID)) {
    return groups.map(normalizeGroup);
  }

  return [createDefaultGroup(), ...groups.map(normalizeGroup)];
}

function isDefaultGroup(group: Group): boolean {
  return group.isDefault || group.id === DEFAULT_GROUP_ID;
}

function isSameGroup(a: Group, b: Group): boolean {
  if (isDefaultGroup(a) && isDefaultGroup(b)) {
    return true;
  }

  return a.id === b.id || normalizeGroupName(a.name) === normalizeGroupName(b.name);
}

function pickNewerGroup(existing: Group, incoming: Group): Group {
  return entityUpdatedAt(existing) >= entityUpdatedAt(incoming) ? existing : incoming;
}

function isSameAccount(a: OTPAccount, b: OTPAccount): boolean {
  return a.id === b.id || a.secret === b.secret || accountKey(a) === accountKey(b);
}

function pickNewerAccount(existing: OTPAccount, incoming: OTPAccount): OTPAccount {
  return entityUpdatedAt(existing) >= entityUpdatedAt(incoming) ? existing : incoming;
}

function resolveGroupId(groupIdMap: Map<string, string>, groups: Group[], fallbackGroupId: string, groupId: string): string {
  return groupIdMap.get(groupId)
    ?? (groups.some((group) => group.id === groupId) ? groupId : fallbackGroupId);
}

export function mergeWebDavSyncData(
  localAccounts: OTPAccount[],
  localGroups: Group[],
  remoteAccounts: OTPAccount[],
  remoteGroups: Group[],
): MergedBackupData {
  const mergedGroups: Group[] = [];

  for (const group of [...ensureDefaultGroup(localGroups), ...ensureDefaultGroup(remoteGroups)]) {
    const index = mergedGroups.findIndex((candidate) => isSameGroup(candidate, group));
    if (index === -1) {
      mergedGroups.push(group);
      continue;
    }

    mergedGroups[index] = pickNewerGroup(mergedGroups[index], group);
  }

  const defaultGroup = getDefaultGroup(mergedGroups);
  const groupIdMap = new Map<string, string>();

  for (const group of [...ensureDefaultGroup(localGroups), ...ensureDefaultGroup(remoteGroups)]) {
    const winner = mergedGroups.find((candidate) => isSameGroup(candidate, group)) ?? defaultGroup;
    groupIdMap.set(group.id, winner.id);
  }

  const mergedAccounts: OTPAccount[] = [];

  for (const account of [...localAccounts.map(normalizeAccount), ...remoteAccounts.map(normalizeAccount)]) {
    const mappedGroupId = resolveGroupId(groupIdMap, mergedGroups, defaultGroup.id, account.groupId);
    const normalizedAccount = {
      ...account,
      updatedAt: account.updatedAt ?? account.createdAt,
      groupId: mappedGroupId,
    };
    const index = mergedAccounts.findIndex((candidate) => isSameAccount(candidate, normalizedAccount));

    if (index === -1) {
      mergedAccounts.push(normalizedAccount);
      continue;
    }

    const winner = pickNewerAccount(mergedAccounts[index], normalizedAccount);
    mergedAccounts[index] = {
      ...winner,
      groupId: resolveGroupId(groupIdMap, mergedGroups, defaultGroup.id, winner.groupId),
    };
  }

  return {
    accounts: mergedAccounts,
    groups: mergedGroups,
  };
}
