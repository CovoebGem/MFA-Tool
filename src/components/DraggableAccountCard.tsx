import { memo, useMemo, useCallback, type DragEvent } from "react";
import AccountCard from "./AccountCard";
import type { OTPAccount } from "../types";

interface DraggableAccountCardProps {
  account: OTPAccount;
  index: number;
  onDelete: (id: string) => void;
  onUpdate?: (
    id: string,
    updates: Partial<Pick<OTPAccount, "name" | "issuer" | "secret" | "remark">>,
  ) => void;
  groupName?: string;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  isDragging?: boolean;
  onDragStart: (index: number) => void;
  onDragOver: (index: number) => void;
  onDragEnd: () => void;
}

const DraggableAccountCard = memo(function DraggableAccountCard({
  account,
  index,
  onDelete,
  onUpdate,
  groupName,
  selected,
  onToggleSelect,
  isDragging,
  onDragStart,
  onDragOver,
  onDragEnd,
}: DraggableAccountCardProps) {
  const handleDragStart = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(index));
      onDragStart(index);
    },
    [index, onDragStart],
  );

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      onDragOver(index);
    },
    [index, onDragOver],
  );

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      onDragEnd();
    },
    [onDragEnd],
  );

  const dragProps = useMemo(
    () => ({
      draggable: true,
      onDragStart: handleDragStart,
      onDragOver: handleDragOver,
      onDrop: handleDrop,
      onDragEnd,
    }),
    [handleDragStart, handleDragOver, handleDrop, onDragEnd],
  );

  return (
    <AccountCard
      account={account}
      onDelete={onDelete}
      onUpdate={onUpdate}
      groupName={groupName}
      selected={selected}
      onToggleSelect={onToggleSelect}
      isDragging={isDragging}
      showDragHandle
      dragProps={dragProps}
    />
  );
});

export default DraggableAccountCard;
