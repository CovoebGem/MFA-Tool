import {
  memo,
  useState,
  useCallback,
  useRef,
  useEffect,
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
} from "react";
import { Check, Copy, GripVertical, Info, KeyRound, Link2, Pencil, StickyNote, Trash2 } from "lucide-react";
import { useTOTP } from "../hooks/useTOTP";
import { useViewportVisibility } from "../hooks/useViewportVisibility";
import { buildOtpauthUrl } from "../lib/otpauth-url";
import {
  getServiceIconUrl,
  getFallbackIcon,
  hasServiceIconFailed,
  markServiceIconFailed,
} from "../lib/service-icons";
import { isAccountPinned } from "../lib/sorter";
import AccountDetailModal from "./AccountDetailModal";
import { Badge } from "./ui/badge";
import { cn } from "../lib/utils";
import type { OTPAccount } from "../types";

export interface AccountListTableProps {
  showGroupColumn?: boolean;
  children: ReactNode;
}

export interface AccountListRowProps {
  account: OTPAccount;
  onDelete: (id: string) => void;
  onUpdate?: (
    id: string,
    updates: Partial<Pick<OTPAccount, "name" | "issuer" | "secret" | "remark">>,
  ) => void;
  groupName?: string;
  showGroupColumn?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  dragProps?: HTMLAttributes<HTMLDivElement>;
  isDragging?: boolean;
  showDragHandle?: boolean;
}

type CopiedField = "secret" | "url" | null;
type ModalMode = "detail" | "edit" | null;

function getRowGridColumns(showGroupColumn: boolean): string {
  return showGroupColumn
    ? "md:grid-cols-[minmax(0,1.8fr)_minmax(110px,0.8fr)_210px_216px]"
    : "md:grid-cols-[minmax(0,2fr)_84px_210px_216px]";
}

interface AccountRowCodeButtonProps {
  secret: string;
  period: number;
  digits: number;
  targetRef: RefObject<HTMLDivElement | null>;
  observeVisibility: boolean;
}

const AccountRowCodeButton = memo(function AccountRowCodeButton({
  secret,
  period,
  digits,
  targetRef,
  observeVisibility,
}: AccountRowCodeButtonProps) {
  const isVisible = useViewportVisibility(targetRef, observeVisibility);
  const { code, remaining } = useTOTP(secret, period, digits, isVisible);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      if (timerRef.current) clearTimeout(timerRef.current);
      setCopied(true);
      timerRef.current = setTimeout(() => {
        setCopied(false);
        timerRef.current = null;
      }, 1500);
    } catch {
      // 剪贴板不可用时静默忽略
    }
  };

  const formattedCode = !code
    ? "验证码不可用"
    : code.length === 6
      ? `${code.slice(0, 3)} ${code.slice(3)}`
      : code;

  const safePeriod = Number.isInteger(period) && period > 0 ? period : 30;
  const progress = (remaining / safePeriod) * 100;
  const isExpiringSoon = remaining <= 5;

  return (
    <button
      type="button"
      onClick={handleCopyCode}
      disabled={!code}
      aria-label={code ? `复制验证码 ${code}` : "验证码不可用"}
      className={cn(
        "group inline-flex items-center gap-2.5 rounded-lg border border-border/70 bg-muted/40 px-2.5 py-1 transition-[background-color,border-color,transform] duration-150",
        code
          ? "cursor-pointer hover:border-border hover:bg-muted/80 active:scale-[0.99]"
          : "cursor-not-allowed opacity-60",
      )}
    >
      <span
        className={
          code
            ? "font-mono text-base font-bold tracking-[0.14em] text-foreground tabular-nums"
            : "text-xs font-medium text-destructive"
        }
      >
        {formattedCode}
      </span>
      <div className="relative size-6 shrink-0" aria-label={`剩余 ${remaining} 秒`}>
        <svg className="size-6 -rotate-90" viewBox="0 0 24 24" aria-hidden="true">
          <circle
            cx="12"
            cy="12"
            r="10"
            fill="none"
            className="stroke-border"
            strokeWidth="2.25"
          />
          <circle
            cx="12"
            cy="12"
            r="10"
            fill="none"
            className={cn(
              "transition-colors duration-150",
              isExpiringSoon ? "stroke-destructive" : "stroke-primary",
            )}
            strokeWidth="2.25"
            strokeDasharray={`${(progress / 100) * 62.83} 62.83`}
            strokeLinecap="round"
          />
        </svg>
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center text-[10px] font-semibold tabular-nums",
            isExpiringSoon ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {remaining}
        </span>
      </div>
      {copied ? (
        <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-success-foreground">
          <Check className="size-3" aria-hidden="true" />
          已复制
        </span>
      ) : (
        <Copy
          className="size-3.5 text-muted-foreground transition-colors group-hover:text-foreground"
          aria-hidden="true"
        />
      )}
    </button>
  );
});

