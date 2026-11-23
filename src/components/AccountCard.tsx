import { memo, useState, useCallback, useRef, useEffect, type HTMLAttributes, type RefObject } from "react";
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
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { cn } from "../lib/utils";
import type { OTPAccount } from "../types";

interface AccountCardProps {
  account: OTPAccount;
  onDelete: (id: string) => void;
  onUpdate?: (
    id: string,
    updates: Partial<Pick<OTPAccount, "name" | "issuer" | "secret" | "remark">>,
  ) => void;
  groupName?: string;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  dragProps?: HTMLAttributes<HTMLDivElement>;
  isDragging?: boolean;
  isDragOverlay?: boolean;
  showDragHandle?: boolean;
  dragPlaceholderCount?: number;
}

type CopiedField = "secret" | "url" | null;
type ModalMode = "detail" | "edit" | null;

interface AccountCardCodeButtonProps {
  secret: string;
  period: number;
  digits: number;
  targetRef: RefObject<HTMLDivElement | null>;
  observeVisibility: boolean;
}

const AccountCardCodeButton = memo(function AccountCardCodeButton({
  secret,
  period,
  digits,
  targetRef,
  observeVisibility,
}: AccountCardCodeButtonProps) {
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
        "group flex w-full items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/45 px-[var(--card-code-px,0.875rem)] py-[var(--card-code-py,0.625rem)] transition-[background-color,border-color,transform] duration-150",
        code
          ? "cursor-pointer hover:border-border hover:bg-muted/80 active:scale-[0.99]"
          : "cursor-not-allowed opacity-60",
      )}
    >
      <span
        className={
          code
            ? "font-mono text-[length:var(--card-code-size,1.5rem)] leading-tight font-bold tracking-[var(--card-code-tracking,0.18em)] text-foreground tabular-nums"
            : "text-sm font-medium text-destructive"
        }
      >
        {formattedCode}
      </span>
      <div className="flex items-center gap-2 shrink-0">
        <div className="relative size-8" aria-label={`剩余 ${remaining} 秒`}>
          <svg className="size-8 -rotate-90" viewBox="0 0 32 32" aria-hidden="true">
            <circle
              cx="16"
              cy="16"
              r="14"
              fill="none"
              className="stroke-border"
              strokeWidth="2.75"
            />
            <circle
              cx="16"
              cy="16"
              r="14"
              fill="none"
              className={cn(
                "transition-colors duration-150",
                isExpiringSoon ? "stroke-destructive" : "stroke-primary",
              )}
              strokeWidth="2.75"
              strokeDasharray={`${(progress / 100) * 87.96} 87.96`}
              strokeLinecap="round"
            />
          </svg>
          <span
            className={cn(
              "absolute inset-0 flex items-center justify-center text-[11px] font-semibold tabular-nums",
              isExpiringSoon ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {remaining}
          </span>
        </div>
        {copied ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-success-foreground">
            <Check className="size-3.5" aria-hidden="true" />
            已复制
          </span>
        ) : (
          <Copy
            className="size-4 text-muted-foreground transition-colors group-hover:text-foreground"
            aria-hidden="true"
          />
        )}
      </div>
    </button>
  );
});

