import type { OTPAccount, Group } from "../types";

/** Dashboard 统计数据 */
export interface DashboardStats {
  totalAccounts: number;
  totalGroups: number;
  recentCount: number;
}

/**
 * 计算仪表盘统计数据
 * @param accounts 所有 OTP 账户
 * @param groups 所有分组
 * @returns DashboardStats 包含账户总数、分组总数、近 7 天新增数
 */
export function computeStats(
  accounts: OTPAccount[],
  groups: Group[]
): DashboardStats {
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  return {
    totalAccounts: accounts.length,
    totalGroups: groups.length,
    recentCount: accounts.filter((a) => a.createdAt >= sevenDaysAgo).length,
  };
}

/**
 * 获取最近添加的账户列表，按 createdAt 降序排列
 * @param accounts 所有 OTP 账户
 * @param limit 最多返回条数，默认 5
 * @returns 按 createdAt 降序排列的账户列表，最多 limit 条
 */
export function getRecentAccounts(
  accounts: OTPAccount[],
  limit: number = 5
): OTPAccount[] {
  return [...accounts]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}
