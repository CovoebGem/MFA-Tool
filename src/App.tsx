import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import type { Page, OTPAccount, Group, DedupResult } from "./types";
import Sidebar from "./components/Sidebar";
import HomePage from "./components/HomePage";
import AccountPage from "./components/AccountPage";
import GroupPage from "./components/GroupPage";
import { TempPanel } from "./components/TempPanel";
import type { TempEntry } from "./components/TempPanel";
import DedupDialog from "./components/DedupDialog";
import Toast from "./components/Toast";
import AppUpdateManager from "./components/AppUpdateManager";
import BackupPanel from "./components/BackupPanel";
import WebDavSyncPanel from "./components/WebDavSyncPanel";
import { useAccounts, normalizeLoadedAccounts } from "./hooks/useAccounts";
import { useGroups } from "./hooks/useGroups";
import { useViewportHeight } from "./hooks/useViewportHeight";
import { useTheme } from "./hooks/useTheme";
import { checkDuplicates, skipDuplicates, overrideDuplicates } from "./lib/dedup-checker";
import { deleteGroup, findOrCreateGroupByIssuer, loadGroups, saveGroups } from "./lib/group-manager";
import { addAccounts, loadAccounts, moveAccountsToGroup, saveAccounts } from "./lib/account-manager";
import { mergeBackupData, sanitizeAccountNumbers } from "./lib/backup";
import { mergeWebDavSyncData } from "./lib/webdav-sync";
import {
  buildGroupNameMap,
  filterAccountsByQuery,
  normalizeSearchQuery,
} from "./lib/account-search";

function assignGroupsByIssuer(baseGroups: Group[], incomingAccounts: OTPAccount[]) {
  let nextGroups = baseGroups;
  const groupedAccounts = incomingAccounts.map((account) => {
    const result = findOrCreateGroupByIssuer(nextGroups, account.issuer);
    nextGroups = result.groups;
    return { ...account, groupId: result.groupId };
  });
  return { groupedAccounts, groups: nextGroups };
}

