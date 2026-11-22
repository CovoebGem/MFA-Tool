import { useState, useEffect, useRef } from "react";
import { CheckSquare, FolderInput, Loader2, MinusSquare, Pin, PinOff, RefreshCw, Square, Trash2, X } from "lucide-react";
import { isAccountPinned } from "../lib/sorter";
import { cn } from "../lib/utils";
import type { Group, OTPAccount } from "../types";

export interface AccountToolbarProps {
  accounts: OTPAccount[];
  groups?: Group[];
  selectedIds: Set<string>;
  onDelete: (id: string) => void;
  onBatchDelete?: (ids: string[]) => Promise<void> | void;
  onBatchSetPinned?: (accountIds: string[], pinned: boolean) => Promise<void> | void;
  onBatchMoveToGroup?: (accountIds: string[], groupId: string) => Promise<void> | void;
  onRefresh: () => Promise<void>;
  onToggleSelectAll: () => void;
  onClearSelection: () => void;
}

export default function AccountToolbar({
  accounts,
  groups,
  selectedIds,
  onDelete,
  onBatchDelete,
  onBatchSetPinned,
  onBatchMoveToGroup,
  onRefresh,
  onToggleSelectAll,
  onClearSelection,
}: AccountToolbarProps) {
  const hasAccounts = accounts.length > 0;
  const hasSelection = selectedIds.size > 0;
  const selectedVisibleAccounts = accounts.filter((account) => selectedIds.has(account.id));
  const selectedVisibleCount = selectedVisibleAccounts.length;
  const allVisibleSelected = hasAccounts && accounts.every((account) => selectedIds.has(account.id));
  const allSelectedPinned =
    selectedVisibleCount > 0 && selectedVisibleAccounts.every(isAccountPinned);
  const selectionState = allVisibleSelected
    ? "all"
    : selectedVisibleCount > 0
      ? "partial"
      : "none";

  const [pinning, setPinning] = useState(false);
  const [moving, setMoving] = useState(false);
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const moveMenuContainerRef = useRef<HTMLDivElement | null>(null);

  const moveMenuOpen = showMoveMenu && hasSelection && !moving;

  useEffect(() => {
    if (!refreshError) return;
    const timer = setTimeout(() => setRefreshError(null), 3000);
    return () => clearTimeout(timer);
  }, [refreshError]);

  useEffect(() => {
    if (!moveMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (
        moveMenuContainerRef.current &&
        !moveMenuContainerRef.current.contains(event.target as Node)
      ) {
        setShowMoveMenu(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowMoveMenu(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [moveMenuOpen]);

  const handleTogglePin = async () => {
    if (!hasSelection || !onBatchSetPinned || pinning) {
      return;
    }
    setPinning(true);
    try {
      await onBatchSetPinned(Array.from(selectedIds), !allSelectedPinned);
      onClearSelection();
    } catch {
      // 保存失败时保留选中状态，错误提示由上层负责
    } finally {
      setPinning(false);
    }
  };

  const handleMoveToGroup = async (groupId: string) => {
    if (!hasSelection || !onBatchMoveToGroup || moving) {
      return;
    }
    setMoving(true);
    setShowMoveMenu(false);
    try {
      await onBatchMoveToGroup(Array.from(selectedIds), groupId);
      onClearSelection();
    } catch {
      // 移动失败时保留选中状态，错误提示由上层负责
    } finally {
      setMoving(false);
    }
  };

  const handleDelete = async () => {
    if (selectedIds.size === 0) {
      alert("请先选择要删除的账户");
      return;
    }
    const confirmed = window.confirm(
      `确定要删除选中的 ${selectedIds.size} 个账户吗？`,
    );
    if (!confirmed) return;
    setDeleting(true);
    try {
      if (onBatchDelete) {
        await onBatchDelete(Array.from(selectedIds));
      } else {
        for (const id of selectedIds) {
          onDelete(id);
        }
      }
      onClearSelection();
    } catch {
      // 保存失败时保留选择状态，错误提示由上层状态管理
    } finally {
      setDeleting(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      await onRefresh();
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : "刷新失败");
    } finally {
      setRefreshing(false);
    }
  };

  const iconBtnBase =
    "relative group inline-flex size-8 items-center justify-center rounded-lg border transition-[color,background-color,border-color,transform] duration-150 active:scale-[0.97] cursor-pointer";
  const iconBtnNormal =
    "border-border bg-card text-muted-foreground shadow-2xs hover:bg-accent hover:text-foreground";
  const iconBtnDisabled =
    "border-border/70 bg-muted text-muted-foreground/50 cursor-not-allowed active:scale-100";

  const pinActionLabel = allSelectedPinned ? "取消置顶" : "置顶";
  const canPin = hasSelection && !pinning && Boolean(onBatchSetPinned);
  const canMove =
    hasSelection &&
    !moving &&
    Boolean(onBatchMoveToGroup) &&
    Boolean(groups && groups.length > 0);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {hasSelection && (
        <div className="inline-flex h-8 items-center gap-1 rounded-lg border border-primary/25 bg-primary/8 px-2 text-xs font-medium text-primary tabular-nums">
          <span>已选 {selectedIds.size}</span>
          <button
            type="button"
            onClick={onClearSelection}
            aria-label="取消选择"
            title="取消选择"
            className="inline-flex size-4 items-center justify-center rounded hover:bg-primary/15 cursor-pointer"
          >
            <X className="size-3" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* 置顶 / 取消置顶 */}
      {hasAccounts && (
        <button
          type="button"
          aria-label={pinActionLabel}
          title={!hasSelection ? "选择账户后可置顶" : pinActionLabel}
          onClick={() => void handleTogglePin()}
          disabled={!canPin}
          className={cn(
            iconBtnBase,
            !canPin
              ? iconBtnDisabled
              : allSelectedPinned
                ? "border-pin/40 bg-pin-surface text-pin-foreground hover:bg-pin/15"
                : iconBtnNormal,
          )}
        >
          {pinning ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : allSelectedPinned ? (
            <PinOff className="size-4" aria-hidden="true" />
          ) : (
            <Pin className="size-4" aria-hidden="true" />
          )}
          <span className="pointer-events-none absolute -bottom-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-0.5 text-[11px] font-medium text-popover-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
            {pinActionLabel}
          </span>
        </button>
      )}

      {/* 移动到分组 */}
      {hasAccounts && (
        <div ref={moveMenuContainerRef} className="relative">
          <button
            type="button"
            aria-label="移动到分组"
            aria-haspopup="menu"
            aria-expanded={moveMenuOpen}
            title={!hasSelection ? "选择账户后可移动分组" : "移动到分组"}
            onClick={() => canMove && setShowMoveMenu((prev) => !prev)}
            disabled={!canMove}
            className={cn(iconBtnBase, !canMove ? iconBtnDisabled : iconBtnNormal)}
          >
            {moving ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <FolderInput className="size-4" aria-hidden="true" />
            )}
            <span className="pointer-events-none absolute -bottom-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-0.5 text-[11px] font-medium text-popover-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
              移动
            </span>
          </button>

          {moveMenuOpen && groups && (
            <div
              role="menu"
              aria-label="选择目标分组"
              className="absolute right-0 top-full z-30 mt-2 w-52 overflow-hidden rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg"
            >
              <div className="px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground">
                移动 {selectedIds.size} 个账户到分组
              </div>
              <div className="max-h-60 overflow-y-auto">
                {groups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    role="menuitem"
                    onClick={() => void handleMoveToGroup(group.id)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer"
                  >
                    <span className="truncate">{group.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 删除 */}
      {hasAccounts && (
        <button
          type="button"
          aria-label="删除"
          title="删除"
          onClick={() => void handleDelete()}
          disabled={deleting}
          className={cn(
            iconBtnBase,
            deleting
              ? iconBtnDisabled
              : "border-border bg-card text-muted-foreground shadow-2xs hover:border-destructive/40 hover:bg-destructive-surface hover:text-destructive-foreground",
          )}
        >
          <Trash2 className="size-4" aria-hidden="true" />
          <span className="pointer-events-none absolute -bottom-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-0.5 text-[11px] font-medium text-popover-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
            删除
          </span>
        </button>
      )}

      {/* 刷新 */}
      <button
        type="button"
        aria-label="刷新"
        title="刷新"
        onClick={() => void handleRefresh()}
        disabled={refreshing}
        className={cn(iconBtnBase, refreshing ? iconBtnDisabled : iconBtnNormal)}
      >
        <RefreshCw
          className={cn("size-4", refreshing && "animate-spin")}
          aria-hidden="true"
        />
        <span className="pointer-events-none absolute -bottom-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-0.5 text-[11px] font-medium text-popover-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
          刷新
        </span>
      </button>

      {/* 全选 */}
      {hasAccounts && (
        <button
          type="button"
          aria-label="全选"
          title={allVisibleSelected ? "取消全选" : "全选"}
          data-selection-state={selectionState}
          onClick={onToggleSelectAll}
          className={cn(
            iconBtnBase,
            selectionState === "all"
              ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"
              : selectionState === "partial"
                ? "border-primary/25 bg-card text-primary hover:bg-accent"
                : iconBtnNormal,
          )}
        >
          {selectionState === "all" ? (
            <CheckSquare className="size-4" aria-hidden="true" />
          ) : selectionState === "partial" ? (
            <MinusSquare className="size-4" aria-hidden="true" />
          ) : (
            <Square className="size-4" aria-hidden="true" />
          )}
          <span className="pointer-events-none absolute -bottom-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-0.5 text-[11px] font-medium text-popover-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
            {allVisibleSelected ? "取消全选" : "全选"}
          </span>
        </button>
      )}

      {refreshError && (
        <span className="ml-1 inline-flex items-center gap-1 text-xs font-medium text-destructive-foreground" role="alert">
          <X className="size-3.5" aria-hidden="true" />
          {refreshError}
        </span>
      )}
    </div>
  );
}
