import { useState, useCallback, useMemo, type DragEvent } from "react";
import { LockKeyhole, Pin } from "lucide-react";
import DraggableAccountCard from "./DraggableAccountCard";
import AccountListRow, { AccountListTable } from "./AccountListRow";
import { Badge } from "./ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "./ui/empty";
import { buildGroupNameMap } from "../lib/account-search";
import {
  DEFAULT_CARD_LAYOUT_CONFIG,
  getCardScale,
} from "../lib/preference-store";
import { isAccountPinned } from "../lib/sorter";
import { useOptionalI18n } from "../contexts/I18nContext";
import type {
  AccountViewMode,
  CardLayoutConfig,
  Group,
  OTPAccount,
} from "../types";

interface DraggableAccountListProps {
  accounts: OTPAccount[];
  groups?: Group[];
  viewMode?: AccountViewMode;
  cardLayout?: CardLayoutConfig;
  onDelete: (id: string) => void;
  onUpdate?: (
    id: string,
    updates: Partial<Pick<OTPAccount, "name" | "issuer" | "secret" | "remark">>,
  ) => void;
  onReorder: (accounts: OTPAccount[]) => void;
}

export default function DraggableAccountList({
  accounts,
  groups,
  viewMode = "grid",
  cardLayout = DEFAULT_CARD_LAYOUT_CONFIG,
  onDelete,
  onUpdate,
  onReorder,
}: DraggableAccountListProps) {
  const { t } = useOptionalI18n();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const groupNameById = useMemo(
    () => (groups ? buildGroupNameMap(groups) : null),
    [groups],
  );

  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index);
  }, []);

  const handleDragOver = useCallback(
    (index: number) => {
      if (
        dragIndex !== null &&
        dragIndex !== index &&
        accounts[dragIndex] &&
        accounts[index] &&
        isAccountPinned(accounts[dragIndex]) === isAccountPinned(accounts[index])
      ) {
        setOverIndex(index);
      }
    },
    [accounts, dragIndex],
  );

  const handleDragEnd = useCallback(() => {
    if (
      dragIndex !== null &&
      overIndex !== null &&
      dragIndex !== overIndex &&
      accounts[dragIndex] &&
      accounts[overIndex] &&
      isAccountPinned(accounts[dragIndex]) === isAccountPinned(accounts[overIndex])
    ) {
      const result = [...accounts];
      const [moved] = result.splice(dragIndex, 1);
      result.splice(overIndex, 0, moved);

      const reordered = result.map((account, index) => ({
        ...account,
        order: index,
      }));

      onReorder(reordered);
    }
    setDragIndex(null);
    setOverIndex(null);
  }, [dragIndex, overIndex, accounts, onReorder]);

  const { pinnedEntries, otherEntries } = useMemo(() => {
    const pinned: Array<{ account: OTPAccount; index: number }> = [];
    const other: Array<{ account: OTPAccount; index: number }> = [];
    accounts.forEach((account, index) => {
      if (isAccountPinned(account)) {
        pinned.push({ account, index });
      } else {
        other.push({ account, index });
      }
    });
    return { pinnedEntries: pinned, otherEntries: other };
  }, [accounts]);

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

  if (accounts.length === 0) {
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

  const renderSectionContent = (entries: Array<{ account: OTPAccount; index: number }>) => {
    if (viewMode === "list") {
      return (
        <AccountListTable showGroupColumn={Boolean(groups)}>
          {entries.map(({ account, index }) => (
            <AccountListRow
              key={account.id}
              account={account}
              onDelete={onDelete}
              onUpdate={onUpdate}
              groupName={groupNameById ? (groupNameById.get(account.groupId) ?? "未知分组") : undefined}
              showGroupColumn={Boolean(groups)}
              isDragging={dragIndex === index}
              showDragHandle
              dragProps={{
                draggable: true,
                onDragStart: (e: DragEvent<HTMLDivElement>) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", String(index));
                  handleDragStart(index);
                },
                onDragOver: (e: DragEvent<HTMLDivElement>) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  handleDragOver(index);
                },
                onDrop: (e: DragEvent<HTMLDivElement>) => {
                  e.preventDefault();
                  handleDragEnd();
                },
                onDragEnd: handleDragEnd,
              }}
            />
          ))}
        </AccountListTable>
      );
    }

    return (
      <div className="grid" style={cardGridStyle} data-card-scale={cardScale}>
        {entries.map(({ account, index }) => (
          <DraggableAccountCard
            key={account.id}
            account={account}
            index={index}
            onDelete={onDelete}
            onUpdate={onUpdate}
            groupName={groupNameById ? (groupNameById.get(account.groupId) ?? "未知分组") : undefined}
            isDragging={dragIndex === index}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          />
        ))}
      </div>
    );
  };

  if (pinnedEntries.length > 0 && otherEntries.length > 0) {
    return (
      <div className="flex flex-col gap-6">
        <section aria-label={t("accounts.pinnedSection")} className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Pin className="size-3.5 text-pin shrink-0" aria-hidden="true" />
            <span className="text-xs font-semibold text-muted-foreground">
              {t("accounts.pinnedSection")}
            </span>
            <Badge variant="secondary">{pinnedEntries.length}</Badge>
            <div className="h-px flex-1 bg-border/60" aria-hidden="true" />
          </div>
          {renderSectionContent(pinnedEntries)}
        </section>

        <section aria-label={t("accounts.otherSection")} className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">
              {t("accounts.otherSection")}
            </span>
            <Badge variant="secondary">{otherEntries.length}</Badge>
            <div className="h-px flex-1 bg-border/60" aria-hidden="true" />
          </div>
          {renderSectionContent(otherEntries)}
        </section>
      </div>
    );
  }

  return renderSectionContent(accounts.map((account, index) => ({ account, index })));
}
