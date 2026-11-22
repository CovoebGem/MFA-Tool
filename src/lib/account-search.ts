import type { Group, OTPAccount } from "../types";

/**
 * 归一化检索文本（NFKC 兼容分解 + 小写）
 */
export function normalizeSearchText(value: string): string {
  return value.normalize("NFKC").toLowerCase();
}

/**
 * 归一化用户搜索输入（去首尾空白 + 折叠连续空白）
 */
export function normalizeSearchQuery(query: string): string {
  return normalizeSearchText(query).trim().replace(/\s+/g, " ");
}

/**
 * 将搜索词按空白拆分为多个 AND token
 */
export function tokenizeSearchQuery(query: string): string[] {
  const normalized = normalizeSearchQuery(query);
  if (!normalized) {
    return [];
  }
  return normalized.split(" ");
}

/**
 * 构建分组 ID 到分组名称的映射
 */
export function buildGroupNameMap(groups: Group[]): Map<string, string> {
  return new Map(groups.map((group) => [group.id, group.name]));
}

/**
 * 判断账户是否命中所有搜索 token（仅检查 issuer、name、remark、所属分组名，绝不检索 secret）
 */
export function matchesAccountQuery(
  account: OTPAccount,
  tokens: string[],
  groupNameById?: ReadonlyMap<string, string>,
): boolean {
  if (tokens.length === 0) {
    return true;
  }

  const issuer = normalizeSearchText(account.issuer);
  const name = normalizeSearchText(account.name);
  const remark = normalizeSearchText(account.remark ?? "");
  const groupName = normalizeSearchText(groupNameById?.get(account.groupId) ?? "");

  return tokens.every(
    (token) =>
      issuer.includes(token) ||
      name.includes(token) ||
      remark.includes(token) ||
      groupName.includes(token),
  );
}

/**
 * 按搜索词过滤账户列表；空或纯空白查询直接返回原数组引用
 */
export function filterAccountsByQuery(
  accounts: OTPAccount[],
  query: string,
  groupNameById?: ReadonlyMap<string, string>,
): OTPAccount[] {
  const tokens = tokenizeSearchQuery(query);
  if (tokens.length === 0) {
    return accounts;
  }

  return accounts.filter((account) => matchesAccountQuery(account, tokens, groupNameById));
}
