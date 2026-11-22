import { useState } from "react";
import { FolderKanban, Pencil, Plus, Trash2, User, X } from "lucide-react";
import { Alert, AlertDescription } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { DEFAULT_GROUP_ID } from "../lib/group-manager";
import { cn } from "../lib/utils";
import type { Group, OTPAccount } from "../types";

interface GroupManagerPanelProps {
  groups: Group[];
  accounts: OTPAccount[];
  onCreateGroup: (name: string) => Promise<void> | void;
  onRenameGroup: (groupId: string, newName: string) => Promise<void> | void;
  onDeleteGroup: (groupId: string) => Promise<void> | void;
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

  const handleCreate = async () => {
    const trimmed = newGroupName.trim();
    if (!trimmed) { setError("分组名称不能为空"); return; }
    try {
      await onCreateGroup(trimmed);
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

  const handleRename = async () => {
    if (!editingId) return;
    const trimmed = editName.trim();
    if (!trimmed) { setError("分组名称不能为空"); return; }
    try {
      await onRenameGroup(editingId, trimmed);
      setEditingId(null);
      setEditName("");
      setError(null);
    } catch (e) {
      if (e instanceof Error) setError(e.message);
    }
  };

  const handleDelete = async (groupId: string) => {
    if (confirmDeleteId === groupId) {
      try {
        await onDeleteGroup(groupId);
      } catch (e) {
        if (e instanceof Error) setError(e.message);
      }
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(groupId);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4"
      role="dialog"
      aria-modal="true"
      aria-label="分组管理"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/45 backdrop-blur-xs" aria-hidden="true" />
      <div
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FolderKanban className="size-4" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-card-foreground">分组管理</h3>
              <p className="text-xs text-muted-foreground">
                共 {groups.length} 个分组
                {ungroupedCount > 0 && <span> · {ungroupedCount} 个未分组账号</span>}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="关闭"
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="px-5 pt-3">
            <Alert variant="destructive" role="alert">
              <AlertDescription className="opacity-100">{error}</AlertDescription>
            </Alert>
          </div>
        )}

        <div className="flex max-h-80 flex-col gap-2 overflow-y-auto p-5">
          <p className="rounded-lg bg-muted/45 px-3 py-1.5 text-[11px] text-muted-foreground">
            删除分组后，组内账户将自动移入默认分组，不会丢失；默认分组不可删除。
          </p>

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
            className={cn(
              "flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted/60 hover:text-foreground cursor-pointer",
              editingId === "__new__" && "hidden",
            )}
          >
            <Plus className="size-4" aria-hidden="true" />
            新建分组
          </button>

          {/* 新建分组输入框 */}
          {editingId === "__new__" && (
            <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-muted/30 p-3">
              <Input
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
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => { setEditingId(null); setNewGroupName(""); setError(null); }}
                >
                  取消
                </Button>
                <Button
                  size="xs"
                  onClick={handleCreate}
                >
                  创建
                </Button>
              </div>
            </div>
          )}

          {/* 分组列表 */}
          {groups.map((group) => {
            const isDefault = group.isDefault || group.id === DEFAULT_GROUP_ID;
            return (
            <div key={group.id} className="rounded-xl border border-border bg-card px-3.5 py-2.5">
              {editingId === group.id ? (
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center gap-2">
                    <div className="size-3 shrink-0 rounded-full bg-primary" />
                    <Input
                      type="text"
                      value={editName}
                      onChange={(e) => { setEditName(e.target.value); setError(null); }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRename();
                        if (e.key === "Escape") { setEditingId(null); setError(null); }
                      }}
                      aria-label="编辑分组名称"
                      autoFocus
                      className="h-8"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => { setEditingId(null); setError(null); }}
                    >
                      取消
                    </Button>
                    <Button
                      size="xs"
                      onClick={handleRename}
                      aria-label="确认重命名"
                    >
                      保存
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="size-2.5 shrink-0 rounded-full bg-primary" />
                    <span className="truncate text-sm font-medium text-foreground">{group.name}</span>
                    <Badge variant="secondary" className="gap-1 tabular-nums">
                      <User className="size-3" aria-hidden="true" />
                      {getAccountCount(group.id)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => startEdit(group)}
                      aria-label={`编辑分组 ${group.name}`}
                      className="size-7"
                    >
                      <Pencil className="size-3.5" aria-hidden="true" />
                    </Button>
                    <button
                      type="button"
                      onClick={() => handleDelete(group.id)}
                      disabled={isDefault}
                      aria-label={
                        isDefault ? "默认分组不可删除"
                          : confirmDeleteId === group.id ? `确认删除分组 ${group.name}`
                          : `删除分组 ${group.name}`
                      }
                      title={
                        isDefault ? "默认分组不可删除"
                          : confirmDeleteId === group.id ? "再次点击确认删除（账户将移入默认分组）"
                          : "删除分组（组内账户将自动移入默认分组）"
                      }
                      className={cn(
                        "inline-flex h-7 items-center justify-center gap-1 rounded-md text-xs transition-colors",
                        isDefault
                          ? "w-7 cursor-not-allowed text-muted-foreground/35"
                          : confirmDeleteId === group.id
                            ? "w-auto bg-destructive px-2 font-medium text-white hover:bg-destructive/90 cursor-pointer"
                            : "w-7 text-muted-foreground hover:bg-destructive-surface hover:text-destructive-foreground cursor-pointer",
                      )}
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                      {!isDefault && confirmDeleteId === group.id && <span>确认删除</span>}
                    </button>
                  </div>
                </div>
              )}
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
