import { useState, useEffect } from "react";
import type { OTPAccount } from "../types";
import { isValidBase32 } from "../lib/validators";
import { findInternalDuplicates } from "../lib/dedup-checker";
import CheckResultDialog from "./CheckResultDialog";
import type { CheckResult } from "./CheckResultDialog";

export interface AccountToolbarProps {
  accounts: OTPAccount[];
  selectedIds: Set<string>;
  onDelete: (id: string) => void;
  onRefresh: () => Promise<void>;
  onToggleSelectAll: () => void;
  onClearSelection: () => void;
}

export default function AccountToolbar({
  accounts,
  selectedIds,
  onDelete,
  onRefresh,
  onToggleSelectAll,
  onClearSelection,
}: AccountToolbarProps) {
  const hasAccounts = accounts.length > 0;

  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [showCheckResult, setShowCheckResult] = useState(false);
  const [checkSuccess, setCheckSuccess] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  useEffect(() => {
    if (!checkSuccess) return;
    const timer = setTimeout(() => setCheckSuccess(false), 2000);
    return () => clearTimeout(timer);
  }, [checkSuccess]);

  useEffect(() => {
    if (!refreshError) return;
    const timer = setTimeout(() => setRefreshError(null), 3000);
    return () => clearTimeout(timer);
  }, [refreshError]);

  const handleCheck = async () => {
    setChecking(true);
    setCheckSuccess(false);
    try {
      const invalidAccounts: CheckResult["invalidAccounts"] = [];
      for (const account of accounts) {
        try {
          if (!isValidBase32(account.secret)) {
            invalidAccounts.push({ account, reason: "密钥不是有效的 Base32 编码" });
          }
        } catch {
          invalidAccounts.push({ account, reason: "密钥校验失败" });
        }
      }
      const duplicateGroups = findInternalDuplicates(accounts);
      const result: CheckResult = { invalidAccounts, duplicateGroups };
      if (invalidAccounts.length > 0 || duplicateGroups.length > 0) {
        setCheckResult(result);
        setShowCheckResult(true);
      } else {
        setCheckSuccess(true);
      }
    } finally {
      setChecking(false);
    }
  };

  const handleDelete = async () => {
    if (selectedIds.size === 0) {
      alert("请先选择要删除的账户");
      return;
    }
    const confirmed = window.confirm(
      `确定要删除选中的 ${selectedIds.size} 个账户吗？`
    );
    if (!confirmed) return;
    setDeleting(true);
    try {
      for (const id of selectedIds) {
        onDelete(id);
      }
      onClearSelection();
    } finally {
      setDeleting(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      await onRefresh();
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : "刷新失败");
    } finally {
      setRefreshing(false);
    }
  };

  const iconBtnBase =
    "relative group p-2 rounded-md border transition-colors";
  const iconBtnNormal =
    "text-slate-600 bg-white border-slate-300 hover:bg-slate-50 hover:text-slate-800";
  const iconBtnDisabled =
    "text-slate-400 bg-slate-100 border-slate-200 cursor-not-allowed";

  return (
    <>
      <div className="flex items-center gap-1">
        {/* 检查 */}
        <button
          type="button"
          aria-label="检查"
          title="检查"
          onClick={handleCheck}
          disabled={checking}
          className={`${iconBtnBase} ${checking ? iconBtnDisabled : iconBtnNormal}`}
        >
          {checking ? (
            <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 12l2 2 4-4" />
              <circle cx="12" cy="12" r="10" />
            </svg>
          )}
          <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
            检查
          </span>
        </button>

        {/* 删除 */}
        {hasAccounts && (
          <button
            type="button"
            aria-label="删除"
            title="删除"
            onClick={handleDelete}
            disabled={deleting}
            className={`${iconBtnBase} ${deleting ? iconBtnDisabled : "text-slate-600 bg-white border-slate-300 hover:bg-red-50 hover:text-red-600 hover:border-red-300"}`}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
            <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
              删除
            </span>
          </button>
        )}

        {/* 刷新 */}
        <button
          type="button"
          aria-label="刷新"
          title="刷新"
          onClick={handleRefresh}
          disabled={refreshing}
          className={`${iconBtnBase} ${refreshing ? iconBtnDisabled : iconBtnNormal}`}
        >
          {refreshing ? (
            <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
            </svg>
          )}
          <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
            刷新
          </span>
        </button>

        {/* 全选 */}
        {hasAccounts && (
          <button
            type="button"
            aria-label="全选"
            title={selectedIds.size === accounts.length && accounts.length > 0 ? "取消全选" : "全选"}
            onClick={onToggleSelectAll}
            className={`${iconBtnBase} ${
              selectedIds.size === accounts.length && accounts.length > 0
                ? "text-blue-700 bg-blue-50 border-blue-300 hover:bg-blue-100"
                : selectedIds.size > 0
                  ? "text-blue-600 bg-white border-blue-200 hover:bg-blue-50"
                  : iconBtnNormal
            }`}
          >
            {selectedIds.size === accounts.length && accounts.length > 0 ? (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            ) : selectedIds.size > 0 ? (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="2" />
              </svg>
            )}
            <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
              {selectedIds.size === accounts.length && accounts.length > 0 ? "取消全选" : "全选"}
            </span>
          </button>
        )}

        {/* 状态提示 */}
        {checkSuccess && (
          <span className="ml-1 text-sm text-green-600 font-medium" role="status">
            ✓ 正常
          </span>
        )}
        {refreshError && (
          <span className="ml-1 text-sm text-red-600 font-medium" role="alert">
            ✕ {refreshError}
          </span>
        )}
      </div>

      {showCheckResult && checkResult && (
        <CheckResultDialog
          result={checkResult}
          onClose={() => setShowCheckResult(false)}
        />
      )}
    </>
  );
}
