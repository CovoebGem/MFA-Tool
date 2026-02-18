import { useState } from "react";
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

  const handleSave = () => {
    if (onUpdate) {
      onUpdate(account.id, {
        name: editName.trim(),
        issuer: editIssuer.trim(),
        secret: editSecret.trim(),
      });
    }
    onClose();
  };

  const handleSwitchToEdit = () => {
    setEditName(account.name);
    setEditIssuer(account.issuer);
    setEditSecret(account.secret);
    setMode("edit");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
      {/* 遮罩层 */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

      {/* 弹窗内容 */}
      <div className="relative w-full max-w-md mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-800">
            {mode === "detail" ? "账户详情" : "编辑账户"}
          </h3>
          <div className="flex items-center gap-2">
            {mode === "detail" && onUpdate && (
              <button type="button" onClick={handleSwitchToEdit}
                className="px-3 py-1.5 text-xs font-medium text-amber-600 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors">
                编辑
              </button>
            )}
            <button type="button" onClick={onClose} aria-label="关闭"
              className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
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
              <span className="text-xs text-gray-400 uppercase tracking-wide">服务商 (Issuer)</span>
              <p className="mt-1 text-gray-800 font-medium">{account.issuer || "未知"}</p>
            </div>
            <div>
              <span className="text-xs text-gray-400 uppercase tracking-wide">账户名称 (Name)</span>
              <p className="mt-1 text-gray-800 font-medium break-all">{account.name}</p>
            </div>
            <div>
              <span className="text-xs text-gray-400 uppercase tracking-wide">密钥 (Secret)</span>
              <p className="mt-1 text-gray-800 font-mono text-xs break-all bg-gray-50 p-2.5 rounded-lg">{account.secret}</p>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div>
                <span className="text-xs text-gray-400 uppercase tracking-wide">类型</span>
                <p className="mt-1 text-gray-800 font-medium uppercase">{account.type}</p>
              </div>
              <div>
                <span className="text-xs text-gray-400 uppercase tracking-wide">位数</span>
                <p className="mt-1 text-gray-800 font-medium">{account.digits}</p>
              </div>
              <div>
                <span className="text-xs text-gray-400 uppercase tracking-wide">周期</span>
                <p className="mt-1 text-gray-800 font-medium">{account.period}s</p>
              </div>
              <div>
                <span className="text-xs text-gray-400 uppercase tracking-wide">算法</span>
                <p className="mt-1 text-gray-800 font-medium">{account.algorithm}</p>
              </div>
            </div>
            <div>
              <span className="text-xs text-gray-400 uppercase tracking-wide">创建时间</span>
              <p className="mt-1 text-gray-800">{new Date(account.createdAt).toLocaleString()}</p>
            </div>
          </div>
        ) : (
          /* 编辑视图 */
          <div className="px-6 py-5 space-y-4">
            <div>
              <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">服务商 (Issuer)</label>
              <input type="text" value={editIssuer} onChange={(e) => setEditIssuer(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">账户名称 (Name)</label>
              <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">密钥 (Secret)</label>
              <input type="text" value={editSecret} onChange={(e) => setEditSecret(e.target.value)}
                className="w-full px-3 py-2.5 text-sm font-mono border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={handleSave}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors">
                保存
              </button>
              <button type="button" onClick={onClose}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
                取消
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
