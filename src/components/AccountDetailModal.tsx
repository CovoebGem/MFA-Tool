import { useEffect, useState } from "react";
import { isValidBase32 } from "../lib/validators";
import type { OTPAccount } from "../types";

interface AccountDetailModalProps {
  account: OTPAccount;
  mode: "detail" | "edit";
  onClose: () => void;
  onUpdate?: (id: string, updates: Partial<Pick<OTPAccount, "name" | "issuer" | "secret">>) => void;
}

export default function AccountDetailModal({ account, mode: initialMode, onClose, onUpdate }: AccountDetailModalProps) {
  const [mode, setMode] = useState(initialMode);
  const [editName, setEditName] = useState(account.name);
  const [editIssuer, setEditIssuer] = useState(account.issuer);
  const [editSecret, setEditSecret] = useState(account.secret);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.isComposing && event.keyCode !== 229) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleSave = () => {
    const trimmedName = editName.trim();
    if (!trimmedName) {
      setError("账户名称不能为空");
      return;
    }

    const normalizedSecret = editSecret.replace(/\s+/g, "").toUpperCase();
    if (!normalizedSecret || !isValidBase32(normalizedSecret)) {
      setError("密钥格式无效，请输入有效的 base32 编码密钥（A-Z, 2-7）");
      return;
    }

    setError(null);
    if (onUpdate) {
      onUpdate(account.id, {
        name: trimmedName,
        issuer: editIssuer.trim(),
        secret: normalizedSecret,
      });
    }
    onClose();
  };

  const handleSwitchToEdit = () => {
    setEditName(account.name);
    setEditIssuer(account.issuer);
    setEditSecret(account.secret);
    setError(null);
    setMode("edit");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-label={mode === "detail" ? "账户详情" : "编辑账户"}>
      {/* 遮罩层 */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

      {/* 弹窗内容 */}
      <div className="relative w-full max-w-md mx-4 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-700">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
            {mode === "detail" ? "账户详情" : "编辑账户"}
          </h3>
          <div className="flex items-center gap-2">
            {mode === "detail" && onUpdate && (
              <button type="button" onClick={handleSwitchToEdit}
                className="px-3 py-1.5 text-xs font-medium text-amber-600 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors">
                编辑
              </button>
            )}
            <button type="button" onClick={onClose} aria-label="关闭"
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {mode === "detail" ? (
          /* 详情视图 */
          <div className="px-6 py-5 space-y-4">
            <div>
              <span className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">服务商 (Issuer)</span>
              <p className="mt-1 text-gray-800 dark:text-gray-100 font-medium">{account.issuer || "未知"}</p>
            </div>
            <div>
              <span className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">账户名称 (Name)</span>
              <p className="mt-1 text-gray-800 dark:text-gray-100 font-medium break-all">{account.name}</p>
            </div>
            <div>
              <span className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">密钥 (Secret)</span>
              <p className="mt-1 text-gray-800 dark:text-gray-100 font-mono text-xs break-all bg-gray-50 dark:bg-gray-900/60 p-2.5 rounded-lg">{account.secret}</p>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div>
                <span className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">类型</span>
                <p className="mt-1 text-gray-800 dark:text-gray-100 font-medium uppercase">{account.type}</p>
              </div>
              <div>
                <span className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">位数</span>
                <p className="mt-1 text-gray-800 dark:text-gray-100 font-medium">{account.digits}</p>
              </div>
              <div>
                <span className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">周期</span>
                <p className="mt-1 text-gray-800 dark:text-gray-100 font-medium">{account.period}s</p>
              </div>
              <div>
                <span className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">算法</span>
                <p className="mt-1 text-gray-800 dark:text-gray-100 font-medium">{account.algorithm}</p>
              </div>
            </div>
            <div>
              <span className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">创建时间</span>
              <p className="mt-1 text-gray-800 dark:text-gray-100">{new Date(account.createdAt).toLocaleString()}</p>
            </div>
          </div>
        ) : (
          /* 编辑视图 */
          <div className="px-6 py-5 space-y-4">
            <div>
              <label htmlFor="edit-account-issuer" className="block text-xs text-gray-400 dark:text-gray-400 uppercase tracking-wide mb-1.5">服务商 (Issuer)</label>
              <input id="edit-account-issuer" type="text" value={editIssuer} onChange={(e) => setEditIssuer(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
            <div>
              <label htmlFor="edit-account-name" className="block text-xs text-gray-400 dark:text-gray-400 uppercase tracking-wide mb-1.5">账户名称 (Name)</label>
              <input id="edit-account-name" type="text" value={editName} onChange={(e) => { setEditName(e.target.value); if (error) setError(null); }}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
            <div>
              <label htmlFor="edit-account-secret" className="block text-xs text-gray-400 dark:text-gray-400 uppercase tracking-wide mb-1.5">密钥 (Secret)</label>
              <input id="edit-account-secret" type="text" value={editSecret} onChange={(e) => { setEditSecret(e.target.value); if (error) setError(null); }}
                className="w-full px-3 py-2.5 text-sm font-mono border border-gray-200 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
            {error && (
              <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={handleSave}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors">
                保存
              </button>
              <button type="button" onClick={onClose}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                取消
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