function App() {
  const [currentPage, setCurrentPage] = useState<Page>("home");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [dedupState, setDedupState] = useState<{
    result: DedupResult;
    newGroups: Group[];
    rawIncoming?: OTPAccount[];
  } | null>(null);
  const [dedupSubmitting, setDedupSubmitting] = useState(false);
  const [dedupError, setDedupError] = useState<string | null>(null);
  const dedupSubmittingRef = useRef(false);
  const [tempEntries, setTempEntries] = useState<TempEntry[]>([]);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
  const [accountSearchQuery, setAccountSearchQuery] = useState("");
  const [searchFocusTick, setSearchFocusTick] = useState(0);
  const viewportHeight = useViewportHeight();
  const { theme, setTheme } = useTheme();

  const showToast = useCallback((message: string, type: "success" | "error") => setToast({ message, type }), []);

  const {
    accounts,
    setAccounts,
    getLatestAccounts,
    isAccountsLoaded,
    invalidateAccountsLoaded,
    commitAccounts,
    runSerializedAccountWrite,
    loading: accountsLoading,
    error: accountsError,
    addNewAccounts,
    deleteAccount,
    batchDeleteAccounts,
    editAccount,
    refreshAccounts,
  } = useAccounts();

  const {
    groups,
    setGroups,
    getLatestGroups,
    isGroupsLoaded,
    invalidateGroupsLoaded,
    loading: groupsLoading,
    error: groupsError,
    addGroup,
    editGroup,
  } = useGroups({ runSerializedWrite: runSerializedAccountWrite });

  const loading = accountsLoading || groupsLoading;
  const error = accountsError || groupsError;

  const groupNameById = useMemo(() => buildGroupNameMap(groups), [groups]);

  const visibleAccountIds = useMemo(() => {
    const visible = filterAccountsByQuery(accounts, accountSearchQuery, groupNameById);
    return new Set(visible.map((account) => account.id));
  }, [accounts, accountSearchQuery, groupNameById]);

  const effectiveSelectedAccountIds = useMemo(() => {
    if (selectedAccountIds.size === 0) {
      return selectedAccountIds;
    }
    let changed = false;
    const next = new Set<string>();
    for (const id of selectedAccountIds) {
      if (visibleAccountIds.has(id)) {
        next.add(id);
      } else {
        changed = true;
      }
    }
    return changed ? next : selectedAccountIds;
  }, [selectedAccountIds, visibleAccountIds]);

  const handleAccountSearchQueryChange = useCallback(
    (nextQuery: string) => {
      setAccountSearchQuery((prevQuery) => {
        if (normalizeSearchQuery(nextQuery) !== normalizeSearchQuery(prevQuery)) {
          setSelectedAccountIds(new Set());
        }
        return nextQuery;
      });
    },
    [],
  );

  const handleSearchInAllAccounts = useCallback((query: string) => {
    setAccountSearchQuery(query);
    setSelectedAccountIds(new Set());
    setCurrentPage("accounts");
    setSearchFocusTick((tick) => tick + 1);
  }, []);

  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (
        event.isComposing ||
        event.keyCode === 229 ||
        event.altKey ||
        event.shiftKey ||
        !(event.ctrlKey || event.metaKey) ||
        event.key.toLowerCase() !== "k"
      ) {
        return;
      }

      if (document.querySelector('[role="dialog"], [aria-modal="true"]')) {
        return;
      }

      const active = document.activeElement as HTMLElement | null;
      if (
        active &&
        active.getAttribute("role") !== "searchbox" &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          active.tagName === "SELECT" ||
          active.isContentEditable)
      ) {
        return;
      }

      event.preventDefault();
      if (currentPage !== "accounts" && currentPage !== "groups") {
        setCurrentPage("accounts");
        setSelectedAccountIds(new Set());
      }
      setSearchFocusTick((tick) => tick + 1);
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [currentPage]);

  const commitAccountsAndGroups = useCallback(
    async <R = { accounts: OTPAccount[]; groups: Group[] }>(
      computeNext: (snapshot: { accounts: OTPAccount[]; groups: Group[] }) => {
        accounts: OTPAccount[];
        groups: Group[];
        result?: R;
      } | null,
      options?: {
        writeOrder?: "groups-first" | "accounts-first";
        rollbackErrorMessage?: string;
      },
    ): Promise<{ accounts: OTPAccount[]; groups: Group[]; result?: R }> => {
      return await runSerializedAccountWrite(async () => {
        if (!isAccountsLoaded() || !isGroupsLoaded()) {
          throw new Error("账户或分组尚未加载成功，已阻止覆盖写入，请先重试刷新");
        }

        const currentAccounts = getLatestAccounts();
        const currentGroups = getLatestGroups();
        const computed = computeNext({
          accounts: currentAccounts,
          groups: currentGroups,
        });

        if (!computed) {
          return { accounts: currentAccounts, groups: currentGroups };
        }

        const nextAccounts = computed.accounts.map(sanitizeAccountNumbers);
        const nextGroups = computed.groups;
        const groupsChanged = nextGroups !== currentGroups;

        if (!groupsChanged) {
          await saveAccounts(nextAccounts);
          setAccounts(nextAccounts);
          return { accounts: nextAccounts, groups: nextGroups, result: computed.result };
        }

        const reloadAfterRollbackFailure = async () => {
          // 在串行写队列内部禁止调用 refreshAccounts（会重入同一写队列造成死锁），直接从磁盘读取对齐状态
          // 将 normalizeLoadedAccounts 放在 allSettled 内部，避免单个库格式异常阻止关闭另一库的写入门禁
          const [accountsResult, groupsResult] = await Promise.allSettled([
            loadAccounts().then((data) => normalizeLoadedAccounts(data).accounts),
            loadGroups(),
          ]);
          if (accountsResult.status === "fulfilled") {
            setAccounts(accountsResult.value);
          } else {
            invalidateAccountsLoaded();
          }
          if (groupsResult.status === "fulfilled") {
            setGroups(groupsResult.value);
          } else {
            invalidateGroupsLoaded();
          }
        };

        const writeOrder = options?.writeOrder ?? "groups-first";
        if (writeOrder === "accounts-first") {
          await saveAccounts(nextAccounts);
          try {
            await saveGroups(nextGroups);
          } catch (err) {
            try {
              await saveAccounts(currentAccounts);
            } catch {
              await reloadAfterRollbackFailure();
              throw new Error(
                options?.rollbackErrorMessage ??
                  "保存分组失败且回滚账户失败，已尝试从磁盘重新加载最新状态",
              );
            }
            throw err;
          }
        } else {
          await saveGroups(nextGroups);
          try {
            await saveAccounts(nextAccounts);
          } catch (err) {
            try {
              await saveGroups(currentGroups);
            } catch {
              await reloadAfterRollbackFailure();
              throw new Error(
                options?.rollbackErrorMessage ??
                  "保存账户失败且回滚分组失败，已尝试从磁盘重新加载最新状态",
              );
            }
            throw err;
          }
        }

        setGroups(nextGroups);
        setAccounts(nextAccounts);
        return { accounts: nextAccounts, groups: nextGroups, result: computed.result };
      });
    },
    [
      getLatestAccounts,
      getLatestGroups,
      invalidateAccountsLoaded,
      invalidateGroupsLoaded,
      isAccountsLoaded,
      isGroupsLoaded,
      runSerializedAccountWrite,
      setAccounts,
      setGroups,
    ],
  );

  const handleHomeCommitAutoGroupedAccounts = useCallback(
    async (incomingAccounts: OTPAccount[]) => {
      const committed = await commitAccountsAndGroups(
        ({ accounts: currentAccounts, groups: currentGroups }) => {
          const { groupedAccounts, groups: nextGroups } = assignGroupsByIssuer(
            currentGroups,
            incomingAccounts,
          );
          const nextAccounts = addAccounts(currentAccounts, groupedAccounts);
          return {
            accounts: nextAccounts,
            groups: nextGroups,
            result: groupedAccounts,
          };
        },
      );
      return committed.result ?? incomingAccounts;
    },
    [commitAccountsAndGroups],
  );

  const handleDedupDetected = (
    result: DedupResult,
    newGroups: Group[],
    rawIncoming?: OTPAccount[],
  ) => {
    setDedupError(null);
    setDedupState({ result, newGroups, rawIncoming });
  };

  const runDedupCommit = async (mode: "skip" | "override") => {
    if (!dedupState || dedupSubmittingRef.current) return;
    dedupSubmittingRef.current = true;
    setDedupSubmitting(true);
    setDedupError(null);

    const { result, newGroups, rawIncoming } = dedupState;
    try {
      await commitAccountsAndGroups(({ accounts: currentAccounts, groups: currentGroups }) => {
        let effectiveResult = result;
        let targetGroups = currentGroups;

        if (rawIncoming) {
          const reassigned = assignGroupsByIssuer(currentGroups, rawIncoming);
          targetGroups = reassigned.groups;
          effectiveResult = checkDuplicates(currentAccounts, reassigned.groupedAccounts);
        } else if (newGroups.length > 0) {
          const existingIds = new Set(currentGroups.map((group) => group.id));
          const addedGroups = newGroups.filter((group) => !existingIds.has(group.id));
          if (addedGroups.length > 0) {
            targetGroups = [...currentGroups, ...addedGroups];
          }
        }

        const mergedAccounts =
          mode === "skip"
            ? addAccounts(currentAccounts, skipDuplicates(effectiveResult))
            : overrideDuplicates(currentAccounts, effectiveResult).map((account) =>
                account.updatedAt === undefined
                  ? { ...account, updatedAt: account.createdAt }
                  : account,
              );

        return {
          accounts: mergedAccounts,
          groups: targetGroups,
        };
      });
      setDedupState(null);
    } catch (err) {
      setDedupError(err instanceof Error ? err.message : "保存账户失败，请重试");
    } finally {
      dedupSubmittingRef.current = false;
      setDedupSubmitting(false);
    }
  };

  const handleDedupSkip = async () => {
    await runDedupCommit("skip");
  };

  const handleDedupOverride = async () => {
    await runDedupCommit("override");
  };

  const handleDedupCancel = () => {
    if (dedupSubmittingRef.current) return;
    setDedupError(null);
    setDedupState(null);
  };

  const handleDeleteGroup = async (groupId: string) => {
    try {
      await commitAccountsAndGroups(
        ({ accounts: currentAccounts, groups: currentGroups }) =>
          deleteGroup(currentGroups, currentAccounts, groupId),
        { writeOrder: "accounts-first" },
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : "删除分组失败", "error");
    }
  };

  const handleSaveToAccount = async (account: OTPAccount) => {
    await addNewAccounts([account]);
  };

  const persistAccountsAndGroups = useCallback(
    async (nextAccounts: OTPAccount[], nextGroups: Group[]) => {
      await commitAccountsAndGroups(() => ({
        accounts: nextAccounts,
        groups: nextGroups,
      }));
    },
    [commitAccountsAndGroups],
  );

  const handleGetLatestSnapshot = useCallback(
    async () =>
      await runSerializedAccountWrite(async () => {
        if (!isAccountsLoaded() || !isGroupsLoaded()) {
          throw new Error("账户或分组尚未加载成功，已阻止同步上传，请先重试刷新");
        }
        return {
          accounts: getLatestAccounts(),
          groups: getLatestGroups(),
        };
      }),
    [getLatestAccounts, getLatestGroups, isAccountsLoaded, isGroupsLoaded, runSerializedAccountWrite],
  );

  const handleBatchMoveToGroup = useCallback(
    async (accountIds: string[], groupId: string) => {
      try {
        await commitAccounts(
          (currentAccounts) => {
            if (!isGroupsLoaded()) {
              throw new Error("分组尚未加载成功，已阻止移动操作，请先重试刷新");
            }
            if (!getLatestGroups().some((group) => group.id === groupId)) {
              throw new Error("目标分组已不存在，无法移动账户");
            }
            return moveAccountsToGroup(currentAccounts, accountIds, groupId);
          },
          "批量移动账户失败",
          { rethrow: true },
        );
      } catch (err) {
        showToast(err instanceof Error ? err.message : "批量移动账户失败", "error");
        throw err;
      }
    },
    [commitAccounts, getLatestGroups, isGroupsLoaded, showToast],
  );

  const handleMergeWebDavRemote = useCallback(
    async (remoteAccounts: OTPAccount[], remoteGroups: Group[]) => {
      const committed = await commitAccountsAndGroups(
        ({ accounts: currentAccounts, groups: currentGroups }) =>
          mergeWebDavSyncData(currentAccounts, currentGroups, remoteAccounts, remoteGroups),
      );
      return {
        accounts: committed.accounts,
        groups: committed.groups,
      };
    },
    [commitAccountsAndGroups],
  );

  const handleImportBackup = async (importedAccounts: OTPAccount[], importedGroups: Group[]) => {
    await commitAccountsAndGroups(({ accounts: currentAccounts, groups: currentGroups }) =>
      mergeBackupData(currentAccounts, currentGroups, importedAccounts, importedGroups),
    );
  };

  const handleReorderAccounts = async (reorderedAccounts: OTPAccount[]) => {
    await commitAccounts((currentAccounts) => {
      if (reorderedAccounts.length !== currentAccounts.length) {
        return null;
      }

      const currentById = new Map(currentAccounts.map((account) => [account.id, account]));
      const seenIds = new Set<string>();
      for (const item of reorderedAccounts) {
        if (!currentById.has(item.id) || seenIds.has(item.id)) {
          return null;
        }
        seenIds.add(item.id);
      }
      if (seenIds.size !== currentAccounts.length) {
        return null;
      }

      const now = Date.now();
      return reorderedAccounts.map((item, index) => {
        const current = currentById.get(item.id)!;
        if (current.order === index) {
          return current;
        }
        return {
          ...current,
          order: index,
          updatedAt: now,
        };
      });
    }, "保存账户排序失败");
  };

  const handleNavigate = useCallback((page: Page) => {
    setCurrentPage(page);
    setSelectedAccountIds(new Set());
    setSearchFocusTick(0);
  }, []);

  const handleGroupsUpdated = useCallback(
    async (updatedGroups: Group[]) => {
      await runSerializedAccountWrite(async () => {
        if (!isGroupsLoaded()) {
          throw new Error("分组尚未加载成功，已阻止覆盖写入，请先重试刷新");
        }
        await saveGroups(updatedGroups);
        setGroups(updatedGroups);
      });
    },
    [isGroupsLoaded, runSerializedAccountWrite, setGroups],
  );

  const renderPage = () => {
    switch (currentPage) {
      case "home":
        return (
          <HomePage
            accounts={accounts}
            groups={groups}
            onAccountsAdded={addNewAccounts}
            onGroupsUpdated={handleGroupsUpdated}
            onCommitAutoGroupedAccounts={handleHomeCommitAutoGroupedAccounts}
            onDedupDetected={handleDedupDetected}
            onToast={showToast}
          />
        );
      case "accounts":
        return (
          <AccountPage
            accounts={accounts}
            groups={groups}
            onDelete={deleteAccount}
            onBatchDelete={batchDeleteAccounts}
            onUpdate={editAccount}
            onBatchMoveToGroup={handleBatchMoveToGroup}
            onRefresh={refreshAccounts}
            onReorder={handleReorderAccounts}
            selectedIds={selectedAccountIds}
            onSelectedIdsChange={setSelectedAccountIds}
            searchQuery={accountSearchQuery}
            onSearchQueryChange={handleAccountSearchQueryChange}
            focusSearchTick={searchFocusTick}
          />
        );
      case "groups":
        return (
          <GroupPage
            groups={groups}
            accounts={accounts}
            onCreateGroup={addGroup}
            onRenameGroup={editGroup}
            onDeleteGroup={handleDeleteGroup}
            onDeleteAccount={deleteAccount}
            onUpdateAccount={editAccount}
            focusSearchTick={searchFocusTick}
            onSearchInAllAccounts={handleSearchInAllAccounts}
          />
        );
      case "temp":
        return <TempPanel entries={tempEntries} onEntriesChange={setTempEntries} onSaveToAccount={handleSaveToAccount} />;
      case "sync":
        return (
          <WebDavSyncPanel
            accounts={accounts}
            groups={groups}
            onApplyData={persistAccountsAndGroups}
            onMergeRemoteData={handleMergeWebDavRemote}
            onGetLatestSnapshot={handleGetLatestSnapshot}
            onToast={showToast}
          />
        );
    }
  };

  return (
    <div className="bg-gray-100 dark:bg-gray-900" style={{ minHeight: viewportHeight }}>
      <Sidebar
        currentPage={currentPage}
        onNavigate={handleNavigate}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        viewportHeight={viewportHeight}
        theme={theme}
        onThemeChange={setTheme}
      />
      <main
        className={`${sidebarCollapsed ? "ml-16" : "ml-48"} transition-[margin-left] duration-200 ease-out`}
        style={{ minHeight: viewportHeight }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
            {currentPage === "home" && "首页"}
            {currentPage === "accounts" && "账户管理"}
            {currentPage === "groups" && "分组管理"}
            {currentPage === "temp" && "临时验证"}
            {currentPage === "sync" && "云同步"}
          </h1>
          <div className="flex items-center gap-2">
            <AppUpdateManager onToast={showToast} />
            <BackupPanel
              accounts={accounts}
              groups={groups}
              selectedAccountIds={currentPage === "accounts" ? effectiveSelectedAccountIds : undefined}
              onImport={handleImportBackup}
              onToast={showToast}
            />
          </div>
        </div>
        {error && (
          <div
            role="alert"
            className="mx-4 mt-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-700 dark:text-red-400"
          >
            {error}
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <svg
              className="h-8 w-8 animate-spin text-blue-500"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <span className="ml-3 text-gray-500 dark:text-gray-400">加载中...</span>
          </div>
        ) : (
          renderPage()
        )}
      </main>
      {dedupState && (
        <DedupDialog
          result={dedupState.result}
          submitting={dedupSubmitting}
          error={dedupError}
          onSkip={handleDedupSkip}
          onOverride={handleDedupOverride}
          onCancel={handleDedupCancel}
        />
      )}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

export default App;
