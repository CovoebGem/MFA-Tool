import {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { FolderOpen, Pin, SearchX, Settings2, Trash2 } from "lucide-react";
import AccountCard from "./AccountCard";
import AccountListRow, { AccountListTable } from "./AccountListRow";
import AccountToolbar from "./AccountToolbar";
import GroupSelector from "./GroupSelector";
import GroupManagerPanel from "./GroupManagerPanel";
import SortControls from "./SortControls";
import ViewModeToggle from "./ViewModeToggle";
import CardLayoutControl from "./CardLayoutControl";
import AccountSearchBar, { getSearchShortcutHint } from "./AccountSearchBar";
import MarqueeSelectionBox from "./MarqueeSelectionBox";
import { useMarqueeSelection } from "../hooks/useMarqueeSelection";
import { Badge } from "./ui/badge";
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
import { DEFAULT_GROUP_ID, filterByGroup } from "../lib/group-manager";
import { isAccountPinned, sortAccounts } from "../lib/sorter";
import {
  getCardScale,
  loadCardLayoutConfig,
  loadSortConfig,
  loadViewMode,
  normalizeCardLayoutConfig,
  saveCardLayoutConfig,
  saveSortConfig,
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
} from "../types";

const noopRefresh = async () => {};

interface GroupPageProps {
  groups: Group[];
  accounts: OTPAccount[];
  onCreateGroup: (name: string) => Promise<void> | void;
  onRenameGroup: (groupId: string, newName: string) => Promise<void> | void;
  onDeleteGroup: (groupId: string) => Promise<void> | void;
  onDeleteAccount: (id: string) => void;
  onBatchDelete?: (ids: string[]) => Promise<void> | void;
  onUpdateAccount?: (
    id: string,
    updates: Partial<Pick<OTPAccount, "name" | "issuer" | "secret" | "remark">>,
  ) => void;
  onBatchSetPinned?: (accountIds: string[], pinned: boolean) => Promise<void> | void;
  onBatchMoveToGroup?: (accountIds: string[], groupId: string) => Promise<void> | void;
  onRefresh?: () => Promise<void>;
  selectedIds?: Set<string>;
  onSelectedIdsChange?: (ids: Set<string>) => void;
  focusSearchTick?: number;
  onSearchInAllAccounts?: (query: string) => void;
  cardLayout?: CardLayoutConfig;
  onCardLayoutChange?: (config: CardLayoutConfig) => void;
}

export default function GroupPage({
  groups,
  accounts,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onDeleteAccount,
  onBatchDelete,
  onUpdateAccount,
  onBatchSetPinned,
  onBatchMoveToGroup,
  onRefresh,
  selectedIds,
  onSelectedIdsChange,
  focusSearchTick,
  onSearchInAllAccounts,
  cardLayout,
  onCardLayoutChange,
}: GroupPageProps) {
  const { t } = useOptionalI18n();
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [showManager, setShowManager] = useState(false);
  const [pendingDeleteGroup, setPendingDeleteGroup] = useState<Group | null>(null);
  const [deletingGroup, setDeletingGroup] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig>(loadSortConfig);
  const [viewMode, setViewMode] = useState<AccountViewMode>(loadViewMode);
  const [internalCardLayout, setInternalCardLayout] = useState<CardLayoutConfig>(
    loadCardLayoutConfig,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [internalSelectedIds, setInternalSelectedIds] = useState<Set<string>>(
    () => new Set(),
  );
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

  const cardScale = useMemo(
    () => getCardScale(effectiveCardLayout.cardMinWidth),
    [effectiveCardLayout.cardMinWidth],
  );
  const cardGridStyle = useMemo(
    () => ({
      gridTemplateColumns: `repeat(auto-fill, minmax(${effectiveCardLayout.cardMinWidth}px, 1fr))`,
      gap: `${effectiveCardLayout.cardGap}px`,
    }),
    [effectiveCardLayout.cardGap, effectiveCardLayout.cardMinWidth],
  );

  const isControlledSelection =
    selectedIds !== undefined && onSelectedIdsChange !== undefined;
  const currentSelectedIds = isControlledSelection
    ? selectedIds
    : internalSelectedIds;
  const updateSelectedIds = useCallback(
    (next: Set<string>) => {
      if (isControlledSelection) {
        onSelectedIdsChange(next);
      } else {
        setInternalSelectedIds(next);
      }
    },
    [isControlledSelection, onSelectedIdsChange],
  );

  const handleSortChange = useCallback((config: SortConfig) => {
    setSortConfig(config);
    saveSortConfig(config);
  }, []);

  const handleViewModeChange = useCallback((mode: AccountViewMode) => {
    setViewMode(mode);
    saveViewMode(mode);
  }, []);

  // 默认选中第一个分组
  useEffect(() => {
    if (groups.length > 0 && !selectedGroupId) {
      setSelectedGroupId(groups[0].id);
    }
    if (selectedGroupId && !groups.find((g) => g.id === selectedGroupId)) {
      setSelectedGroupId(groups.length > 0 ? groups[0].id : null);
    }
  }, [groups, selectedGroupId]);

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
      const active = document.activeElement as HTMLElement | null;
      if (
        active &&
        active !== searchInputRef.current &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          active.tagName === "SELECT" ||
          active.isContentEditable)
      ) {
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

  useEffect(() => {
    if (!pendingDeleteGroup) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !deletingGroup) {
        setPendingDeleteGroup(null);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [pendingDeleteGroup, deletingGroup]);

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) ?? null,
    [groups, selectedGroupId],
  );

  const defaultGroup = useMemo(
    () => groups.find((group) => group.isDefault || group.id === DEFAULT_GROUP_ID) ?? null,
    [groups],
  );

  const isSelectedDefault =
    !selectedGroup || selectedGroup.isDefault || selectedGroup.id === DEFAULT_GROUP_ID;

  const groupNameById = useMemo(() => buildGroupNameMap(groups), [groups]);
  const hasActiveQuery = normalizeSearchQuery(searchQuery) !== "";

  const filteredAccounts = useMemo(
    () => (selectedGroupId ? filterByGroup(accounts, selectedGroupId) : []),
    [accounts, selectedGroupId],
  );

  const selectedAccounts = useMemo(
    () => sortAccounts(filteredAccounts, sortConfig),
    [filteredAccounts, sortConfig],
  );

  const visibleAccounts = useMemo(
    () => filterAccountsByQuery(selectedAccounts, searchQuery, groupNameById),
    [selectedAccounts, searchQuery, groupNameById],
  );

  const visibleIdSet = useMemo(
    () => new Set(visibleAccounts.map((account) => account.id)),
    [visibleAccounts],
  );

  const effectiveSelectedIds = useMemo(() => {
    if (currentSelectedIds.size === 0) {
      return currentSelectedIds;
    }
    let changed = false;
    const next = new Set<string>();
    for (const id of currentSelectedIds) {
      if (visibleIdSet.has(id)) {
        next.add(id);
      } else {
        changed = true;
      }
    }
    return changed ? next : currentSelectedIds;
  }, [currentSelectedIds, visibleIdSet]);

  const effectiveSelectedIdsRef = useRef(effectiveSelectedIds);
  const visibleIdSetRef = useRef(visibleIdSet);
  useLayoutEffect(() => {
    effectiveSelectedIdsRef.current = effectiveSelectedIds;
    visibleIdSetRef.current = visibleIdSet;
  }, [effectiveSelectedIds, visibleIdSet]);

  useEffect(() => {
    if (effectiveSelectedIds !== currentSelectedIds) {
      updateSelectedIds(effectiveSelectedIds);
    }
  }, [effectiveSelectedIds, currentSelectedIds, updateSelectedIds]);

  const clearSelection = useCallback(() => {
    updateSelectedIds(new Set());
  }, [updateSelectedIds]);

  const handleSelectGroup = useCallback(
    (groupId: string | null) => {
      if (groupId !== selectedGroupId) {
        clearSelection();
      }
      setSelectedGroupId(groupId);
    },
    [clearSelection, selectedGroupId],
  );

  const updateSearchQuery = useCallback(
    (nextQuery: string) => {
      if (normalizeSearchQuery(nextQuery) !== normalizeSearchQuery(searchQuery)) {
        clearSelection();
      }
      setSearchQuery(nextQuery);
    },
    [clearSelection, searchQuery],
  );

  const handleClearSearch = useCallback(() => {
    updateSearchQuery("");
  }, [updateSearchQuery]);

  const toggleSelect = useCallback(
    (id: string) => {
      if (!visibleIdSetRef.current.has(id)) {
        return;
      }
      const next = new Set(effectiveSelectedIdsRef.current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      updateSelectedIds(next);
    },
    [updateSelectedIds],
  );

  const toggleSelectAll = useCallback(() => {
    const allVisibleSelected =
      visibleAccounts.length > 0 &&
      visibleAccounts.every((account) => effectiveSelectedIds.has(account.id));

    if (allVisibleSelected) {
      updateSelectedIds(new Set());
    } else {
      updateSelectedIds(new Set(visibleAccounts.map((account) => account.id)));
    }
  }, [effectiveSelectedIds, updateSelectedIds, visibleAccounts]);

  const { pinnedVisible, otherVisible } = useMemo(() => {
    const pinned: OTPAccount[] = [];
    const other: OTPAccount[] = [];
    for (const account of visibleAccounts) {
      if (isAccountPinned(account)) {
        pinned.push(account);
      } else {
        other.push(account);
      }
    }
    return { pinnedVisible: pinned, otherVisible: other };
  }, [visibleAccounts]);

  const globalMatchesCount = useMemo(() => {
    if (!hasActiveQuery || visibleAccounts.length > 0) {
      return 0;
    }
    return filterAccountsByQuery(accounts, searchQuery, groupNameById).length;
  }, [accounts, groupNameById, hasActiveQuery, searchQuery, visibleAccounts.length]);

  const shortcutHint = useMemo(() => getSearchShortcutHint(), []);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const { overlayRef, handleMouseDown } = useMarqueeSelection({
    containerRef,
    enabled: Boolean(selectedGroupId) && visibleAccounts.length > 0,
    selectedIds: effectiveSelectedIds,
    visibleIdSet,
    onSelectionChange: updateSelectedIds,
  });

  const handleConfirmDeleteGroup = async () => {
    if (!pendingDeleteGroup || deletingGroup) {
      return;
    }
    setDeletingGroup(true);
    try {
      await onDeleteGroup(pendingDeleteGroup.id);
      setPendingDeleteGroup(null);
      handleSelectGroup(defaultGroup?.id ?? null);
    } finally {
      setDeletingGroup(false);
    }
  };

  const renderAccountsView = (items: OTPAccount[]) => {
    if (viewMode === "list") {
      return (
        <AccountListTable showGroupColumn={false}>
          {items.map((account) => (
            <AccountListRow
              key={account.id}
              account={account}
              showGroupColumn={false}
              onDelete={onDeleteAccount}
              onUpdate={onUpdateAccount}
              selected={effectiveSelectedIds.has(account.id)}
              onToggleSelect={toggleSelect}
            />
          ))}
        </AccountListTable>
      );
    }

    return (
      <div className="grid" style={cardGridStyle} data-card-scale={cardScale}>
        {items.map((account) => (
          <AccountCard
            key={account.id}
            account={account}
            onDelete={onDeleteAccount}
            onUpdate={onUpdateAccount}
            selected={effectiveSelectedIds.has(account.id)}
            onToggleSelect={toggleSelect}
          />
        ))}
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      className="flex flex-1 flex-col gap-5 px-6 py-5"
    >
      <div
        data-no-marquee="true"
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <h2 className="text-lg font-semibold tracking-tight text-foreground">分组管理</h2>
        <div className="flex flex-wrap items-center gap-2">
          <ViewModeToggle value={viewMode} onChange={handleViewModeChange} />
          <CardLayoutControl
            config={effectiveCardLayout}
            onChange={handleCardLayoutChange}
            viewMode={viewMode}
          />
        </div>
      </div>

      {/* ReUI 统一分组工具栏 */}
      <div
        data-no-marquee="true"
        className="flex flex-wrap items-center gap-2.5 rounded-xl border border-border bg-card p-3 shadow-2xs"
      >
        <div className="w-52 shrink-0">
          <GroupSelector
            groups={groups}
            selectedGroupId={selectedGroupId}
            onSelect={handleSelectGroup}
            accounts={accounts}
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setShowManager(true)}
          aria-label="打开分组管理"
          title="分组管理"
          className="shrink-0"
        >
          <Settings2 className="size-4" aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={isSelectedDefault || deletingGroup}
          onClick={() => selectedGroup && setPendingDeleteGroup(selectedGroup)}
          aria-label="删除当前分组"
          title={
            isSelectedDefault
              ? "默认分组不可删除"
              : "删除当前分组（组内账户将自动移入默认分组）"
          }
          className="shrink-0 text-muted-foreground hover:border-destructive/40 hover:bg-destructive-surface hover:text-destructive-foreground disabled:pointer-events-none disabled:opacity-50"
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
          <span>删除分组</span>
        </Button>

        {selectedGroupId && accounts.length > 0 && (
          <div className="order-last min-w-[220px] flex-1 basis-full lg:order-none lg:basis-auto">
            <AccountSearchBar
              value={searchQuery}
              onChange={updateSearchQuery}
              onClear={handleClearSearch}
              inputRef={searchInputRef}
              shortcutHint={shortcutHint}
              compact
            />
          </div>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Separator orientation="vertical" className="hidden h-6 sm:block" />
          <SortControls config={sortConfig} onChange={handleSortChange} />
          <Separator orientation="vertical" className="hidden h-6 sm:block" />
          <AccountToolbar
            accounts={visibleAccounts}
            groups={groups}
            selectedIds={effectiveSelectedIds}
            onDelete={onDeleteAccount}
            onBatchDelete={onBatchDelete}
            onBatchSetPinned={onBatchSetPinned}
            onBatchMoveToGroup={onBatchMoveToGroup}
            onRefresh={onRefresh ?? noopRefresh}
            onToggleSelectAll={toggleSelectAll}
            onClearSelection={clearSelection}
          />
        </div>
      </div>

      {/* 删除当前分组确认弹窗 */}
      {pendingDeleteGroup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          role="dialog"
          aria-modal="true"
          aria-label="确认删除分组"
        >
          <div
            className="absolute inset-0 bg-black/45 backdrop-blur-xs"
            onClick={() => !deletingGroup && setPendingDeleteGroup(null)}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-2xl">
            <h3 className="text-base font-semibold text-foreground">删除分组</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {selectedAccounts.length > 0
                ? `确定要删除分组「${pendingDeleteGroup.name}」吗？该分组下的 ${selectedAccounts.length} 个账户将自动移入「${defaultGroup?.name ?? "默认"}」分组，不会丢失。`
                : `确定要删除分组「${pendingDeleteGroup.name}」吗？`}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPendingDeleteGroup(null)}
                disabled={deletingGroup}
              >
                取消
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => void handleConfirmDeleteGroup()}
                disabled={deletingGroup}
              >
                {deletingGroup ? "删除中..." : "确认删除"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 分组管理面板 */}
      {showManager && (
        <GroupManagerPanel
          groups={groups}
          accounts={accounts}
          onCreateGroup={onCreateGroup}
          onRenameGroup={onRenameGroup}
          onDeleteGroup={onDeleteGroup}
          onClose={() => setShowManager(false)}
        />
      )}

      {/* 账户视图 */}
      {selectedGroupId ? (
        selectedAccounts.length === 0 && !hasActiveQuery ? (
          <Empty className="py-16">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FolderOpen aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>该分组下暂无账户</EmptyTitle>
              <EmptyDescription>可将账户移动至此分组</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : visibleAccounts.length === 0 ? (
          <Empty className="py-14">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchX aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>
                未找到匹配「{searchQuery.trim()}」的账户
              </EmptyTitle>
            </EmptyHeader>
            <EmptyContent>
              {globalMatchesCount > 0 && onSearchInAllAccounts && (
                <Button
                  size="sm"
                  onClick={() => onSearchInAllAccounts(searchQuery)}
                >
                  在全部账户中查看 {globalMatchesCount} 个结果
                </Button>
              )}
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
        ) : pinnedVisible.length > 0 ? (
          <div className="flex flex-col gap-6">
            <section aria-label={t("accounts.pinnedSection")} className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Pin className="size-3.5 text-pin shrink-0" aria-hidden="true" />
                <span className="text-xs font-semibold text-muted-foreground">
                  {t("accounts.pinnedSection")}
                </span>
                <Badge variant="secondary">{pinnedVisible.length}</Badge>
                <div className="h-px flex-1 bg-border/60" aria-hidden="true" />
              </div>
              {renderAccountsView(pinnedVisible)}
            </section>

            {otherVisible.length > 0 && (
              <section aria-label={t("accounts.otherSection")} className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {t("accounts.otherSection")}
                  </span>
                  <Badge variant="secondary">{otherVisible.length}</Badge>
                  <div className="h-px flex-1 bg-border/60" aria-hidden="true" />
                </div>
                {renderAccountsView(otherVisible)}
              </section>
            )}
          </div>
        ) : (
          renderAccountsView(visibleAccounts)
        )
      ) : (
        <Empty className="py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderOpen aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>暂无分组</EmptyTitle>
            <EmptyDescription>请先创建一个分组</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      <MarqueeSelectionBox overlayRef={overlayRef} />
    </div>
  );
}
