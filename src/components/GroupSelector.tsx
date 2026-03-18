import type { Group, OTPAccount } from "../types";

interface GroupSelectorProps {
  groups: Group[];
  selectedGroupId: string | null;
  onSelect: (groupId: string) => void;
  accounts?: OTPAccount[];
}

export default function GroupSelector({
  groups,
  selectedGroupId,
  onSelect,
  accounts,
}: GroupSelectorProps) {
  const getAccountCount = (groupId: string): number => {
    if (!accounts) return -1;
    return accounts.filter((a) => a.groupId === groupId).length;
  };

  const formatOption = (group: Group): string => {
    const count = getAccountCount(group.id);
    if (count < 0) return group.name;
    return `${group.name} (${count})`;
  };

  return (
    <select
      value={selectedGroupId ?? ""}
      onChange={(e) => onSelect(e.target.value)}
      aria-label="选择分组"
      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
    >
      <option value="" disabled>
        选择分组
      </option>
      {groups.map((group) => (
        <option key={group.id} value={group.id}>
          {formatOption(group)}
        </option>
      ))}
    </select>
  );
}
