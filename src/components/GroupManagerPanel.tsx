import { useState } from "react";
import type { Group, OTPAccount } from "../types";

interface GroupManagerPanelProps {
  groups: Group[];
  accounts: OTPAccount[];
  onCreateGroup: (name: string) => void;
  onRenameGroup: (groupId: string, newName: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onClose: () => void;
}

export default function GroupManagerPanel({
  groups,
  accounts,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onClose,
}: GroupManagerPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const ungroupedCount = accounts.filter(
    (a) => !a.groupId || !groups.some((g) => g.id === a.groupId)
  ).length;

  const getAccountCount = (groupId: string) =>
    accounts.filter((a) => a.groupId === groupId).length;

  const handleCreate = () => {
    const trimmed = newGroupName.trim();
    if (!trimmed) { setError("分组名称不能为空"); return; }
    try {
      onCreateGroup(trimmed);
      setNewGroupName("");
      setError(null);
    } catch (e) {
      if (e instanceof Error) setError(e.message);
    }
  };

  const startEdit = (group: Group) => {
    setEditingId(group.id);
    setEditName(group.name);
    setError(null);
    setConfirmDeleteId(null);
  };

  const handleRename = () => {
    if (!editingId) return;
    const trimmed = editName.trim();
    if (!trimmed) { setError("分组名称不能为空"); return; }
    try {
      onRenameGroup(editingId, trimmed);
      setEditingId(null);
      setEditName("");
      setError(null);
    } catch (e) {
      if (e instanceof Error) setError(e.message);
    }
  };

  const handleDelete = (groupId: string) => {
    if (confirmDeleteId === groupId) {
      onDeleteGroup(groupId);
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(groupId);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20" />
      <div
        className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
            </svg>
            <h3 className="text-base font-semibold text-gray-800">分组管理</h3>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded" aria-label="关闭">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 统计 */}
        <p className="px-5 pb-3 text-sm text-gray-500">
          共 {groups.length} 个分组
          {ungroupedCount > 0 && <span>  ·  {ungroupedCount} 个未分组账号</span>}
        </p>

        {/* 错误提示 */}
        {error && <p className="px-5 pb-2 text-xs text-red-500" role="alert">{error}</p>}

        <div className="px-5 pb-5 space-y-2 max-h-80 overflow-y-auto">
          {/* 新建分组按钮 */}
          <button
            type="button"
            onClick={() => {
              if (!newGroupName && !editingId) setNewGroupName(" ");
              setNewGroupName("");
              setEditingId("__new__");
              setEditName("");
              setError(null);
            }}
            className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm rounded-lg border border-dashed border-gray-300 text-gray-500 hover:bg-gray-50 transition-colors ${editingId === "__new__" ? "hidden" : ""}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            新建分组
          </button>

          {/* 新建分组输入框 */}
          {editingId === "__new__" && (
            <div className="rounded-lg border border-gray-200 p-3 space-y-2">
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => { setNewGroupName(e.target.value); setError(null); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") { setEditingId(null); setNewGroupName(""); setError(null); }
                }}
                placeholder="分组名称"
                aria-label="新分组名称"
                autoFocus
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setEditingId(null); setNewGroupName(""); setError(null); }}
                  className="px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  className="px-3 py-1.5 text-xs text-white bg-cyan-500 rounded-lg hover:bg-cyan-600"
                >
                  创建
                </button>
              </div>
            </div>
          )}

          {/* 分组列表 */}
          {groups.map((group) => (
            <div key={group.id} className="rounded-lg border border-gray-200 px-4 py-3">
              {editingId === group.id ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-blue-500 shrink-0" />
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => { setEditName(e.target.value); setError(null); }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRename();
                        if (e.key === "Escape") { setEditingId(null); setError(null); }
                      }}
                      aria-label="编辑分组名称"
                      autoFocus
                      className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => { setEditingId(null); setError(null); }}
                      className="px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={handleRename}
                      aria-label="确认重命名"
                      className="px-3 py-1.5 text-xs text-white bg-cyan-500 rounded-lg hover:bg-cyan-600"
                    >
                      保存
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-4 h-4 rounded bg-blue-500 shrink-0" />
                    <span className="text-sm font-medium text-gray-800 truncate">{group.name}</span>
                    <span className="text-xs text-gray-400 shrink-0">
                      <svg className="inline w-3.5 h-3.5 mr-0.5 -mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                      </svg>
                      {getAccountCount(group.id)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {/* 编辑 */}
                    <button
                      type="button"
                      onClick={() => startEdit(group)}
                      aria-label={`编辑分组 ${group.name}`}
                      className="p-1.5 text-gray-400 hover:text-gray-600 rounded"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                      </svg>
                    </button>
                    {/* 删除 */}
                    <button
                      type="button"
                      onClick={() => handleDelete(group.id)}
                      disabled={group.isDefault}
                      aria-label={
                        group.isDefault ? "默认分组不可删除"
                          : confirmDeleteId === group.id ? `确认删除分组 ${group.name}`
                          : `删除分组 ${group.name}`
                      }
                      className={`p-1.5 rounded transition-colors ${
                        group.isDefault ? "text-gray-200 cursor-not-allowed"
                          : confirmDeleteId === group.id ? "text-white bg-red-500 hover:bg-red-600"
                          : "text-red-400 hover:text-red-600"
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
