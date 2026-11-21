import {
  useState,
  useCallback,
  useRef,
  useEffect,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useTOTP } from "../hooks/useTOTP";
import { isValidBase32 } from "../lib/validators";
import { DEFAULT_GROUP_ID } from "../lib/group-manager";
import type { OTPAccount } from "../types";

export interface TempEntry {
  id: string;
  secret: string;
}

const inFlightTempEntryIds = new Set<string>();
const tempSaveListeners = new Set<(errorMessage?: string) => void>();

function notifyTempSaveChange(errorMessage?: string) {
  for (const listener of tempSaveListeners) {
    listener(errorMessage);
  }
}

interface TempPanelProps {
  entries: TempEntry[];
  onEntriesChange: Dispatch<SetStateAction<TempEntry[]>>;
  onSaveToAccount: (account: OTPAccount) => Promise<void> | void;
}

/** 单个临时密钥条目 */
function TempEntryItem({
  entry,
  saving,
  onSave,
  onRemove,
}: {
  entry: TempEntry;
  saving: boolean;
  onSave: (entry: TempEntry) => void;
  onRemove: (id: string) => void;
}) {
  const { code, remaining } = useTOTP(entry.secret);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const handleCopyCode = useCallback(async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      if (timerRef.current) clearTimeout(timerRef.current);
      setCopied(true);
      timerRef.current = setTimeout(() => { setCopied(false); timerRef.current = null; }, 1500);
    } catch { /* clipboard unavailable */ }
  }, [code]);

  // 格式化验证码
  const formattedCode = !code
    ? "验证码不可用"
    : code.length === 6
      ? `${code.slice(0, 3)} ${code.slice(3)}`
      : code;

  return (
    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500 truncate font-mono">{entry.secret}</p>
        <button
          type="button"
          onClick={handleCopyCode}
          disabled={!code}
          className={`flex items-center gap-3 mt-1 ${code ? "group cursor-pointer" : "opacity-60 cursor-not-allowed"}`}
          aria-label={code ? `复制验证码 ${code}` : "验证码不可用"}
        >
          <span className={code ? "text-2xl font-mono font-bold tracking-widest text-gray-900 group-hover:text-blue-600 transition-colors" : "text-sm font-medium text-red-500"}>
            {formattedCode}
          </span>
          <span className="text-sm text-gray-400">{remaining}s</span>
          {copied ? (
            <span className="text-xs text-green-600 font-medium">已复制</span>
          ) : (
            <svg className="w-4 h-4 text-gray-300 group-hover:text-blue-500 transition-colors" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
            </svg>
          )}
        </button>
      </div>
      <div className="flex gap-2 ml-3 shrink-0">
        <button
          type="button"
          onClick={() => void onSave(entry)}
          disabled={saving}
          className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? "保存中..." : "保存到账户"}
        </button>
        <button
          type="button"
          onClick={() => onRemove(entry.id)}
          disabled={saving}
          className="px-3 py-1.5 text-sm bg-gray-200 text-gray-600 rounded hover:bg-gray-300 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          移除
        </button>
      </div>
    </div>
  );
}

export function TempPanel({ entries, onEntriesChange, onSaveToAccount }: TempPanelProps) {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [savingIds, setSavingIds] = useState<Set<string>>(() => new Set(inFlightTempEntryIds));

  useEffect(() => {
    const syncSavingState = (errorMessage?: string) => {
      setSavingIds(new Set(inFlightTempEntryIds));
      if (errorMessage) {
        setError(errorMessage);
      }
    };
    tempSaveListeners.add(syncSavingState);
    setSavingIds(new Set(inFlightTempEntryIds));
    return () => {
      tempSaveListeners.delete(syncSavingState);
    };
  }, []);

  const handleAdd = () => {
    const normalized = input.replace(/\s+/g, "").toUpperCase();
    if (!normalized) return;
    if (!isValidBase32(normalized)) {
      setError("密钥格式无效，请输入有效的 base32 编码密钥");
      return;
    }
    onEntriesChange((prev) => [...prev, { id: crypto.randomUUID(), secret: normalized }]);
    setInput("");
    setError("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleAdd();
  };

  const handleSave = async (entry: TempEntry) => {
    if (inFlightTempEntryIds.has(entry.id)) {
      return;
    }

    const now = Date.now();
    const account: OTPAccount = {
      id: crypto.randomUUID(),
      issuer: "",
      name: "临时密钥",
      secret: entry.secret,
      type: "totp",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      counter: 0,
      createdAt: now,
      updatedAt: now,
      groupId: DEFAULT_GROUP_ID,
    };

    inFlightTempEntryIds.add(entry.id);
    setError("");
    notifyTempSaveChange();

    let saveErrorMessage: string | undefined;
    try {
      await onSaveToAccount(account);
      onEntriesChange((prev) => prev.filter((item) => item.id !== entry.id));
    } catch (err) {
      saveErrorMessage = err instanceof Error ? err.message : "保存到账户失败，请重试";
    } finally {
      inFlightTempEntryIds.delete(entry.id);
      notifyTempSaveChange(saveErrorMessage);
    }
  };

  const handleRemove = (id: string) => {
    if (inFlightTempEntryIds.has(id)) {
      return;
    }
    onEntriesChange((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-semibold">临时验证码</h2>
      <p className="text-sm text-gray-500">
        输入 base32 密钥临时查看验证码，关闭软件后自动清除。
      </p>

      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => { setInput(e.target.value); if (error) setError(""); }}
          onKeyDown={handleKeyDown}
          placeholder="输入 base32 密钥..."
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
        />
        <button
          onClick={handleAdd}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors shrink-0"
        >
          添加
        </button>
      </div>

      {error && <p className="text-sm text-red-500" role="alert">{error}</p>}

      {entries.length === 0 ? (
        <p className="text-center text-gray-400 py-8">暂无临时密钥</p>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <TempEntryItem
              key={entry.id}
              entry={entry}
              saving={savingIds.has(entry.id)}
              onSave={handleSave}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}
    </div>
  );
}