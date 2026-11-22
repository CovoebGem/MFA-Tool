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
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed)) {
    throw new Error("账户数据格式无效");
  }
  return parsed as OTPAccount[];
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
  updates: Partial<Pick<OTPAccount, "name" | "issuer" | "secret" | "remark">>,
): OTPAccount[] {
  const now = Date.now();
  return accounts.map((a) => {
    if (a.id !== id) {
      return a;
    }
    const next: OTPAccount = { ...a, ...updates, updatedAt: now };
    if ("remark" in updates) {
      const trimmedRemark = typeof updates.remark === "string" ? updates.remark.trim() : "";
      if (trimmedRemark) {
        next.remark = trimmedRemark;
      } else {
        delete next.remark;
      }
    }
    return next;
  });
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
 * 批量删除指定 ID 集合中的账户
 * @param accounts - 现有账户列表
 * @param ids - 要删除的账户 ID 集合
 * @returns 更新后的账户列表
 */
export function removeAccounts(accounts: OTPAccount[], ids: Iterable<string>): OTPAccount[] {
  const idSet = new Set(ids);
  if (idSet.size === 0) {
    return accounts;
  }
  return accounts.filter((a) => !idSet.has(a.id));
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

/**
 * 切换或设置账户置顶状态
 * @param accounts - 现有账户列表
 * @param id - 目标账户 ID
 * @param pinned - 可选显式目标状态，未传时按当前状态取反
 * @returns 更新后的账户列表（无变化时返回原引用）
 */
export function toggleAccountPin(
  accounts: OTPAccount[],
  id: string,
  pinned?: boolean,
): OTPAccount[] {
  const target = accounts.find((account) => account.id === id);
  if (!target) {
    return accounts;
  }

  const nextPinned = pinned ?? !target.pinned;
  if (nextPinned === Boolean(target.pinned)) {
    return accounts;
  }

  const now = Date.now();
  return accounts.map((account) => {
    if (account.id !== id) {
      return account;
    }

    if (nextPinned) {
      return {
        ...account,
        pinned: true,
        pinnedAt: now,
        updatedAt: now,
      };
    }

    const { pinnedAt: omittedPinnedAt, ...rest } = account;
    void omittedPinnedAt;
    return {
      ...rest,
      pinned: false,
      updatedAt: now,
    };
  });
}

/**
 * 批量设置账户置顶或取消置顶状态
 * @param accounts - 现有账户列表
 * @param accountIds - 目标账户 ID 集合
 * @param pinned - 目标置顶状态
 * @returns 更新后的账户列表（无任何账户状态变化时返回原引用）
 */
export function setAccountsPinned(
  accounts: OTPAccount[],
  accountIds: Iterable<string>,
  pinned: boolean,
): OTPAccount[] {
  const idSet = new Set(accountIds);
  if (idSet.size === 0) {
    return accounts;
  }

  const hasChanges = accounts.some(
    (account) => idSet.has(account.id) && Boolean(account.pinned) !== pinned,
  );
  if (!hasChanges) {
    return accounts;
  }

  const now = Date.now();
  return accounts.map((account) => {
    if (!idSet.has(account.id) || Boolean(account.pinned) === pinned) {
      return account;
    }

    if (pinned) {
      return {
        ...account,
        pinned: true,
        pinnedAt: now,
        updatedAt: now,
      };
    }

    const { pinnedAt: omittedPinnedAt, ...rest } = account;
    void omittedPinnedAt;
    return {
      ...rest,
      pinned: false,
      updatedAt: now,
    };
  });
}

export { DATA_FILE };
