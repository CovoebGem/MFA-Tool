import { useState, useEffect, useCallback } from "react";
import type { OTPAccount, DedupResult } from "../types";
import {
  loadAccounts,
  saveAccounts,
  addAccounts,
  removeAccount,
  moveAccountToGroup,
  moveAccountsToGroup,
} from "../lib/account-manager";
import { checkDuplicates } from "../lib/dedup-checker";
import { DEFAULT_GROUP_ID } from "../lib/group-manager";

export function useAccounts() {
  const [accounts, setAccounts] = useState<OTPAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await loadAccounts();
        if (!cancelled) {
          // 数据迁移：为缺少 groupId 的账户补充默认分组 ID
          let needsMigration = false;
          const migrated = data.map((account) => {
            if (!account.groupId) {
              needsMigration = true;
              return { ...account, groupId: DEFAULT_GROUP_ID };
            }
            return account;
          });

          setAccounts(migrated);

          // 如果有迁移，立即持久化
          if (needsMigration) {
            await saveAccounts(migrated);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "加载账户失败");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const addNewAccounts = useCallback(
    async (newAccounts: OTPAccount[]) => {
      try {
        setError(null);
        const updated = addAccounts(accounts, newAccounts);
        setAccounts(updated);
        await saveAccounts(updated);
      } catch (err) {
        setError(err instanceof Error ? err.message : "添加账户失败");
      }
    },
    [accounts],
  );

  const deleteAccount = useCallback(
    async (id: string) => {
      try {
        setError(null);
        const updated = removeAccount(accounts, id);
        setAccounts(updated);
        await saveAccounts(updated);
      } catch (err) {
        setError(err instanceof Error ? err.message : "删除账户失败");
      }
    },
    [accounts],
  );

  const moveToGroup = useCallback(
    async (accountId: string, groupId: string) => {
      try {
        setError(null);
        const updated = moveAccountToGroup(accounts, accountId, groupId);
        setAccounts(updated);
        await saveAccounts(updated);
      } catch (err) {
        setError(err instanceof Error ? err.message : "移动账户失败");
      }
    },
    [accounts],
  );

  const batchMoveToGroup = useCallback(
    async (accountIds: string[], groupId: string) => {
      try {
        setError(null);
        const updated = moveAccountsToGroup(accounts, accountIds, groupId);
        setAccounts(updated);
        await saveAccounts(updated);
      } catch (err) {
        setError(err instanceof Error ? err.message : "批量移动账户失败");
      }
    },
    [accounts],
  );

  const detectDuplicates = useCallback(
    (incoming: OTPAccount[]): DedupResult => {
      return checkDuplicates(accounts, incoming);
    },
    [accounts],
  );

  return {
    accounts,
    setAccounts,
    loading,
    error,
    addNewAccounts,
    deleteAccount,
    moveToGroup,
    batchMoveToGroup,
    detectDuplicates,
  };
}
