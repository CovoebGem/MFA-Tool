import { useState, useCallback, useRef, useEffect } from "react";
import { useTOTP } from "../hooks/useTOTP";
import { buildOtpauthUrl } from "../lib/otpauth-url";
import { getServiceIconUrl, getFallbackIcon } from "../lib/service-icons";
import AccountDetailModal from "./AccountDetailModal";
import type { OTPAccount } from "../types";

interface AccountCardProps {
  account: OTPAccount;
  onDelete: (id: string) => void;
  onUpdate?: (id: string, updates: Partial<Pick<OTPAccount, "name" | "issuer" | "secret">>) => void;
  groupName?: string;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

type CopiedField = "code" | "secret" | "url" | null;
type ModalMode = "detail" | "edit" | null;

export default function AccountCard({ account, onDelete, onUpdate, groupName, selected, onToggleSelect }: AccountCardProps) {
  const { code, remaining } = useTOTP(account.secret, account.period, account.digits);
  const [copied, setCopied] = useState<CopiedField>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [iconError, setIconError] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    };
  }, []);

  const copyToClipboard = useCallback(async (text: string, field: CopiedField) => {
    try {
      await navigator.clipboard.writeText(text);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      setCopied(field);
      copiedTimerRef.current = setTimeout(() => {
        setCopied(null);
        copiedTimerRef.current = null;
      }, 1500);
    } catch {
      // 剪贴板不可用时静默忽略
    }
  }, []);

  const handleCopyCode = () => copyToClipboard(code, "code");
  const handleCopySecret = () => copyToClipboard(account.secret, "secret");
  const handleCopyUrl = () => copyToClipboard(buildOtpauthUrl(account), "url");

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
      deleteTimerRef.current = setTimeout(() => {
        setConfirmDelete(false);
        deleteTimerRef.current = null;
      }, 3000);
      return;
    }
    onDelete(account.id);
  };

  const formattedCode = code.length === 6
    ? `${code.slice(0, 3)} ${code.slice(3)}`
    : code;

  const progress = (remaining / account.period) * 100;
  const iconUrl = getServiceIconUrl(account.issuer);
  const fallbackIcon = getFallbackIcon(account.issuer || "?");

  return (
    <>
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5 transition-shadow hover:shadow-md">
      {/* 头部：账户信息 */}
      <div className="flex items-start justify-between mb-3">
        {onToggleSelect && (
          <input type="checkbox" checked={!!selected} onChange={() => onToggleSelect(account.id)}
            aria-label={`选择账户 ${account.issuer || account.name}`}
            className="mt-1 mr-2.5 w-4 h-4 shrink-0 accent-blue-600 cursor-pointer" />
        )}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0 overflow-hidden">
            {iconUrl && !iconError ? (
              <img
                src={iconUrl}
                alt={account.issuer || "服务图标"}
                className="w-6 h-6"
                onError={() => setIconError(true)}
              />
            ) : (
              <img
                src={fallbackIcon}
                alt={account.issuer || "服务图标"}
                className="w-10 h-10"
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 truncate">{account.issuer || "未知服务"}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{account.name}</p>
          </div>
        </div>
        <span className="ml-2 shrink-0 px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 uppercase">{account.type}</span>
        {groupName && (
          <span className="ml-1 shrink-0 px-2 py-0.5 text-xs font-medium rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">{groupName}</span>
        )}
      </div>

      {/* 验证码区域 */}
      <button type="button" onClick={handleCopyCode} aria-label={`复制验证码 ${code}`}
        className="w-full flex items-center justify-between px-4 py-3 mb-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer group">
        <span className="text-2xl font-mono font-bold tracking-widest text-gray-900 dark:text-gray-100">{formattedCode}</span>
        <div className="flex items-center gap-2">
          <div className="relative w-8 h-8" aria-label={`剩余 ${remaining} 秒`}>
            <svg className="w-8 h-8 -rotate-90" viewBox="0 0 32 32" aria-hidden="true">
              <circle cx="16" cy="16" r="14" fill="none" className="stroke-gray-200 dark:stroke-gray-600" strokeWidth="3" />
              <circle cx="16" cy="16" r="14" fill="none" stroke={remaining <= 5 ? "#ef4444" : "#3b82f6"}
                strokeWidth="3" strokeDasharray={`${(progress / 100) * 87.96} 87.96`} strokeLinecap="round"
                className="transition-all duration-1000 ease-linear" />
            </svg>
            <span className={`absolute inset-0 flex items-center justify-center text-xs font-medium ${remaining <= 5 ? "text-red-500" : "text-gray-600 dark:text-gray-300"}`}>{remaining}</span>
          </div>
          {copied === "code" ? (
            <span className="text-xs text-green-600 dark:text-green-400 font-medium">已复制</span>
          ) : (
            <svg className="w-4 h-4 text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
            </svg>
          )}
        </div>
      </button>

      {/* 操作按钮 */}
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={handleCopySecret} aria-label="复制密钥"
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 rounded-md hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
          </svg>
          {copied === "secret" ? <span className="text-green-600 dark:text-green-400">已复制</span> : "密钥"}
        </button>

        <button type="button" onClick={handleCopyUrl} aria-label="复制 otpauth URL"
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 rounded-md hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.54a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.757 8.25" />
          </svg>
          {copied === "url" ? <span className="text-green-600 dark:text-green-400">已复制</span> : "URL"}
        </button>

        {/* 详情按钮 */}
        <button type="button" onClick={() => setModalMode("detail")} aria-label="查看详情"
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
          详情
        </button>

        {/* 编辑按钮 */}
        {onUpdate && (
          <button type="button" onClick={() => setModalMode("edit")} aria-label="编辑账户"
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 rounded-md hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
            </svg>
            编辑
          </button>
        )}

        <button type="button" onClick={handleDelete} aria-label={confirmDelete ? "确认删除账户" : "删除账户"}
          className={`ml-auto flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md transition-colors ${
            confirmDelete ? "text-white bg-red-500 hover:bg-red-600" : "text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
          }`}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
          {confirmDelete ? "确认删除" : "删除"}
        </button>
      </div>
    </div>

      {/* Modal 弹窗 */}
      {modalMode && (
        <AccountDetailModal
          account={account}
          mode={modalMode}
          onClose={() => setModalMode(null)}
          onUpdate={onUpdate}
        />
      )}
    </>
  );
}
