import type { OTPAccount, SortConfig } from "../types";

/**
 * 对账户列表排序
 * @param accounts - 账户列表
 * @param config - 排序配置
 * @returns 排序后的新数组（不修改原数组）
 */
export function sortAccounts(
  accounts: OTPAccount[],
  config: SortConfig,
): OTPAccount[] {
  const { field, direction } = config;
  const modifier = direction === "asc" ? 1 : -1;

  return [...accounts].sort((a, b) => {
    if (field === "createdAt") {
      return (a.createdAt - b.createdAt) * modifier;
    }
    return a[field].localeCompare(b[field]) * modifier;
  });
}