const AccountCard = memo(function AccountCard({
  account,
  onDelete,
  onUpdate,
  groupName,
  selected,
  onToggleSelect,
  dragProps,
  isDragging = false,
  isDragOverlay = false,
  showDragHandle = false,
  dragPlaceholderCount,
}: AccountCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
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

  return (
    <>
      <Card
        ref={cardRef}
        {...dragProps}
        data-pinned={isPinned ? "true" : "false"}
        data-drag-placeholder={isDragging ? "true" : undefined}
        data-dragging={isDragging ? "true" : undefined}
        data-selectable-id={!isDragOverlay && onToggleSelect ? account.id : undefined}
        data-no-marquee={!isDragOverlay && showDragHandle ? "true" : undefined}
        className={cn(
          "relative overflow-hidden transition-[border-color,box-shadow,background-color] duration-150 hover:shadow-sm",
          !isDragOverlay && !isDragging && "account-card-cv",
          isPinned && "border-pin/45 ring-1 ring-pin/15",
          selected && "border-primary/50 ring-2 ring-primary/20",
          showDragHandle && "group/card select-none",
          isDragging &&
            "border-dashed border-primary/50 bg-primary/[0.04] shadow-none ring-0 hover:shadow-none [&>*:not([data-drag-placeholder-label])]:opacity-0 [&>*:not([data-drag-placeholder-label])]:pointer-events-none",
          dragProps?.className,
        )}
      >
        {isDragging && dragPlaceholderCount && dragPlaceholderCount > 1 && (
          <div
            data-drag-placeholder-label="true"
            className="pointer-events-none absolute inset-0 flex items-center justify-center px-3"
          >
            <span className="rounded-full border border-primary/35 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary shadow-2xs">
              将移入 {dragPlaceholderCount} 个账户
            </span>
          </div>
        )}
        {isPinned && (
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-pin"
            aria-hidden="true"
          />
        )}

        {/* 头部：账户信息 */}
        <div className="flex items-start justify-between gap-2 px-[var(--card-pad-x,1rem)] pt-[var(--card-pad-top,1rem)] pb-[var(--card-pad-gap,0.625rem)]">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            {onToggleSelect && (
              <input
                type="checkbox"
                checked={!!selected}
                onChange={() => onToggleSelect(account.id)}
                aria-label={`选择账户 ${account.issuer || account.name}`}
                className="size-4 shrink-0 rounded border-input accent-primary cursor-pointer"
              />
            )}
            <div className="flex size-[var(--card-icon-box,2.5rem)] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-muted/60">
              {iconUrl && !iconError ? (
                <img
                  src={iconUrl}
                  alt={account.issuer || "服务图标"}
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  className="size-6 object-contain"
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
                  className="size-full"
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-semibold text-card-foreground">
                {account.issuer || "未知服务"}
              </h3>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {account.name}
              </p>
            </div>
          </div>
          {showDragHandle && (
            <span
              data-drag-handle="true"
              title="拖拽调整顺序"
              aria-hidden="true"
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/45 transition-colors duration-150 group-hover/card:text-muted-foreground hover:bg-accent hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
            >
              <GripVertical className="size-4" />
            </span>
          )}
        </div>

        {/* 元信息徽章 */}
        <div className="flex flex-wrap items-center gap-1.5 px-[var(--card-pad-x,1rem)] pb-[var(--card-pad-gap,0.625rem)]">
          <Badge variant="secondary" className="uppercase">
            {account.type}
          </Badge>
          {groupName && <Badge variant="info">{groupName}</Badge>}
        </div>

        {/* 可选备注展示 */}
        {account.remark && (
          <p
            data-slot="account-remark"
            title={account.remark}
            className="mx-[var(--card-pad-x,1rem)] mb-[var(--card-pad-gap,0.625rem)] flex items-center gap-1.5 truncate rounded-lg bg-muted/45 px-2.5 py-1 text-xs text-muted-foreground"
          >
            <StickyNote className="size-3 shrink-0 text-muted-foreground/80" aria-hidden="true" />
            <span className="truncate">{account.remark}</span>
          </p>
        )}

        {/* 验证码展示与一键复制（独立高频刷新叶子组件） */}
        <div className="px-[var(--card-pad-x,1rem)] pb-[var(--card-pad-bottom,0.75rem)]">
          <AccountCardCodeButton
            secret={account.secret}
            period={account.period}
            digits={account.digits}
            targetRef={cardRef}
            observeVisibility={!isDragOverlay}
          />
        </div>

        {/* 底部操作条（单行紧凑防换行） */}
        <div className="mt-auto flex flex-nowrap items-center gap-0.5 border-t border-border/60 bg-muted/20 px-[var(--card-footer-px,0.625rem)] py-[var(--card-footer-py,0.375rem)]">
          <button
            type="button"
            onClick={handleCopySecret}
            aria-label="复制密钥"
            className="inline-flex h-7 shrink-0 whitespace-nowrap items-center gap-[var(--card-action-gap,0.25rem)] rounded-md px-[var(--card-action-px,0.375rem)] text-[length:var(--card-action-font,0.75rem)] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
          >
            <KeyRound className="size-3.5" aria-hidden="true" />
            {copied === "secret" ? (
              <span className="font-medium text-success-foreground">已复制</span>
            ) : (
              "密钥"
            )}
          </button>

          <button
            type="button"
            onClick={handleCopyUrl}
            aria-label="复制 otpauth URL"
            className="inline-flex h-7 shrink-0 whitespace-nowrap items-center gap-[var(--card-action-gap,0.25rem)] rounded-md px-[var(--card-action-px,0.375rem)] text-[length:var(--card-action-font,0.75rem)] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
          >
            <Link2 className="size-3.5" aria-hidden="true" />
            {copied === "url" ? (
              <span className="font-medium text-success-foreground">已复制</span>
            ) : (
              "URL"
            )}
          </button>

          <button
            type="button"
            onClick={() => setModalMode("detail")}
            aria-label="查看详情"
            className="inline-flex h-7 shrink-0 whitespace-nowrap items-center gap-[var(--card-action-gap,0.25rem)] rounded-md px-[var(--card-action-px,0.375rem)] text-[length:var(--card-action-font,0.75rem)] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
          >
            <Info className="size-3.5" aria-hidden="true" />
            详情
          </button>

          {onUpdate && (
            <button
              type="button"
              onClick={() => setModalMode("edit")}
              aria-label="编辑账户"
              className="inline-flex h-7 shrink-0 whitespace-nowrap items-center gap-[var(--card-action-gap,0.25rem)] rounded-md px-[var(--card-action-px,0.375rem)] text-[length:var(--card-action-font,0.75rem)] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
            >
              <Pencil className="size-3.5" aria-hidden="true" />
              编辑
            </button>
          )}

          <button
            type="button"
            onClick={handleDelete}
            aria-label={confirmDelete ? "确认删除账户" : "删除账户"}
            className={cn(
              "ml-auto inline-flex h-7 shrink-0 whitespace-nowrap items-center gap-[var(--card-action-gap,0.25rem)] rounded-md px-[var(--card-action-px,0.375rem)] text-[length:var(--card-action-font,0.75rem)] transition-colors cursor-pointer",
              confirmDelete
                ? "bg-destructive font-medium text-white hover:bg-destructive/90"
                : "text-muted-foreground hover:bg-destructive-surface hover:text-destructive-foreground",
            )}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            {confirmDelete ? "确认删除" : "删除"}
          </button>
        </div>
      </Card>

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
});

export default AccountCard;
