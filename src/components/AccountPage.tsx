import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import AccountCard from "./AccountCard";
import DraggableAccountList from "./DraggableAccountList";
import AccountToolbar from "./AccountToolbar";
import BatchToolbar from "./BatchToolbar";
import SortControls from "./SortControls";
import AccountSearchBar, { getSearchShortcutHint } from "./AccountSearchBar";
import { sortAccounts, type SortMode } from "../lib/sorter";
import { loadSortConfig, saveSortConfig } from "../lib/preference-store";
import {
  buildGroupNameMap,
  filterAccountsByQuery,
  normalizeSearchQuery,
} from "../lib/account-search";
import { useOptionalI18n } from "../contexts/I18nContext";
import type { OTPAccount, Group, SortConfig } from "../types";

interface AccountPageProps {
  accounts: OTPAccount[];
  groups: Group[];
  onDelete: (id: string) => void;
  onBatchDelete?: (ids: string[]) => Promise<void> | void;
  onUpdate?: (id: string, updates: Partial<Pick<OTPAccount, "name" | "issuer" | "secret">>) => void;
  onBatchMoveToGroup: (accountIds: string[], groupId: string) => Promise<void> | void;
  onRefresh: () => Promise<void>;
  onReorder?: (accounts: OTPAccount[]) => void;
  selectedIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  focusSearchTick?: number;
}

function getGroupName(groups: Group[], groupId: string): string {
  const group = groups.find((g) => g.id === groupId);
  return group ? group.name : "未知分组";
}

function isEditableElement(element: Element | null, allowedElement: HTMLElement | null): boolean {
  if (!element || element === allowedElement) {
    return false;
  }
  const htmlEl = element as HTMLElement;
  return (
    htmlEl.tagName === "INPUT" ||
    htmlEl.tagName === "TEXTAREA" ||
    htmlEl.tagName === "SELECT" ||
    htmlEl.isContentEditable
  );
}

