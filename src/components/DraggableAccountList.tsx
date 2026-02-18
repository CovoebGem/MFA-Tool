import { useState, useCallback } from "react";
import DraggableAccountCard from "./DraggableAccountCard";
import type { OTPAccount } from "../types";

interface DraggableAccountListProps {
  accounts: OTPAccount[];
  onDelete: (id: string) => void;
  onReorder: (accounts: OTPAccount[]) => void;
}

export default function DraggableAccountList({ accounts, onDelete, onReorder }: DraggableAccountListProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index);
  }, []);

  const handleDragOver = useCallback((index: number) => {
    if (dragIndex !== null && dragIndex !== index) {
      setOverIndex(index);
    }
  }, [dragIndex]);

  const handleDragEnd = useCallback(() => {
    if (dragIndex !== null && overIndex !== null && dragIndex !== overIndex) {
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

  if (accounts.length === 0) {
    return (
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
        <p className="text-sm">请上传二维码或手动添加</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {accounts.map((account, index) => (
        <DraggableAccountCard
          key={account.id}
          account={account}
          index={index}
          onDelete={onDelete}
          isDragging={dragIndex === index}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        />
      ))}
    </div>
  );
}
