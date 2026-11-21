import { useEffect, useRef, useState } from "react";
import { isValidBase32, validateOtpauthUrl } from "../lib/validators";
import { parseOtpauthUrl } from "../lib/migration-parser";
import type { OTPAccount, Group } from "../types";
import { ParseError } from "../types";
import { DEFAULT_GROUP_ID } from "../lib/group-manager";
import GroupSelector from "./GroupSelector";

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

    account.groupId = selectedGroupId;
    account.updatedAt = account.updatedAt ?? account.createdAt;

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
    <form onSubmit={handleSubmit} className="w-full bg-white rounded-xl border border-gray-200 p-5">
      {/* Tab 切换 */}
      <div className="flex gap-1 mb-5 bg-gray-100 rounded-lg p-1" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "manual"}
          disabled={submitting}
          onClick={() => switchMode("manual")}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
            mode === "manual"
              ? "bg-white text-gray-800 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          手动输入
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "url"}
          disabled={submitting}
          onClick={() => switchMode("url")}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
            mode === "url"
              ? "bg-white text-gray-800 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          otpauth:// URL
        </button>
      </div>

      {mode === "manual" ? (
        <div className="space-y-4" role="tabpanel">
          {/* Secret */}
          <div>
            <label htmlFor="manual-secret" className="block text-sm font-medium text-gray-700 mb-1">
              密钥 (Secret) <span className="text-red-500">*</span>
            </label>
            <input
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
              className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:cursor-not-allowed ${
                errors.secret ? "border-red-400" : "border-gray-300"
              }`}
            />
            {errors.secret && (
              <p id="secret-error" className="mt-1 text-xs text-red-600" role="alert">
                {errors.secret}
              </p>
            )}
          </div>

          {/* Name */}
          <div>
            <label htmlFor="manual-name" className="block text-sm font-medium text-gray-700 mb-1">
              账户名称 (Name) <span className="text-red-500">*</span>
            </label>
            <input
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
              className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:cursor-not-allowed ${
                errors.name ? "border-red-400" : "border-gray-300"
              }`}
            />
            {errors.name && (
              <p id="name-error" className="mt-1 text-xs text-red-600" role="alert">
                {errors.name}
              </p>
            )}
          </div>

          {/* Issuer */}
          <div>
            <label htmlFor="manual-issuer" className="block text-sm font-medium text-gray-700 mb-1">
              服务商 (Issuer)
            </label>
            <input
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
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:cursor-not-allowed"
            />
          </div>

          {/* Group Selector */}
          {groups && groups.length > 0 && (
            <div>
              <label htmlFor="manual-group" className="block text-sm font-medium text-gray-700 mb-1">
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
        <div className="space-y-4" role="tabpanel">
          <div>
            <label htmlFor="otpauth-url" className="block text-sm font-medium text-gray-700 mb-1">
              otpauth:// URL <span className="text-red-500">*</span>
            </label>
            <input
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
              className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:cursor-not-allowed ${
                errors.url ? "border-red-400" : "border-gray-300"
              }`}
            />
            {errors.url && (
              <p id="url-error" className="mt-1 text-xs text-red-600" role="alert">
                {errors.url}
              </p>
            )}
          </div>
        </div>
      )}

      {errors.submit && (
        <p className="mt-3 text-xs text-red-600" role="alert">
          {errors.submit}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="mt-5 w-full py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        {submitting ? "添加中..." : "添加账户"}
      </button>
    </form>
  );
}