export default function AccountPage({
  accounts,
  groups,
  onDelete,
  onBatchDelete,
  onUpdate,
  onBatchMoveToGroup,
  onRefresh,
  onReorder,
  selectedIds,
  onSelectedIdsChange,
  searchQuery,
  onSearchQueryChange,
  focusSearchTick,
}: AccountPageProps) {
  const { t } = useOptionalI18n();
  const [sortConfig, setSortConfig] = useState<SortConfig>(loadSortConfig);
  const [sortMode, setSortMode] = useState<SortMode>("auto");
  const [internalSearchQuery, setInternalSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const effectiveSearchQuery = searchQuery ?? internalSearchQuery;
  const hasActiveQuery = normalizeSearchQuery(effectiveSearchQuery) !== "";

  const updateSearchQuery = useCallback(
    (nextQuery: string) => {
      if (normalizeSearchQuery(nextQuery) !== normalizeSearchQuery(effectiveSearchQuery)) {
        onSelectedIdsChange(new Set());
      }
      if (onSearchQueryChange) {
        onSearchQueryChange(nextQuery);
      } else {
        setInternalSearchQuery(nextQuery);
      }
    },
    [effectiveSearchQuery, onSearchQueryChange, onSelectedIdsChange],
  );

  const handleClearSearch = useCallback(() => {
    updateSearchQuery("");
  }, [updateSearchQuery]);

  const handleSortChange = useCallback((config: SortConfig) => {
    setSortConfig(config);
    saveSortConfig(config);
  }, []);

  const handleSortModeChange = useCallback((mode: SortMode) => {
    if (mode === "custom" && hasActiveQuery) {
      return;
    }
    setSortMode(mode);
    if (mode === "custom") {
      onSelectedIdsChange(new Set());
    }
  }, [hasActiveQuery, onSelectedIdsChange]);

  const groupNameById = useMemo(() => buildGroupNameMap(groups), [groups]);

  const sortedAccounts = useMemo(
    () => sortAccounts(accounts, sortConfig, sortMode),
    [accounts, sortConfig, sortMode],
  );

  const visibleAccounts = useMemo(
    () => filterAccountsByQuery(sortedAccounts, effectiveSearchQuery, groupNameById),
    [sortedAccounts, effectiveSearchQuery, groupNameById],
  );

  const visibleIdSet = useMemo(
    () => new Set(visibleAccounts.map((account) => account.id)),
    [visibleAccounts],
  );

  const effectiveSelectedIds = useMemo(() => {
    if (selectedIds.size === 0) {
      return selectedIds;
    }
    let changed = false;
    const next = new Set<string>();
    for (const id of selectedIds) {
      if (visibleIdSet.has(id)) {
        next.add(id);
      } else {
        changed = true;
      }
    }
    return changed ? next : selectedIds;
  }, [selectedIds, visibleIdSet]);

  useEffect(() => {
    if (effectiveSelectedIds !== selectedIds) {
      onSelectedIdsChange(effectiveSelectedIds);
    }
  }, [effectiveSelectedIds, selectedIds, onSelectedIdsChange]);

  useEffect(() => {
    if (!focusSearchTick) {
      return;
    }
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }, [focusSearchTick]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.isComposing ||
        event.keyCode === 229 ||
        event.altKey ||
        event.shiftKey ||
        !(event.ctrlKey || event.metaKey) ||
        event.key.toLowerCase() !== "f"
      ) {
        return;
      }
      if (document.querySelector('[role="dialog"], [aria-modal="true"]')) {
        return;
      }
      if (isEditableElement(document.activeElement, searchInputRef.current)) {
        return;
      }
      if (!searchInputRef.current) {
        return;
      }

      event.preventDefault();
      searchInputRef.current.focus();
      searchInputRef.current.select();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const toggleSelect = useCallback((id: string) => {
    if (!visibleIdSet.has(id)) {
      return;
    }
    const next = new Set(effectiveSelectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedIdsChange(next);
  }, [effectiveSelectedIds, onSelectedIdsChange, visibleIdSet]);

  const toggleSelectAll = useCallback(() => {
    const allVisibleSelected =
      visibleAccounts.length > 0 &&
      visibleAccounts.every((account) => effectiveSelectedIds.has(account.id));

    if (allVisibleSelected) {
      onSelectedIdsChange(new Set());
    } else {
      onSelectedIdsChange(new Set(visibleAccounts.map((account) => account.id)));
    }
  }, [effectiveSelectedIds, onSelectedIdsChange, visibleAccounts]);

  const clearSelection = useCallback(() => onSelectedIdsChange(new Set()), [onSelectedIdsChange]);

  const handleBatchMove = useCallback(
    async (groupId: string) => {
      try {
        await onBatchMoveToGroup(Array.from(effectiveSelectedIds), groupId);
        clearSelection();
      } catch {
        // 移动保存失败时保留当前选择
      }
    },
    [effectiveSelectedIds, onBatchMoveToGroup, clearSelection],
  );

  const handleReorder = useCallback((reorderedAccounts: OTPAccount[]) => {
    if (hasActiveQuery || !onReorder) {
      return;
    }
    onReorder(reorderedAccounts);
  }, [hasActiveQuery, onReorder]);

  const isCustomMode = sortMode === "custom";
  const showInteractiveDragList = isCustomMode && !hasActiveQuery;
  const shortcutHint = useMemo(() => getSearchShortcutHint(), []);

  return (
    <div className="space-y-4 px-4 pt-4 pb-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
          {hasActiveQuery
            ? `全部账户（${visibleAccounts.length} / ${accounts.length}）`
            : `全部账户（${accounts.length}）`}
        </h2>
        <div className="flex items-center gap-3">
          {sortMode === "auto" && (
            <>
              <AccountToolbar
                accounts={visibleAccounts}
                allAccounts={accounts}
                selectedIds={effectiveSelectedIds}
                onDelete={onDelete}
                onBatchDelete={onBatchDelete}
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
              disabled={hasActiveQuery}
              title={hasActiveQuery ? t("accounts.dragDisabledHint") : undefined}
              onClick={() => handleSortModeChange("custom")}
              className={`px-2 py-1 text-xs font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
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

      {accounts.length > 0 && (
        <AccountSearchBar
          value={effectiveSearchQuery}
          onChange={updateSearchQuery}
          onClear={handleClearSearch}
          inputRef={searchInputRef}
          shortcutHint={shortcutHint}
        />
      )}

      {accounts.length === 0 ? (
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
      ) : visibleAccounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 dark:border-gray-700 bg-white/70 dark:bg-gray-800/40 py-14 px-4 text-center">
          <p className="text-base font-medium text-gray-700 dark:text-gray-200">
            未找到匹配「{effectiveSearchQuery.trim()}」的账户
          </p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            可尝试按服务商、账户名称或分组名称搜索
          </p>
          <button
            type="button"
            onClick={() => {
              handleClearSearch();
              searchInputRef.current?.focus();
            }}
            className="mt-4 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
          >
            {t("accounts.clearSearch")}
          </button>
        </div>
      ) : isCustomMode ? (
        <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">
          {hasActiveQuery ? t("accounts.dragDisabledHint") : "拖拽卡片以调整顺序"}
        </div>
      ) : null}

      {visibleAccounts.length > 0 && showInteractiveDragList ? (
        <DraggableAccountList
          accounts={visibleAccounts}
          groups={groups}
          onDelete={onDelete}
          onUpdate={onUpdate}
          onReorder={handleReorder}
        />
      ) : visibleAccounts.length > 0 ? (
        <>
          {!isCustomMode && effectiveSelectedIds.size > 0 && (
            <BatchToolbar
              selectedCount={effectiveSelectedIds.size}
              groups={groups}
              onMove={handleBatchMove}
              onClearSelection={clearSelection}
            />
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleAccounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                onDelete={onDelete}
                onUpdate={onUpdate}
                groupName={getGroupName(groups, account.groupId)}
                selected={!isCustomMode ? effectiveSelectedIds.has(account.id) : undefined}
                onToggleSelect={!isCustomMode ? toggleSelect : undefined}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
