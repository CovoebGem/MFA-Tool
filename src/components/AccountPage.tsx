import { useState, useEffect, useRef, useCallback } from "react";
import AccountCard from "./AccountCard";
import BatchToolbar from "./BatchToolbar";
import SortControls from "./SortControls";
import { sortAccounts } from "../lib/sorter";
import { loadSortConfig, saveSortConfig } from "../lib/preference-store";
import type { OTPAccount, Group, SortConfig } from "../types";

interface AccountPageProps {
  accounts: OTPAccount[];
  groups: Group[];
  onDelete: (id: string) => void;
  onBatchMoveToGroup: (accountIds: string[], groupId: string) => void;
}

function getGroupName(groups: Group[], groupId: string): string {
  const group = groups.find((g) => g.id === groupId);
  return group ? group.name : "未知分组";
}

export default function AccountPage({
  accounts,
  groups,
  onDelete,
  onBatchMoveToGroup,
}: AccountPageProps) {
  const [sortConfig, setSortConfig] = useState<SortConfig>(loadSortConfig);

  const handleSortChange = useCallback((config: SortConfig) => {
    setSortConfig(config);
    saveSortConfig(config);
  }, []);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectAllRef = useRef<HTMLInputElement>(null);

  const sortedAccounts = sortAccounts(accounts, sortConfig);

  // 账户列表变更时清空选择状态
  useEffect(() => {
    setSelectedIds(new Set());
  }, [accounts]);

  // 同步全选 checkbox 的 indeterminate 状态
  useEffect(() => {
    if (selectAllRef.current) {
      const allSelected = sortedAccounts.length > 0 && selectedIds.size === sortedAccounts.length;
      const someSelected = selectedIds.size > 0 && selectedIds.size < sortedAccounts.length;
      selectAllRef.current.indeterminate = someSelected;
      selectAllRef.current.checked = allSelected;
    }
  }, [selectedIds, sortedAccounts.length]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === sortedAccounts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedAccounts.map((a) => a.id)));
    }
  }, [selectedIds.size, sortedAccounts]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const handleBatchMove = useCallback(
    (groupId: string) => {
      onBatchMoveToGroup(Array.from(selectedIds), groupId);
      clearSelection();
    },
    [selectedIds, onBatchMoveToGroup, clearSelection],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">
          全部账户（{accounts.length}）
        </h2>
        <SortControls config={sortConfig} onChange={handleSortChange} />
      </div>

      {sortedAccounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
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
      ) : (
        <>
          {/* 批量操作栏 */}
          {selectedIds.size > 0 && (
            <BatchToolbar
              selectedCount={selectedIds.size}
              groups={groups}
              onMove={handleBatchMove}
              onClearSelection={clearSelection}
            />
          )}

          {/* 全选 checkbox */}
          <div className="flex items-center gap-2 px-1">
            <input
              ref={selectAllRef}
              type="checkbox"
              onChange={toggleSelectAll}
              aria-label="全选账户"
              className="w-4 h-4 accent-blue-600 cursor-pointer"
            />
            <span className="text-sm text-gray-600">全选</span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sortedAccounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                onDelete={onDelete}
                groupName={getGroupName(groups, account.groupId)}
                selected={selectedIds.has(account.id)}
                onToggleSelect={toggleSelect}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