/** 列表模式表格容器（与 AccountListRow 共享桌面端列宽对齐） */
export function AccountListTable({
  showGroupColumn = true,
  children,
}: AccountListTableProps) {
  return (
    <div
      data-slot="account-list"
      className="overflow-hidden rounded-xl border border-border bg-card shadow-2xs"
    >
      <div
        className={cn(
          "hidden items-center gap-3 border-b border-border bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground md:grid",
          getRowGridColumns(showGroupColumn),
        )}
      >
        <span>服务 / 账户</span>
        <span>{showGroupColumn ? "分组 / 类型" : "类型"}</span>
        <span>验证码</span>
        <span className="text-right">操作</span>
      </div>
      <div className="divide-y divide-border/70">{children}</div>
    </div>
  );
}

/** 列表模式单行账户条目 */
const AccountListRow = memo(function AccountListRow({
  account,
  onDelete,
  onUpdate,
  groupName,
  showGroupColumn,
  selected,
  onToggleSelect,
  dragProps,
  isDragging = false,
  showDragHandle = false,
}: AccountListRowProps) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [copied, setCopied] = useState<CopiedField>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const iconUrl = getServiceIconUrl(account.issuer);
  const fallbackIcon = getFallbackIcon(account.issuer || "?");
  const [iconError, setIconError] = useState(() =>
    iconUrl ? hasServiceIconFailed(iconUrl) : false,
  );
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setIconError(iconUrl ? hasServiceIconFailed(iconUrl) : false);
  }, [iconUrl]);

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

  const isPinned = isAccountPinned(account);
  const displayGroupColumn = showGroupColumn ?? Boolean(groupName);

  const actionBtnBase =
    "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer";

  return (
    <>
      <div
        ref={rowRef}
        {...dragProps}
        data-slot="account-row"
        data-pinned={isPinned ? "true" : "false"}
        data-selectable-id={onToggleSelect ? account.id : undefined}
        className={cn(
          "relative flex flex-col gap-2.5 px-4 py-2.5 transition-colors md:grid md:items-center md:gap-3",
          !showDragHandle && "account-row-cv",
          getRowGridColumns(displayGroupColumn),
          isPinned ? "bg-pin-surface/20 hover:bg-pin-surface/35" : "hover:bg-muted/35",
          selected && "bg-primary/5 hover:bg-primary/10",
          showDragHandle && "cursor-grab active:cursor-grabbing",
          isDragging && "opacity-50",
          dragProps?.className,
        )}
      >
        {isPinned && (
          <span
            className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-pin"
            aria-hidden="true"
          />
        )}

        {/* 列 1：拖拽/多选 + 图标 + 服务商与账户名 */}
        <div className="flex min-w-0 items-center gap-2.5">
          {showDragHandle && (
            <GripVertical
              className="size-4 shrink-0 text-muted-foreground/70"
              aria-hidden="true"
            />
          )}
          {onToggleSelect && (
            <input
              type="checkbox"
              checked={!!selected}
              onChange={() => onToggleSelect(account.id)}
              aria-label={`选择账户 ${account.issuer || account.name}`}
              className="size-4 shrink-0 rounded border-input accent-primary cursor-pointer"
            />
          )}
          <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/70 bg-muted/60">
            {iconUrl && !iconError ? (
              <img
                src={iconUrl}
                alt={account.issuer || "服务图标"}
                loading="lazy"
                decoding="async"
                draggable={false}
                className="size-5 object-contain"
                onError={() => {
                  markServiceIconFailed(iconUrl);
                  setIconError(true);
                }}
              />
            ) : (
              <img
                src={fallbackIcon}
                alt={account.issuer || "服务图标"}
                loading="lazy"
                decoding="async"
                draggable={false}
                className="size-8"
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-foreground">
              {account.issuer || "未知服务"}
            </div>
            <div className="truncate text-xs text-muted-foreground">{account.name}</div>
            {account.remark && (
              <div
                data-slot="account-remark"
                title={account.remark}
                className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground/90"
              >
                <StickyNote className="size-3 shrink-0 text-muted-foreground/75" aria-hidden="true" />
                <span className="truncate">{account.remark}</span>
              </div>
            )}
          </div>
        </div>

        {/* 列 2：分组与 OTP 类型 */}
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {displayGroupColumn && groupName && (
            <Badge variant="info" className="max-w-full truncate">
              {groupName}
            </Badge>
          )}
          <Badge variant="secondary" className="shrink-0 uppercase">
            {account.type}
          </Badge>
        </div>

        {/* 列 3：动态验证码与倒计时 */}
        <div className="flex items-center">
          <AccountRowCodeButton
            secret={account.secret}
            period={account.period}
            digits={account.digits}
            targetRef={rowRef}
            observeVisibility={!showDragHandle}
          />
        </div>

        {/* 列 4：操作按钮簇 */}
        <div className="flex items-center gap-1 md:justify-end">
          <button
            type="button"
            onClick={handleCopySecret}
            aria-label="复制密钥"
            title={copied === "secret" ? "已复制密钥" : "复制密钥"}
            className={actionBtnBase}
          >
            {copied === "secret" ? (
              <Check className="size-3.5 text-success-foreground" aria-hidden="true" />
            ) : (
              <KeyRound className="size-3.5" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={handleCopyUrl}
            aria-label="复制 otpauth URL"
            title={copied === "url" ? "已复制 URL" : "复制 otpauth URL"}
            className={actionBtnBase}
          >
            {copied === "url" ? (
              <Check className="size-3.5 text-success-foreground" aria-hidden="true" />
            ) : (
              <Link2 className="size-3.5" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setModalMode("detail")}
            aria-label="查看详情"
            title="详情"
            className={actionBtnBase}
          >
            <Info className="size-3.5" aria-hidden="true" />
          </button>

          {onUpdate && (
            <button
              type="button"
              onClick={() => setModalMode("edit")}
              aria-label="编辑账户"
              title="编辑"
              className={actionBtnBase}
            >
              <Pencil className="size-3.5" aria-hidden="true" />
            </button>
          )}

          <button
            type="button"
            onClick={handleDelete}
            aria-label={confirmDelete ? "确认删除账户" : "删除账户"}
            title={confirmDelete ? "再次点击确认删除" : "删除"}
            className={cn(
              "inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-md text-xs transition-colors cursor-pointer",
              confirmDelete
                ? "bg-destructive px-2 font-medium text-white hover:bg-destructive/90"
                : "w-7 text-muted-foreground hover:bg-destructive-surface hover:text-destructive-foreground",
            )}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            {confirmDelete && <span>确认删除</span>}
          </button>
        </div>
      </div>

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
});

export default AccountListRow;
