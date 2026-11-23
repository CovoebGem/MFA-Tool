import { memo, useMemo, useCallback, type HTMLAttributes, type PointerEvent } from "react";
import AccountCard from "./AccountCard";
import type { OTPAccount } from "../types";

interface DraggableAccountCardProps {
  account: OTPAccount;
  onDelete: (id: string) => void;
  onUpdate?: (
    id: string,
    updates: Partial<Pick<OTPAccount, "name" | "issuer" | "secret" | "remark">>,
  ) => void;
  groupName?: string;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  isDragging?: boolean;
  dragEnabled?: boolean;
  dragPlaceholderCount?: number;
  onDragPointerDown?: (accountId: string, e: PointerEvent<HTMLDivElement>) => void;
}

const DraggableAccountCard = memo(function DraggableAccountCard({
  account,
  onDelete,
  onUpdate,
  groupName,
  selected,
  onToggleSelect,
  isDragging = false,
  dragEnabled = true,
  dragPlaceholderCount,
  onDragPointerDown,
}: DraggableAccountCardProps) {
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
    <AccountCard
      account={account}
      onDelete={onDelete}
      onUpdate={onUpdate}
      groupName={groupName}
      selected={selected}
      onToggleSelect={onToggleSelect}
      isDragging={isDragging}
      showDragHandle={dragEnabled}
      dragPlaceholderCount={dragPlaceholderCount}
      dragProps={dragProps}
    />
  );
});

export default DraggableAccountCard;
