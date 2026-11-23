import {
  memo,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { LockKeyhole, SearchX } from "lucide-react";
import DraggableAccountList from "./DraggableAccountList";
import AccountToolbar from "./AccountToolbar";
import SortControls from "./SortControls";
import ViewModeToggle from "./ViewModeToggle";
import CardLayoutControl from "./CardLayoutControl";
import AccountSearchBar, { getSearchShortcutHint } from "./AccountSearchBar";
import MarqueeSelectionBox from "./MarqueeSelectionBox";
import { useMarqueeSelection } from "../hooks/useMarqueeSelection";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./ui/empty";
import { sortAccounts } from "../lib/sorter";
import {
  loadCardLayoutConfig,
  loadSortConfig,
  loadSortMode,
  loadViewMode,
  normalizeCardLayoutConfig,
  saveCardLayoutConfig,
  saveSortConfig,
  saveSortMode,
  saveViewMode,
} from "../lib/preference-store";
import {
  buildGroupNameMap,
  filterAccountsByQuery,
  normalizeSearchQuery,
} from "../lib/account-search";
import { useOptionalI18n } from "../contexts/I18nContext";
import type {
  AccountViewMode,
  CardLayoutConfig,
  OTPAccount,
  Group,
  SortConfig,
  SortMode,
} from "../types";

interface AccountPageProps {
  accounts: OTPAccount[];
  groups: Group[];
  onDelete: (id: string) => void;
  onBatchDelete?: (ids: string[]) => Promise<void> | void;
  onUpdate?: (
    id: string,
    updates: Partial<Pick<OTPAccount, "name" | "issuer" | "secret" | "remark">>,
  ) => void;
  onBatchSetPinned?: (accountIds: string[], pinned: boolean) => Promise<void> | void;
  onBatchMoveToGroup: (accountIds: string[], groupId: string) => Promise<void> | void;
  onRefresh: () => Promise<void>;
  onReorder?: (accounts: OTPAccount[]) => void;
  selectedIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  focusSearchTick?: number;
  cardLayout?: CardLayoutConfig;
  onCardLayoutChange?: (config: CardLayoutConfig) => void;
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

export default memo(function AccountPage({
  accounts,
  groups,
  onDelete,
  onBatchDelete,
  onUpdate,
  onBatchSetPinned,
  onBatchMoveToGroup,
  onRefresh,
  onReorder,
  selectedIds,
  onSelectedIdsChange,
  searchQuery,
  onSearchQueryChange,
  focusSearchTick,
  cardLayout,
  onCardLayoutChange,
}: AccountPageProps) {
  const { t } = useOptionalI18n();
  const [sortConfig, setSortConfig] = useState<SortConfig>(loadSortConfig);
  const [sortMode, setSortMode] = useState<SortMode>(loadSortMode);
  const [viewMode, setViewMode] = useState<AccountViewMode>(loadViewMode);
  const [internalCardLayout, setInternalCardLayout] = useState<CardLayoutConfig>(
    loadCardLayoutConfig,
  );
  const [internalSearchQuery, setInternalSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const isControlledCardLayout =
    cardLayout !== undefined && onCardLayoutChange !== undefined;
  const effectiveCardLayout = isControlledCardLayout
    ? cardLayout
    : internalCardLayout;
  const handleCardLayoutChange = useCallback(
    (nextConfig: CardLayoutConfig) => {
      const normalized = normalizeCardLayoutConfig(nextConfig);
      if (isControlledCardLayout) {
        onCardLayoutChange(normalized);
      } else {
        setInternalCardLayout(normalized);
        saveCardLayoutConfig(normalized);
      }
    },
    [isControlledCardLayout, onCardLayoutChange],
  );

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
    setSortMode("auto");
    saveSortMode("auto");
  }, []);

  const handleViewModeChange = useCallback((mode: AccountViewMode) => {
    setViewMode(mode);
    saveViewMode(mode);
  }, []);

  const handleSortModeChange = useCallback((mode: SortMode) => {
    setSortMode(mode);
    saveSortMode(mode);
  }, []);

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

  const effectiveSelectedIdsRef = useRef(effectiveSelectedIds);
  const visibleIdSetRef = useRef(visibleIdSet);
  useLayoutEffect(() => {
    effectiveSelectedIdsRef.current = effectiveSelectedIds;
    visibleIdSetRef.current = visibleIdSet;
  }, [effectiveSelectedIds, visibleIdSet]);

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

  const toggleSelect = useCallback(
    (id: string) => {
      if (!visibleIdSetRef.current.has(id)) {
        return;
      }
      const next = new Set(effectiveSelectedIdsRef.current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      onSelectedIdsChange(next);
    },
    [onSelectedIdsChange],
  );

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

  const handleReorder = useCallback(
    (reorderedAccounts: OTPAccount[]) => {
      if (hasActiveQuery || !onReorder) {
        return;
      }
      onReorder(reorderedAccounts);
      setSortMode("custom");
      saveSortMode("custom");
    },
    [hasActiveQuery, onReorder],
  );

  const shortcutHint = useMemo(() => getSearchShortcutHint(), []);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const { overlayRef, handleMouseDown } = useMarqueeSelection({
    containerRef,
    enabled: visibleAccounts.length > 0,
    selectedIds: effectiveSelectedIds,
    visibleIdSet,
    onSelectionChange: onSelectedIdsChange,
  });

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      className="flex flex-1 flex-col gap-5 px-6 py-5"
    >
      {/* 标题行与视图/布局设置 */}
      <div
        data-no-marquee="true"
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          {hasActiveQuery
            ? `全部账户（${visibleAccounts.length} / ${accounts.length}）`
            : `全部账户（${accounts.length}）`}
        </h2>

        <div className="flex flex-wrap items-center gap-2">
          <ViewModeToggle value={viewMode} onChange={handleViewModeChange} />
          <CardLayoutControl
            config={effectiveCardLayout}
            onChange={handleCardLayoutChange}
            viewMode={viewMode}
          />
        </div>
      </div>

      {/* ReUI 统一控制栏（搜索、排序含自定义、置顶、移动到分组、删除、刷新、全选） */}
      <div
        data-no-marquee="true"
        className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-2xs md:flex-row md:items-center md:justify-between"
      >
        {accounts.length > 0 && (
          <div className="min-w-0 flex-1">
            <AccountSearchBar
              value={effectiveSearchQuery}
              onChange={updateSearchQuery}
              onClear={handleClearSearch}
              inputRef={searchInputRef}
              shortcutHint={shortcutHint}
              compact
            />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <SortControls
            config={sortConfig}
            onChange={handleSortChange}
            sortMode={sortMode}
            onSortModeChange={handleSortModeChange}
          />
          <Separator orientation="vertical" className="hidden h-6 sm:block" />
          <AccountToolbar
            accounts={visibleAccounts}
            groups={groups}
            selectedIds={effectiveSelectedIds}
            onDelete={onDelete}
            onBatchDelete={onBatchDelete}
            onBatchSetPinned={onBatchSetPinned}
            onBatchMoveToGroup={onBatchMoveToGroup}
            onRefresh={onRefresh}
            onToggleSelectAll={toggleSelectAll}
            onClearSelection={clearSelection}
          />
        </div>
      </div>

      {accounts.length === 0 ? (
        <Empty className="py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LockKeyhole aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>暂无账户</EmptyTitle>
            <EmptyDescription>请前往首页导入或手动添加</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : visibleAccounts.length === 0 ? (
        <Empty className="py-14">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchX aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>
              未找到匹配「{effectiveSearchQuery.trim()}」的账户
            </EmptyTitle>
            <EmptyDescription>
              可尝试按服务商、账户名称、备注或分组名称搜索
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                handleClearSearch();
                searchInputRef.current?.focus();
              }}
            >
              {t("accounts.clearSearch")}
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <DraggableAccountList
          accounts={visibleAccounts}
          groups={groups}
          viewMode={viewMode}
          cardLayout={effectiveCardLayout}
          dragEnabled={!hasActiveQuery && Boolean(onReorder)}
          selectedIds={effectiveSelectedIds}
          onToggleSelect={toggleSelect}
          onDelete={onDelete}
          onUpdate={onUpdate}
          onReorder={handleReorder}
        />
      )}
      <MarqueeSelectionBox overlayRef={overlayRef} />
    </div>
  );
});
