import { useEffect, useState } from "react";
import { Pencil, X } from "lucide-react";
import { isValidBase32 } from "../lib/validators";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import type { OTPAccount } from "../types";

interface AccountDetailModalProps {
  account: OTPAccount;
  mode: "detail" | "edit";
  onClose: () => void;
  onUpdate?: (
    id: string,
    updates: Partial<Pick<OTPAccount, "name" | "issuer" | "secret" | "remark">>,
  ) => void;
}

export default function AccountDetailModal({ account, mode: initialMode, onClose, onUpdate }: AccountDetailModalProps) {
  const [mode, setMode] = useState(initialMode);
  const [editName, setEditName] = useState(account.name);
  const [editIssuer, setEditIssuer] = useState(account.issuer);
  const [editSecret, setEditSecret] = useState(account.secret);
  const [editRemark, setEditRemark] = useState(account.remark ?? "");
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

    const trimmedRemark = editRemark.trim();
    const updates: Partial<Pick<OTPAccount, "name" | "issuer" | "secret" | "remark">> = {
      name: trimmedName,
      issuer: editIssuer.trim(),
      secret: normalizedSecret,
    };
    if (trimmedRemark !== (account.remark ?? "")) {
      updates.remark = trimmedRemark;
    }

    setError(null);
    if (onUpdate) {
      onUpdate(account.id, updates);
    }
    onClose();
  };

  const handleSwitchToEdit = () => {
    setEditName(account.name);
    setEditIssuer(account.issuer);
    setEditSecret(account.secret);
    setEditRemark(account.remark ?? "");
    setError(null);
    setMode("edit");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-label={mode === "detail" ? "账户详情" : "编辑账户"}
    >
      {/* 遮罩层 */}
      <div className="absolute inset-0 bg-black/45 backdrop-blur-xs" onClick={onClose} aria-hidden="true" />

      {/* 弹窗内容 */}
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h3 className="text-base font-semibold text-card-foreground">
            {mode === "detail" ? "账户详情" : "编辑账户"}
          </h3>
          <div className="flex items-center gap-1.5">
            {mode === "detail" && onUpdate && (
              <Button variant="outline" size="xs" onClick={handleSwitchToEdit}>
                <Pencil className="size-3" aria-hidden="true" />
                编辑
              </Button>
            )}
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="关闭">
              <X className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        {mode === "detail" ? (
          /* 详情视图 */
          <div className="flex flex-col gap-4 px-6 py-5">
            <div>
              <span className="text-xs font-medium text-muted-foreground">服务商 (Issuer)</span>
              <p className="mt-1 text-sm font-medium text-foreground">{account.issuer || "未知"}</p>
            </div>
            <div>
              <span className="text-xs font-medium text-muted-foreground">账户名称 (Name)</span>
              <p className="mt-1 break-all text-sm font-medium text-foreground">{account.name}</p>
            </div>
            <div>
              <span className="text-xs font-medium text-muted-foreground">备注 (Remark)</span>
              <p className="mt-1 break-words text-sm text-foreground">{account.remark || "无"}</p>
            </div>
            <div>
              <span className="text-xs font-medium text-muted-foreground">密钥 (Secret)</span>
              <p className="mt-1 break-all rounded-lg border border-border/70 bg-muted/50 p-2.5 font-mono text-xs text-foreground">
                {account.secret}
              </p>
            </div>
            <div className="grid grid-cols-4 gap-3 rounded-xl border border-border/70 bg-muted/35 p-3">
              <div>
                <span className="text-[11px] text-muted-foreground">类型</span>
                <p className="mt-0.5 text-sm font-semibold uppercase text-foreground">{account.type}</p>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground">位数</span>
                <p className="mt-0.5 text-sm font-semibold text-foreground tabular-nums">{account.digits}</p>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground">周期</span>
                <p className="mt-0.5 text-sm font-semibold text-foreground tabular-nums">{account.period}s</p>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground">算法</span>
                <p className="mt-0.5 text-sm font-semibold text-foreground">{account.algorithm}</p>
              </div>
            </div>
            <div>
              <span className="text-xs font-medium text-muted-foreground">创建时间</span>
              <p className="mt-1 text-sm text-foreground tabular-nums">{new Date(account.createdAt).toLocaleString()}</p>
            </div>
          </div>
        ) : (
          /* 编辑视图 */
          <div className="flex flex-col gap-4 px-6 py-5">
            <div>
              <label htmlFor="edit-account-issuer" className="mb-1.5 block text-xs font-medium text-foreground">
                服务商 (Issuer)
              </label>
              <Input
                id="edit-account-issuer"
                type="text"
                value={editIssuer}
                onChange={(e) => setEditIssuer(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="edit-account-name" className="mb-1.5 block text-xs font-medium text-foreground">
                账户名称 (Name)
              </label>
              <Input
                id="edit-account-name"
                type="text"
                value={editName}
                onChange={(e) => { setEditName(e.target.value); if (error) setError(null); }}
              />
            </div>
            <div>
              <label htmlFor="edit-account-secret" className="mb-1.5 block text-xs font-medium text-foreground">
                密钥 (Secret)
              </label>
              <Input
                id="edit-account-secret"
                type="text"
                value={editSecret}
                onChange={(e) => { setEditSecret(e.target.value); if (error) setError(null); }}
                className="font-mono"
              />
            </div>
            <div>
              <label htmlFor="edit-account-remark" className="mb-1.5 block text-xs font-medium text-foreground">
                备注 (Remark)
              </label>
              <Input
                id="edit-account-remark"
                type="text"
                value={editRemark}
                onChange={(e) => setEditRemark(e.target.value)}
                placeholder="可选，用于标识别的内容"
              />
            </div>
            {error && (
              <Alert variant="destructive" role="alert">
                <AlertDescription className="opacity-100">{error}</AlertDescription>
              </Alert>
            )}
            <div className="flex gap-2.5 pt-1">
              <Button onClick={handleSave} className="flex-1">
                保存
              </Button>
              <Button variant="outline" onClick={onClose} className="flex-1">
                取消
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
