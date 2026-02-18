import { useEffect, useCallback } from "react";
import AccountCard from "./AccountCard";
import DraggableAccountList from "./DraggableAccountList";
import AccountToolbar from "./AccountToolbar";
import BatchToolbar from "./BatchToolbar";
import SortControls from "./SortControls";
import { sortAccounts, type SortMode } from "../lib/sorter";
import { loadSortConfig, saveSortConfig } from "../lib/preference-store";
import { useState } from "react";
import type { OTPAccount, Group, SortConfig } from "../types";

interface AccountPageProps {
  accounts: OTPAccount[];
  groups: Group[];
  onDelete: (id: string) => void;
  onUpdate?: (id: string, updates: Partial<Pick<OTPAccount, "name" | "issuer" | "secret">>) => void;
  onBatchMoveToGroup: (accountIds: string[], groupId: string) => void;
  onRefresh: () => Promise<void>;
  onReorder?: (accounts: OTPAccount[]) => void;
  selectedIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
}

function getGroupName(groups: Group[], groupId: string): string {
  const group = groups.find((g) => g.id === groupId);
  return group ? group.name : "未知分组";
}

export default function AccountPage({
  accounts,
  groups,
  onDelete,
  onUpdate,
  onBatchMoveToGroup,
  onRefresh,
  onReorder,
  selectedIds,
  onSelectedIdsChange,
}: AccountPageProps) {
  const [sortConfig, setSortConfig] = useState<SortConfig>(loadSortConfig);
  const [sortMode, setSortMode] = useState<SortMode>("auto");

  const handleSortChange = useCallback((config: SortConfig) => {
    setSortConfig(config);
    saveSortConfig(config);
  }, []);

  const handleSortModeChange = useCallback((mode: SortMode) => {
    setSortMode(mode);
    if (mode === "custom") {
      onSelectedIdsChange(new Set());
    }
  }, [onSelectedIdsChange]);

  const sortedAccounts = sortAccounts(accounts, sortConfig, sortMode);

  useEffect(() => {
    onSelectedIdsChange(new Set());
  }, [accounts]);

  const toggleSelect = useCallback((id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedIdsChange(next);
  }, [selectedIds, onSelectedIdsChange]);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === sortedAccounts.length) {
      onSelectedIdsChange(new Set());
    } else {
      onSelectedIdsChange(new Set(sortedAccounts.map((a) => a.id)));
    }
  }, [selectedIds.size, sortedAccounts, onSelectedIdsChange]);

  const clearSelection = useCallback(() => onSelectedIdsChange(new Set()), [onSelectedIdsChange]);

  const handleBatchMove = useCallback(
    (groupId: string) => {
      onBatchMoveToGroup(Array.from(selectedIds), groupId);
      clearSelection();
    },
    [selectedIds, onBatchMoveToGroup, clearSelection],
  );

  const handleReorder = useCallback((reorderedAccounts: OTPAccount[]) => {
    if (onReorder) {
      onReorder(reorderedAccounts);
    }
  }, [onReorder]);

  return (
    <div className="space-y-4 px-4 pt-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
          全部账户（{accounts.length}）
        </h2>
        <div className="flex items-center gap-3">
          {sortMode === "auto" && (
            <>
              <AccountToolbar
                accounts={accounts}
                selectedIds={selectedIds}
                onDelete={onDelete}
                onRefresh={onRefresh}
                onToggleSelectAll={toggleSelectAll}
                onClearSelection={clearSelection}
              />
              <SortControls config={sortConfig} onChange={handleSortChange} />
            </>
          )}
          <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-700 rounded-lg">
            <button
              type="button"
              onClick={() => handleSortModeChange("auto")}
              className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${
                sortMode === "auto"
                  ? "bg-white dark:bg-gray-600 shadow-sm text-blue-600 dark:text-blue-400"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              }`}
            >
              自动排序
            </button>
            <button
              type="button"
              onClick={() => handleSortModeChange("custom")}
              className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${
                sortMode === "custom"
                  ? "bg-white dark:bg-gray-600 shadow-sm text-blue-600 dark:text-blue-400"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              }`}
            >
              拖拽排序
            </button>
          </div>
        </div>
      </div>

      {sortedAccounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
          <svg
            className="w-16 h-16 mb-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
            />
          </svg>
          <p className="text-base font-medium mb-1">暂无账户</p>
          <p className="text-sm">请前往首页导入或手动添加</p>
        </div>
      ) : sortMode === "custom" ? (
        <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">
          拖拽卡片以调整顺序
        </div>
      ) : null}

      {sortedAccounts.length > 0 && sortMode === "custom" ? (
        <DraggableAccountList
          accounts={sortedAccounts}
          onDelete={onDelete}
          onReorder={handleReorder}
        />
      ) : sortedAccounts.length > 0 ? (
        <>
          {selectedIds.size > 0 && (
            <BatchToolbar
              selectedCount={selectedIds.size}
              groups={groups}
              onMove={handleBatchMove}
              onClearSelection={clearSelection}
            />
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sortedAccounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                onDelete={onDelete}
                onUpdate={onUpdate}
                groupName={getGroupName(groups, account.groupId)}
                selected={selectedIds.has(account.id)}
                onToggleSelect={toggleSelect}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
