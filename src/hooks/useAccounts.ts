import { useState, useEffect, useCallback, useRef } from "react";
import type { OTPAccount, DedupResult } from "../types";
import {
  loadAccounts,
  saveAccounts,
  addAccounts,
  removeAccount,
  removeAccounts,
  updateAccount,
  moveAccountToGroup,
  moveAccountsToGroup,
} from "../lib/account-manager";
import { sanitizeAccountNumbers } from "../lib/backup";
import { checkDuplicates } from "../lib/dedup-checker";
import { DEFAULT_GROUP_ID } from "../lib/group-manager";

export function normalizeLoadedAccounts(data: OTPAccount[]) {
  let needsMigration = false;

  const accounts = data.map((account) => {
    let nextAccount = account;

    if (!account.groupId) {
      needsMigration = true;
      nextAccount = { ...nextAccount, groupId: DEFAULT_GROUP_ID };
    }

    if (nextAccount.updatedAt === undefined) {
      needsMigration = true;
      nextAccount = { ...nextAccount, updatedAt: nextAccount.createdAt };
    }

    const sanitized = sanitizeAccountNumbers(nextAccount);
    if (sanitized !== nextAccount) {
      needsMigration = true;
      nextAccount = sanitized;
    }

    return nextAccount;
  });

  return { accounts, needsMigration };
}

export function useAccounts() {
  const [accounts, setAccountsState] = useState<OTPAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const accountsRef = useRef<OTPAccount[]>([]);
  const loadedRef = useRef(false);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());

  const setAccountsSnapshot = useCallback((nextAccounts: OTPAccount[]) => {
    accountsRef.current = nextAccounts;
    loadedRef.current = true;
    setAccountsState(nextAccounts);
  }, []);

  const getLatestAccounts = useCallback(() => accountsRef.current, []);
  const isAccountsLoaded = useCallback(() => loadedRef.current, []);
  const invalidateAccountsLoaded = useCallback(() => {
    loadedRef.current = false;
  }, []);

  const runSerializedAccountWrite = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const run = writeQueueRef.current.then(task, task);
    writeQueueRef.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }, []);

  const commitAccounts = useCallback(
    async (
      computeNext: (current: OTPAccount[]) => OTPAccount[] | null,
      fallbackErrorMessage = "保存账户失败",
      options: { rethrow?: boolean } = {},
    ): Promise<boolean> => {
      try {
        return await runSerializedAccountWrite(async () => {
          if (!loadedRef.current) {
            throw new Error("账户库尚未加载成功，已阻止覆盖写入，请先重试刷新");
          }
          setError(null);
          const updated = computeNext(accountsRef.current);
          if (updated === null) {
            return false;
          }
          await saveAccounts(updated);
          accountsRef.current = updated;
          setAccountsState(updated);
          return true;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : fallbackErrorMessage);
        if (options.rethrow) {
          throw err;
        }
        return false;
      }
    },
    [runSerializedAccountWrite],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await runSerializedAccountWrite(async () => {
          const data = await loadAccounts();
          if (cancelled) {
            return;
          }

          const { accounts: migrated, needsMigration } = normalizeLoadedAccounts(data);

          // 读取成功即锁定内存基准快照，即使后续迁移写回失败也不会退回空库覆盖原数据
          accountsRef.current = migrated;
          loadedRef.current = true;
          setAccountsState(migrated);

          if (needsMigration) {
            try {
              await saveAccounts(migrated);
            } catch (saveErr) {
              if (!cancelled) {
                setError(saveErr instanceof Error ? saveErr.message : "迁移保存账户失败");
              }
            }
          }
        });
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
  }, [runSerializedAccountWrite]);

  const addNewAccounts = useCallback(
    async (newAccounts: OTPAccount[]) => {
      await commitAccounts(
        (current) => addAccounts(current, newAccounts.map(sanitizeAccountNumbers)),
        "添加账户失败",
        { rethrow: true },
      );
    },
    [commitAccounts],
  );

  const deleteAccount = useCallback(
    async (id: string) => {
      await commitAccounts(
        (current) => removeAccount(current, id),
        "删除账户失败",
      );
    },
    [commitAccounts],
  );

  const batchDeleteAccounts = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) {
        return;
      }
      await commitAccounts(
        (current) => removeAccounts(current, ids),
        "批量删除账户失败",
        { rethrow: true },
      );
    },
    [commitAccounts],
  );

  const moveToGroup = useCallback(
    async (accountId: string, groupId: string) => {
      await commitAccounts(
        (current) => moveAccountToGroup(current, accountId, groupId),
        "移动账户失败",
      );
    },
    [commitAccounts],
  );

  const batchMoveToGroup = useCallback(
    async (accountIds: string[], groupId: string) => {
      await commitAccounts(
        (current) => moveAccountsToGroup(current, accountIds, groupId),
        "批量移动账户失败",
        { rethrow: true },
      );
    },
    [commitAccounts],
  );

  const detectDuplicates = useCallback(
    (incoming: OTPAccount[]): DedupResult => {
      return checkDuplicates(accounts, incoming);
    },
    [accounts],
  );

  const refreshAccounts = useCallback(async () => {
    try {
      await runSerializedAccountWrite(async () => {
        setError(null);
        let migrated: OTPAccount[];
        let needsMigration: boolean;
        try {
          const data = await loadAccounts();
          ({ accounts: migrated, needsMigration } = normalizeLoadedAccounts(data));
        } catch (readErr) {
          loadedRef.current = false;
          throw readErr;
        }
        accountsRef.current = migrated;
        loadedRef.current = true;
        setAccountsState(migrated);
        if (needsMigration) {
          try {
            await saveAccounts(migrated);
          } catch (saveErr) {
            setError(saveErr instanceof Error ? saveErr.message : "迁移保存账户失败");
          }
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "刷新账户失败");
      throw err;
    }
  }, [runSerializedAccountWrite]);

  const editAccount = useCallback(
    async (id: string, updates: Partial<Pick<OTPAccount, "name" | "issuer" | "secret">>) => {
      await commitAccounts(
        (current) => updateAccount(current, id, updates),
        "编辑账户失败",
      );
    },
    [commitAccounts],
  );

  return {
    accounts,
    setAccounts: setAccountsSnapshot,
    getLatestAccounts,
    isAccountsLoaded,
    invalidateAccountsLoaded,
    commitAccounts,
    runSerializedAccountWrite,
    loading,
    error,
    addNewAccounts,
    deleteAccount,
    batchDeleteAccounts,
    editAccount,
    moveToGroup,
    batchMoveToGroup,
    detectDuplicates,
    refreshAccounts,
  };
}