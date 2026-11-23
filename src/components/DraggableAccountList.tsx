import {
  memo,
  useCallback,
  useMemo,
  useRef,
  type HTMLAttributes,
  type PointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { LockKeyhole, Pin } from "lucide-react";
import AccountCard from "./AccountCard";
import DraggableAccountCard from "./DraggableAccountCard";
import AccountListRow, { AccountListTable } from "./AccountListRow";
import { Badge } from "./ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "./ui/empty";
import { useSortableDrag } from "../hooks/useSortableDrag";
import { buildGroupNameMap } from "../lib/account-search";
import {
  DEFAULT_CARD_LAYOUT_CONFIG,
  getCardScale,
} from "../lib/preference-store";
import { isAccountPinned } from "../lib/sorter";
import { cn } from "../lib/utils";
import { useOptionalI18n } from "../contexts/I18nContext";
import type {
  AccountViewMode,
  CardLayoutConfig,
  Group,
  OTPAccount,
} from "../types";

const noopDelete = () => {};
const noopReorder = () => {};

interface DraggableAccountListProps {
  accounts: OTPAccount[];
  groups?: Group[];
  viewMode?: AccountViewMode;
  cardLayout?: CardLayoutConfig;
  dragEnabled?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate?: (
    id: string,
    updates: Partial<Pick<OTPAccount, "name" | "issuer" | "secret" | "remark">>,
  ) => void;
  onReorder?: (accounts: OTPAccount[]) => void;
}

interface DraggableAccountRowProps {
  account: OTPAccount;
  onDelete: (id: string) => void;
  onUpdate?: (
    id: string,
    updates: Partial<Pick<OTPAccount, "name" | "issuer" | "secret" | "remark">>,
  ) => void;
  groupName?: string;
  showGroupColumn: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  isDragging?: boolean;
  dragEnabled?: boolean;
  dragPlaceholderCount?: number;
  onDragPointerDown?: (accountId: string, e: PointerEvent<HTMLDivElement>) => void;
}

const DraggableAccountRow = memo(function DraggableAccountRow({
  account,
  onDelete,
  onUpdate,
  groupName,
  showGroupColumn,
  selected,
  onToggleSelect,
  isDragging = false,
  dragEnabled = true,
  dragPlaceholderCount,
  onDragPointerDown,
}: DraggableAccountRowProps) {
  const handlePointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      onDragPointerDown?.(account.id, e);
    },
    [account.id, onDragPointerDown],
  );

  const dragProps = useMemo<HTMLAttributes<HTMLDivElement> | undefined>(() => {
    if (!dragEnabled) {
      return undefined;
    }
    return {
      "data-sortable-id": account.id,
      onPointerDown: handlePointerDown,
    } as HTMLAttributes<HTMLDivElement>;
  }, [account.id, dragEnabled, handlePointerDown]);

  return (
    <AccountListRow
      account={account}
      onDelete={onDelete}
      onUpdate={onUpdate}
      groupName={groupName}
      showGroupColumn={showGroupColumn}
      selected={selected}
      onToggleSelect={onToggleSelect}
      isDragging={isDragging}
      showDragHandle={dragEnabled}
      dragPlaceholderCount={dragPlaceholderCount}
      dragProps={dragProps}
    />
  );
});

