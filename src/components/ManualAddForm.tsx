import { useEffect, useRef, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { isValidBase32, validateOtpauthUrl } from "../lib/validators";
import { parseOtpauthUrl } from "../lib/migration-parser";
import type { OTPAccount, Group } from "../types";
import { ParseError } from "../types";
import { DEFAULT_GROUP_ID } from "../lib/group-manager";
import GroupSelector from "./GroupSelector";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";

interface ManualAddFormProps {
  onAccountAdded: (accounts: OTPAccount[]) => Promise<void> | void;
  groups?: Group[];
}

type InputMode = "manual" | "url";

interface FormErrors {
  secret?: string;
  name?: string;
  url?: string;
  submit?: string;
}

export default function ManualAddForm({ onAccountAdded, groups }: ManualAddFormProps) {
  const [mode, setMode] = useState<InputMode>("manual");
  const [secret, setSecret] = useState("");
  const [name, setName] = useState("");
  const [issuer, setIssuer] = useState("");
  const [url, setUrl] = useState("");
  const [remark, setRemark] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [selectedGroupId, setSelectedGroupId] = useState(DEFAULT_GROUP_ID);
  const [submitting, setSubmitting] = useState(false);
  const mountedRef = useRef(true);
  const draftRevisionRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const clearForm = () => {
    draftRevisionRef.current += 1;
    setSecret("");
    setName("");
    setIssuer("");
    setUrl("");
    setRemark("");
    setErrors({});
    setSelectedGroupId(DEFAULT_GROUP_ID);
  };

  const switchMode = (newMode: InputMode) => {
    if (submitting) {
      return;
    }
    draftRevisionRef.current += 1;
    setMode(newMode);
    setErrors({});
  };

  const submitAccount = async (account: OTPAccount) => {
    const submitRevision = draftRevisionRef.current;
    setSubmitting(true);
    setErrors({});
    try {
      await onAccountAdded([account]);
      if (mountedRef.current && draftRevisionRef.current === submitRevision) {
        clearForm();
      }
    } catch (err) {
      if (mountedRef.current) {
        setErrors({ submit: err instanceof Error ? err.message : "添加账户失败，请重试" });
      }
    } finally {
      if (mountedRef.current) {
        setSubmitting(false);
      }
    }
  };

  const handleManualSubmit = async () => {
    if (submitting) {
      return;
    }

    const newErrors: FormErrors = {};
    const normalizedSecret = secret.replace(/\s+/g, "").toUpperCase();

    if (!normalizedSecret) {
      newErrors.secret = "此字段为必填项";
    } else if (!isValidBase32(normalizedSecret)) {
      newErrors.secret = "密钥格式无效，请输入有效的 base32 编码密钥（A-Z, 2-7）";
    }

    if (!name.trim()) {
      newErrors.name = "此字段为必填项";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const now = Date.now();
    const trimmedRemark = remark.trim();
    const account: OTPAccount = {
      id: crypto.randomUUID(),
      issuer: issuer.trim(),
      name: name.trim(),
      secret: normalizedSecret,
      type: "totp",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      counter: 0,
      createdAt: now,
      updatedAt: now,
      groupId: selectedGroupId,
      ...(trimmedRemark ? { remark: trimmedRemark } : {}),
    };

    await submitAccount(account);
  };

  const handleUrlSubmit = async () => {
    if (submitting) {
      return;
    }

    const newErrors: FormErrors = {};
    const trimmedUrl = url.trim();

    if (!trimmedUrl) {
      newErrors.url = "此字段为必填项";
    } else {
      const validation = validateOtpauthUrl(trimmedUrl);
      if (!validation.valid) {
        newErrors.url = validation.error;
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    let account: OTPAccount;
    try {
      account = parseOtpauthUrl(trimmedUrl);
    } catch (err) {
      if (err instanceof ParseError) {
        setErrors({ url: err.message });
      } else {
        setErrors({ url: "URL 解析失败" });
      }
      return;
    }

    const trimmedRemark = remark.trim();
    account.groupId = selectedGroupId;
    account.updatedAt = account.updatedAt ?? account.createdAt;
    if (trimmedRemark) {
      account.remark = trimmedRemark;
    }

    await submitAccount(account);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "manual") {
      void handleManualSubmit();
    } else {
      void handleUrlSubmit();
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-sm">
            <KeyRound className="size-4 text-primary" aria-hidden="true" />
            手动添加
          </CardTitle>
          <CardDescription className="mt-1">
            输入 Base32 密钥或粘贴 otpauth:// 链接
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          {/* Tab 切换 */}
          <div
            className="mb-4 grid grid-cols-2 gap-1 rounded-lg border border-border/70 bg-muted/80 p-1"
            role="tablist"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === "manual"}
              disabled={submitting}
              onClick={() => switchMode("manual")}
              className={cn(
                "rounded-md py-1.5 text-xs font-medium transition-[color,background-color,box-shadow] duration-150 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer",
                mode === "manual"
                  ? "bg-card text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              手动输入
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "url"}
              disabled={submitting}
              onClick={() => switchMode("url")}
              className={cn(
                "rounded-md py-1.5 text-xs font-medium transition-[color,background-color,box-shadow] duration-150 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer",
                mode === "url"
                  ? "bg-card text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              otpauth:// URL
            </button>
          </div>

          {mode === "manual" ? (
            <div className="flex flex-col gap-3.5" role="tabpanel">
              <div>
                <label htmlFor="manual-secret" className="mb-1.5 block text-xs font-medium text-foreground">
                  密钥 (Secret) <span className="text-destructive">*</span>
                </label>
                <Input
                  id="manual-secret"
                  type="text"
                  disabled={submitting}
                  value={secret}
                  onChange={(e) => {
                    if (submitting) return;
                    draftRevisionRef.current += 1;
                    setSecret(e.target.value);
                    if (errors.secret) setErrors((prev) => ({ ...prev, secret: undefined }));
                  }}
                  placeholder="输入 base32 编码密钥"
                  aria-invalid={!!errors.secret}
                  aria-describedby={errors.secret ? "secret-error" : undefined}
                  className="font-mono"
                />
                {errors.secret && (
                  <p id="secret-error" className="mt-1 text-xs text-destructive" role="alert">
                    {errors.secret}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="manual-name" className="mb-1.5 block text-xs font-medium text-foreground">
                  账户名称 (Name) <span className="text-destructive">*</span>
                </label>
                <Input
                  id="manual-name"
                  type="text"
                  disabled={submitting}
                  value={name}
                  onChange={(e) => {
                    if (submitting) return;
                    draftRevisionRef.current += 1;
                    setName(e.target.value);
                    if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
                  }}
                  placeholder="如邮箱地址"
                  aria-invalid={!!errors.name}
                  aria-describedby={errors.name ? "name-error" : undefined}
                />
                {errors.name && (
                  <p id="name-error" className="mt-1 text-xs text-destructive" role="alert">
                    {errors.name}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="manual-issuer" className="mb-1.5 block text-xs font-medium text-foreground">
                  服务商 (Issuer)
                </label>
                <Input
                  id="manual-issuer"
                  type="text"
                  disabled={submitting}
                  value={issuer}
                  onChange={(e) => {
                    if (submitting) return;
                    draftRevisionRef.current += 1;
                    setIssuer(e.target.value);
                  }}
                  placeholder="如 Google、GitHub"
                />
              </div>

              {groups && groups.length > 0 && (
                <div>
                  <label htmlFor="manual-group" className="mb-1.5 block text-xs font-medium text-foreground">
                    分组
                  </label>
                  <GroupSelector
                    groups={groups}
                    selectedGroupId={selectedGroupId}
                    onSelect={(groupId) => {
                      if (submitting) return;
                      draftRevisionRef.current += 1;
                      setSelectedGroupId(groupId);
                    }}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3.5" role="tabpanel">
              <div>
                <label htmlFor="otpauth-url" className="mb-1.5 block text-xs font-medium text-foreground">
                  otpauth:// URL <span className="text-destructive">*</span>
                </label>
                <Input
                  id="otpauth-url"
                  type="text"
                  disabled={submitting}
                  value={url}
                  onChange={(e) => {
                    if (submitting) return;
                    draftRevisionRef.current += 1;
                    setUrl(e.target.value);
                    if (errors.url) setErrors((prev) => ({ ...prev, url: undefined }));
                  }}
                  placeholder="otpauth://totp/name?secret=xxx&issuer=xxx"
                  aria-invalid={!!errors.url}
                  aria-describedby={errors.url ? "url-error" : undefined}
                  className="font-mono"
                />
                {errors.url && (
                  <p id="url-error" className="mt-1 text-xs text-destructive" role="alert">
                    {errors.url}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="mt-3.5">
            <label htmlFor="manual-remark" className="mb-1.5 block text-xs font-medium text-foreground">
              备注 (Remark)
            </label>
            <Input
              id="manual-remark"
              type="text"
              disabled={submitting}
              value={remark}
              onChange={(e) => {
                if (submitting) return;
                draftRevisionRef.current += 1;
                setRemark(e.target.value);
              }}
              placeholder="可选，用于标识别的内容"
            />
          </div>

          {errors.submit && (
            <p className="mt-3 text-xs text-destructive" role="alert">
              {errors.submit}
            </p>
          )}

          <Button
            type="submit"
            disabled={submitting}
            className="mt-5 w-full"
          >
            {submitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {submitting ? "添加中..." : "添加账户"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
