import { useState, useEffect, useCallback } from "react";
import AccountCard from "./AccountCard";
import GroupSelector from "./GroupSelector";
import GroupManagerPanel from "./GroupManagerPanel";
import SortControls from "./SortControls";
import { filterByGroup } from "../lib/group-manager";
import { sortAccounts } from "../lib/sorter";
import { loadSortConfig, saveSortConfig } from "../lib/preference-store";
import type { OTPAccount, Group, SortConfig } from "../types";

interface GroupPageProps {
  groups: Group[];
  accounts: OTPAccount[];
  onCreateGroup: (name: string) => void;
  onRenameGroup: (groupId: string, newName: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onDeleteAccount: (id: string) => void;
  onUpdateAccount?: (id: string, updates: Partial<Pick<OTPAccount, "name" | "issuer" | "secret">>) => void;
}

export default function GroupPage({
  groups,
  accounts,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onDeleteAccount,
  onUpdateAccount,
}: GroupPageProps) {
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [showManager, setShowManager] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig>(loadSortConfig);

  const handleSortChange = useCallback((config: SortConfig) => {
    setSortConfig(config);
    saveSortConfig(config);
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

  const filteredAccounts = selectedGroupId
    ? filterByGroup(accounts, selectedGroupId)
    : [];
  const selectedAccounts = sortAccounts(filteredAccounts, sortConfig);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-800">分组管理</h2>

      {/* 顶部工具栏：下拉选择器 + 管理按钮 + 排序 */}
      <div className="flex items-center gap-3">
        <div className="w-52">
          <GroupSelector
            groups={groups}
            selectedGroupId={selectedGroupId}
            onSelect={(id) => setSelectedGroupId(id)}
            accounts={accounts}
          />
        </div>
        <button
          type="button"
          onClick={() => setShowManager(true)}
          aria-label="打开分组管理"
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          title="分组管理"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
        <div className="ml-auto">
          <SortControls config={sortConfig} onChange={handleSortChange} />
        </div>
      </div>

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

      {/* 账户卡片网格 */}
      {selectedGroupId ? (
        selectedAccounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <svg className="w-12 h-12 mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
            </svg>
            <p className="text-sm">该分组下暂无账户</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {selectedAccounts.map((account) => (
              <AccountCard key={account.id} account={account} onDelete={onDeleteAccount} onUpdate={onUpdateAccount} />
            ))}
          </div>
        )
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <svg className="w-16 h-16 mb-4" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
          </svg>
          <p className="text-base font-medium mb-1">暂无分组</p>
          <p className="text-sm">请先创建一个分组</p>
        </div>
      )}
    </div>
  );
}
