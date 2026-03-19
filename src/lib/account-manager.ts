import { invoke } from "@tauri-apps/api/core";
import type { OTPAccount } from "../types";

const DATA_FILE = "accounts.json";

function normalizeUpdatedAt(account: OTPAccount): OTPAccount {
  if (account.updatedAt !== undefined) {
    return account;
  }

  return {
    ...account,
    updatedAt: account.createdAt,
  };
}

/**
 * 从应用目录下的 data/ 文件夹加载所有账户
 * 通过 Tauri invoke 调用 Rust 后端读取文件
 * @returns OTP 账户数组
 */
export async function loadAccounts(): Promise<OTPAccount[]> {
  const json = await invoke<string>("read_accounts");
  return JSON.parse(json) as OTPAccount[];
}

/**
 * 保存账户列表到应用目录下的 data/ 文件夹
 * 通过 Tauri invoke 调用 Rust 后端写入文件
 * @param accounts - 完整的账户数组
 */
export async function saveAccounts(accounts: OTPAccount[]): Promise<void> {
  await invoke("write_accounts", { data: JSON.stringify(accounts) });
}

/**
 * 添加一个或多个账户
 * @param existing - 现有账户列表
 * @param newAccounts - 要添加的新账户
 * @returns 更新后的账户列表
 */
export function addAccounts(
  existing: OTPAccount[],
  newAccounts: OTPAccount[],
): OTPAccount[] {
  return [...existing, ...newAccounts.map(normalizeUpdatedAt)];
}

/**
 * 更新指定账户的信息
 * @param accounts - 现有账户列表
 * @param id - 要更新的账户 ID
 * @param updates - 要更新的字段
 * @returns 更新后的账户列表
 */
export function updateAccount(
  accounts: OTPAccount[],
  id: string,
  updates: Partial<Pick<OTPAccount, "name" | "issuer" | "secret">>,
): OTPAccount[] {
  const now = Date.now();
  return accounts.map((a) =>
    a.id === id ? { ...a, ...updates, updatedAt: now } : a,
  );
}

/**
 * 删除指定账户
 * @param accounts - 现有账户列表
 * @param id - 要删除的账户 ID
 * @returns 更新后的账户列表
 */
export function removeAccount(accounts: OTPAccount[], id: string): OTPAccount[] {
  return accounts.filter((a) => a.id !== id);
}

/**
 * 移动账户到指定分组
 * @param accounts - 现有账户列表
 * @param accountId - 要移动的账户 ID
 * @param groupId - 目标分组 ID
 * @returns 更新后的账户列表
 */
export function moveAccountToGroup(
  accounts: OTPAccount[],
  accountId: string,
  groupId: string,
): OTPAccount[] {
  const now = Date.now();
  return accounts.map((account) =>
    account.id === accountId && account.groupId !== groupId
      ? { ...account, groupId, updatedAt: now }
      : account,
  );
}

/**
 * 批量移动账户到指定分组
 * @param accounts - 现有账户列表
 * @param accountIds - 要移动的账户 ID 数组
 * @param groupId - 目标分组 ID
 * @returns 更新后的账户列表
 */
export function moveAccountsToGroup(
  accounts: OTPAccount[],
  accountIds: string[],
  groupId: string,
): OTPAccount[] {
  const idSet = new Set(accountIds);
  const now = Date.now();
  return accounts.map((account) =>
    idSet.has(account.id) && account.groupId !== groupId
      ? { ...account, groupId, updatedAt: now }
      : account,
  );
}

export { DATA_FILE };
