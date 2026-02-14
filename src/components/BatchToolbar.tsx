import { useState } from "react";
import type { Group } from "../types";

interface BatchToolbarProps {
  selectedCount: number;
  groups: Group[];
  onMove: (groupId: string) => void;
  onClearSelection: () => void;
}

export default function BatchToolbar({
  selectedCount,
  groups,
  onMove,
  onClearSelection,
}: BatchToolbarProps) {
  const [targetGroupId, setTargetGroupId] = useState("");

  const handleMove = () => {
    if (targetGroupId) {
      onMove(targetGroupId);
      setTargetGroupId("");
    }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg">
      <span className="text-sm font-medium text-blue-700">
        已选择 {selectedCount} 个账户
      </span>

      <select
        value={targetGroupId}
        onChange={(e) => setTargetGroupId(e.target.value)}
        aria-label="选择目标分组"
        className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
      >
        <option value="" disabled>
          选择目标分组
        </option>
        {groups.map((group) => (
          <option key={group.id} value={group.id}>
            {group.name}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={handleMove}
        disabled={!targetGroupId}
        aria-label="批量移动"
        className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        批量移动
      </button>

      <button
        type="button"
        onClick={onClearSelection}
        aria-label="取消选择"
        className="px-3 py-1.5 text-sm text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
      >
        取消选择
      </button>
    </div>
  );
}
