import {
  useState,
  useCallback,
  useRef,
  useEffect,
  type Dispatch,
  type SetStateAction,
} from "react";
import { AlertCircle, Check, Copy, Plus, Save, Timer, Trash2 } from "lucide-react";
import { useTOTP } from "../hooks/useTOTP";
import { isValidBase32 } from "../lib/validators";
import { DEFAULT_GROUP_ID } from "../lib/group-manager";
import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from "./ui/frame";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Alert, AlertDescription } from "./ui/alert";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "./ui/empty";
import { cn } from "../lib/utils";
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
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-2xs">
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-xs text-muted-foreground">{entry.secret}</p>
        <button
          type="button"
          onClick={handleCopyCode}
          disabled={!code}
          className={cn(
            "mt-1.5 inline-flex items-center gap-3 rounded-lg px-2 py-1 -ml-2 transition-colors",
            code ? "group cursor-pointer hover:bg-muted/60" : "cursor-not-allowed opacity-60",
          )}
          aria-label={code ? `复制验证码 ${code}` : "验证码不可用"}
        >
          <span
            className={
              code
                ? "font-mono text-2xl font-bold tracking-[0.18em] text-foreground transition-colors group-hover:text-primary tabular-nums"
                : "text-sm font-medium text-destructive"
            }
          >
            {formattedCode}
          </span>
          <Badge variant={remaining <= 5 ? "destructive" : "secondary"} className="tabular-nums">
            {remaining}s
          </Badge>
          {copied ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-success-foreground">
              <Check className="size-3.5" aria-hidden="true" />
              已复制
            </span>
          ) : (
            <Copy
              className="size-4 text-muted-foreground transition-colors group-hover:text-primary"
              aria-hidden="true"
            />
          )}
        </button>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          size="sm"
          onClick={() => void onSave(entry)}
          disabled={saving}
        >
          <Save className="size-3.5" aria-hidden="true" />
          {saving ? "保存中..." : "保存到账户"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onRemove(entry.id)}
          disabled={saving}
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
          移除
        </Button>
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
    <div className="flex flex-col gap-5 px-6 py-5">
      <Frame>
        <FrameHeader>
          <div className="flex items-center gap-2">
            <Timer className="size-4 text-primary" aria-hidden="true" />
            <div>
              <FrameTitle className="text-base">临时验证码</FrameTitle>
              <FrameDescription>
                输入 base32 密钥临时查看验证码，关闭软件后自动清除。
              </FrameDescription>
            </div>
          </div>
        </FrameHeader>
        <FramePanel className="p-4">
          <div className="flex gap-2">
            <Input
              type="text"
              value={input}
              onChange={(e) => { setInput(e.target.value); if (error) setError(""); }}
              onKeyDown={handleKeyDown}
              placeholder="输入 base32 密钥..."
              aria-invalid={Boolean(error)}
              className="flex-1 font-mono"
            />
            <Button onClick={handleAdd} className="shrink-0">
              <Plus className="size-4" aria-hidden="true" />
              添加
            </Button>
          </div>

          {error && (
            <Alert variant="destructive" role="alert" className="mt-3">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <AlertDescription className="opacity-100">{error}</AlertDescription>
            </Alert>
          )}
        </FramePanel>
      </Frame>

      {entries.length === 0 ? (
        <Empty className="py-14">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Timer aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>暂无临时密钥</EmptyTitle>
            <EmptyDescription>在上方输入密钥即可实时生成验证码</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-3">
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