export default memo(function DraggableAccountList({
  accounts,
  groups,
  viewMode = "grid",
  cardLayout = DEFAULT_CARD_LAYOUT_CONFIG,
  dragEnabled = true,
  selectedIds,
  onToggleSelect,
  onDelete,
  onUpdate,
  onReorder,
}: DraggableAccountListProps) {
  const { t } = useOptionalI18n();
  const listContainerRef = useRef<HTMLDivElement | null>(null);
  const effectiveDragEnabled = dragEnabled && Boolean(onReorder);

  const {
    orderedItems,
    activeDrag,
    draggingId,
    overlayRef,
    handleItemPointerDown,
  } = useSortableDrag({
    items: accounts,
    enabled: effectiveDragEnabled,
    viewMode,
    containerRef: listContainerRef,
    selectedIds,
    onReorder: onReorder ?? noopReorder,
  });

  const groupNameById = useMemo(
    () => (groups ? buildGroupNameMap(groups) : null),
    [groups],
  );

  const { pinnedAccounts, otherAccounts } = useMemo(() => {
    const pinned: OTPAccount[] = [];
    const other: OTPAccount[] = [];
    for (const account of orderedItems) {
      if (isAccountPinned(account)) {
        pinned.push(account);
      } else {
        other.push(account);
      }
    }
    return { pinnedAccounts: pinned, otherAccounts: other };
  }, [orderedItems]);

  const cardScale = useMemo(
    () => getCardScale(cardLayout.cardMinWidth),
    [cardLayout.cardMinWidth],
  );
  const cardGridStyle = useMemo(
    () => ({
      gridTemplateColumns: `repeat(auto-fill, minmax(${cardLayout.cardMinWidth}px, 1fr))`,
      gap: `${cardLayout.cardGap}px`,
    }),
    [cardLayout.cardGap, cardLayout.cardMinWidth],
  );

  if (orderedItems.length === 0) {
    return (
      <Empty className="py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LockKeyhole aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>暂无账户</EmptyTitle>
          <EmptyDescription>请上传二维码或手动添加</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const renderSectionContent = (items: OTPAccount[]) => {
    if (viewMode === "list") {
      return (
        <AccountListTable showGroupColumn={Boolean(groups)}>
          {items.map((account) => (
            <DraggableAccountRow
              key={account.id}
              account={account}
              onDelete={onDelete}
              onUpdate={onUpdate}
              groupName={groupNameById ? (groupNameById.get(account.groupId) ?? "未知分组") : undefined}
              showGroupColumn={Boolean(groups)}
              selected={selectedIds ? selectedIds.has(account.id) : undefined}
              onToggleSelect={onToggleSelect}
              isDragging={draggingId === account.id}
              dragEnabled={effectiveDragEnabled}
              dragPlaceholderCount={
                draggingId === account.id && !activeDrag?.settling
                  ? activeDrag?.draggedCount
                  : undefined
              }
              onDragPointerDown={handleItemPointerDown}
            />
          ))}
        </AccountListTable>
      );
    }

    return (
      <div className="grid" style={cardGridStyle} data-card-scale={cardScale}>
        {items.map((account) => (
          <DraggableAccountCard
            key={account.id}
            account={account}
            onDelete={onDelete}
            onUpdate={onUpdate}
            groupName={groupNameById ? (groupNameById.get(account.groupId) ?? "未知分组") : undefined}
            selected={selectedIds ? selectedIds.has(account.id) : undefined}
            onToggleSelect={onToggleSelect}
            isDragging={draggingId === account.id}
            dragEnabled={effectiveDragEnabled}
            dragPlaceholderCount={
              draggingId === account.id && !activeDrag?.settling
                ? activeDrag?.draggedCount
                : undefined
            }
            onDragPointerDown={handleItemPointerDown}
          />
        ))}
      </div>
    );
  };

  const overlayPortal =
    activeDrag && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={overlayRef}
            data-slot="drag-overlay"
            data-drag-forbidden={activeDrag.forbidden ? "true" : "false"}
            data-drag-count={activeDrag.draggedCount}
            style={{
              width: `${activeDrag.width}px`,
              height: `${activeDrag.height}px`,
            }}
            className="fixed left-0 top-0 z-50 pointer-events-none will-change-transform"
          >
            {activeDrag.draggedCount >= 3 && (
              <div
                data-slot="drag-stack-layer"
                aria-hidden="true"
                className={cn(
                  "pointer-events-none absolute inset-0 rounded-xl border border-border/70 bg-card/85 shadow-md transition-[transform,opacity] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transform-none",
                  activeDrag.settling
                    ? "translate-0 scale-100 opacity-0"
                    : viewMode === "list"
                      ? "translate-y-2 scale-[0.985] opacity-75"
                      : "translate-x-2.5 translate-y-2.5 rotate-[1.4deg] opacity-75",
                )}
              />
            )}
            {activeDrag.draggedCount >= 2 && (
              <div
                data-slot="drag-stack-layer"
                aria-hidden="true"
                className={cn(
                  "pointer-events-none absolute inset-0 rounded-xl border border-border/80 bg-card/95 shadow-lg transition-[transform,opacity] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transform-none",
                  activeDrag.settling
                    ? "translate-0 scale-100 opacity-0"
                    : viewMode === "list"
                      ? "translate-y-1 scale-[0.992] opacity-90"
                      : "translate-x-1.5 translate-y-1.5 rotate-[0.8deg] opacity-90",
                )}
              />
            )}
            <div
              data-card-scale={viewMode === "grid" ? cardScale : undefined}
              className={cn(
                "relative h-full w-full rounded-xl transition-[transform,box-shadow] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transform-none",
                activeDrag.settling
                  ? "scale-100 rotate-0 shadow-xs"
                  : viewMode === "list"
                    ? "scale-[1.01] shadow-xl overflow-hidden border border-border bg-card"
                    : "scale-[1.03] rotate-[0.6deg] shadow-2xl",
                activeDrag.forbidden
                  ? "ring-2 ring-destructive/50"
                  : "ring-2 ring-primary/40",
              )}
            >
              {viewMode === "list" ? (
                <AccountListRow
                  account={activeDrag.account}
                  onDelete={noopDelete}
                  groupName={
                    groupNameById
                      ? (groupNameById.get(activeDrag.account.groupId) ?? "未知分组")
                      : undefined
                  }
                  showGroupColumn={Boolean(groups)}
                  selected={selectedIds ? selectedIds.has(activeDrag.account.id) : undefined}
                  onToggleSelect={onToggleSelect}
                  showDragHandle
                  isDragOverlay
                />
              ) : (
                <AccountCard
                  account={activeDrag.account}
                  onDelete={noopDelete}
                  groupName={
                    groupNameById
                      ? (groupNameById.get(activeDrag.account.groupId) ?? "未知分组")
                      : undefined
                  }
                  selected={selectedIds ? selectedIds.has(activeDrag.account.id) : undefined}
                  onToggleSelect={onToggleSelect}
                  showDragHandle
                  isDragOverlay
                />
              )}
            </div>
            {activeDrag.draggedCount > 1 && (
              <span
                data-slot="drag-count-badge"
                className={cn(
                  "pointer-events-none absolute -top-2 -right-2 z-20 inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-bold tabular-nums shadow-md ring-2 ring-background transition-[transform,opacity,background-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]",
                  activeDrag.forbidden
                    ? "bg-destructive text-white"
                    : "bg-primary text-primary-foreground",
                  activeDrag.settling ? "scale-75 opacity-0" : "scale-100 opacity-100",
                )}
              >
                {activeDrag.draggedCount}
              </span>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={listContainerRef} className="flex flex-col gap-4">
      {pinnedAccounts.length > 0 ? (
        <div className="flex flex-col gap-6">
          <section
            data-sortable-section="pinned"
            aria-label={t("accounts.pinnedSection")}
            className="flex flex-col gap-3"
          >
            <div className="flex items-center gap-2">
              <Pin className="size-3.5 text-pin shrink-0" aria-hidden="true" />
              <span className="text-xs font-semibold text-muted-foreground">
                {t("accounts.pinnedSection")}
              </span>
              <Badge variant="secondary">{pinnedAccounts.length}</Badge>
              <div className="h-px flex-1 bg-border/60" aria-hidden="true" />
            </div>
            {renderSectionContent(pinnedAccounts)}
          </section>

          {otherAccounts.length > 0 && (
            <section
              data-sortable-section="other"
              aria-label={t("accounts.otherSection")}
              className="flex flex-col gap-3"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground">
                  {t("accounts.otherSection")}
                </span>
                <Badge variant="secondary">{otherAccounts.length}</Badge>
                <div className="h-px flex-1 bg-border/60" aria-hidden="true" />
              </div>
              {renderSectionContent(otherAccounts)}
            </section>
          )}
        </div>
      ) : (
        renderSectionContent(orderedItems)
      )}
      {overlayPortal}
    </div>
  );
});
