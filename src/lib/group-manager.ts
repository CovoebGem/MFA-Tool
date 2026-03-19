import { invoke } from "@tauri-apps/api/core";
import type { Group, OTPAccount } from "../types";
import { ValidationError } from "../types";

/** 默认分组的固定 ID */
export const DEFAULT_GROUP_ID = "default";

/**
 * 创建默认分组对象
 */
export function createDefaultGroup(): Group {
  return {
    id: DEFAULT_GROUP_ID,
    name: "默认",
    isDefault: true,
    createdAt: 0,
    updatedAt: 0,
  };
}

function normalizeUpdatedAt(group: Group): Group {
  if (group.updatedAt !== undefined) {
    return group;
  }

  return {
    ...group,
    updatedAt: group.createdAt,
  };
}

/**
 * 获取分组列表中的默认分组
 */
export function getDefaultGroup(groups: Group[]): Group {
  const found = groups.find((g) => g.isDefault);
  if (!found) {
    return createDefaultGroup();
  }
  return found;
}

/**
 * 创建新分组
 * @param groups - 现有分组列表
 * @param name - 分组名称
 * @returns 更新后的分组列表
 * @throws ValidationError 当名称为空或重名时
 */
export function createGroup(groups: Group[], name: string): Group[] {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new ValidationError("分组名称不能为空", "name");
  }
  if (groups.some((g) => g.name === trimmed)) {
    throw new ValidationError("该分组名称已存在", "name");
  }
  const now = Date.now();
  const newGroup: Group = {
    id: crypto.randomUUID(),
    name: trimmed,
    isDefault: false,
    createdAt: now,
    updatedAt: now,
  };
  return [...groups, newGroup];
}

/**
 * 编辑分组名称
 * @param groups - 现有分组列表
 * @param groupId - 要编辑的分组 ID
 * @param newName - 新名称
 * @returns 更新后的分组列表
 * @throws ValidationError 当新名称为空、重名或分组不存在时
 */
export function renameGroup(
  groups: Group[],
  groupId: string,
  newName: string,
): Group[] {
  const trimmed = newName.trim();
  if (!trimmed) {
    throw new ValidationError("分组名称不能为空", "name");
  }
  const target = groups.find((g) => g.id === groupId);
  if (!target) {
    throw new ValidationError("分组不存在", "groupId");
  }
  if (groups.some((g) => g.id !== groupId && g.name === trimmed)) {
    throw new ValidationError("该分组名称已存在", "name");
  }
  const now = Date.now();
  return groups.map((g) =>
    g.id === groupId && g.name !== trimmed ? { ...g, name: trimmed, updatedAt: now } : g,
  );
}

/**
 * 删除分组，将其下账户移入 Default_Group
 * @param groups - 现有分组列表
 * @param accounts - 现有账户列表
 * @param groupId - 要删除的分组 ID
 * @returns { groups, accounts } 更新后的分组和账户列表
 * @throws ValidationError 当尝试删除 Default_Group 时
 */
export function deleteGroup(
  groups: Group[],
  accounts: OTPAccount[],
  groupId: string,
): { groups: Group[]; accounts: OTPAccount[] } {
  const target = groups.find((g) => g.id === groupId);
  if (!target) {
    throw new ValidationError("分组不存在", "groupId");
  }
  if (target.isDefault) {
    throw new ValidationError("默认分组不可删除", "groupId");
  }
  const defaultGroup = getDefaultGroup(groups);
  const now = Date.now();
  const updatedAccounts = accounts.map((a) =>
    a.groupId === groupId ? { ...a, groupId: defaultGroup.id, updatedAt: now } : a,
  );
  const updatedGroups = groups.filter((g) => g.id !== groupId);
  return { groups: updatedGroups, accounts: updatedAccounts };
}

/**
 * 按分组筛选账户
 * @param accounts - 全部账户列表
 * @param groupId - 分组 ID
 * @returns 属于该分组的账户列表
 */
export function filterByGroup(
  accounts: OTPAccount[],
  groupId: string,
): OTPAccount[] {
  return accounts.filter((a) => a.groupId === groupId);
}

/**
 * 根据 issuer 查找或创建分组
 * @param groups - 现有分组列表
 * @param issuer - 服务商名称
 * @returns { groups, groupId } 更新后的分组列表和目标分组 ID
 */
export function findOrCreateGroupByIssuer(
  groups: Group[],
  issuer: string,
): { groups: Group[]; groupId: string } {
  const trimmed = issuer.trim();
  if (!trimmed) {
    const defaultGroup = getDefaultGroup(groups);
    return { groups, groupId: defaultGroup.id };
  }
  const existing = groups.find((g) => g.name === trimmed);
  if (existing) {
    return { groups, groupId: existing.id };
  }
  const now = Date.now();
  const newGroup: Group = {
    id: crypto.randomUUID(),
    name: trimmed,
    isDefault: false,
    createdAt: now,
    updatedAt: now,
  };
  return { groups: [...groups, newGroup], groupId: newGroup.id };
}

/**
 * 从存储加载分组列表
 * 如果没有数据，返回包含默认分组的数组
 */
export async function loadGroups(): Promise<Group[]> {
  try {
    const json = await invoke<string>("read_groups");
    const groups = (JSON.parse(json) as Group[]).map(normalizeUpdatedAt);
    if (groups.length === 0) {
      return [createDefaultGroup()];
    }
    return groups;
  } catch {
    return [createDefaultGroup()];
  }
}

/**
 * 保存分组列表到存储
 */
export async function saveGroups(groups: Group[]): Promise<void> {
  await invoke("write_groups", { data: JSON.stringify(groups) });
}
