import { useState, useRef, useCallback, useEffect } from "react";
import { decodeQRFromFile, decodeQRFromClipboard } from "../lib/qr-decoder";
import { parseQRContent } from "../lib/migration-parser";
import type { OTPAccount } from "../types";
import { QRDecodeError, ParseError } from "../types";

interface ImageUploaderProps {
  onAccountsDecoded: (accounts: OTPAccount[]) => void;
}

export default function ImageUploader({ onAccountsDecoded }: ImageUploaderProps) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 显示错误信息，3 秒后自动消失
  const showError = useCallback((message: string) => {
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current);
    }
    setError(message);
    errorTimerRef.current = setTimeout(() => {
      setError(null);
      errorTimerRef.current = null;
    }, 3000);
  }, []);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current);
      }
    };
  }, []);

  // 核心解码流程：多个 File → QR_Decoder → parseQRContent → onAccountsDecoded
  const processFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setLoading(true);
      setError(null);
      const allAccounts: OTPAccount[] = [];
      const errors: string[] = [];
      for (const file of files) {
        try {
          const qrContent = await decodeQRFromFile(file);
          const accounts = parseQRContent(qrContent);
          allAccounts.push(...accounts);
        } catch (err) {
          const msg = err instanceof QRDecodeError || err instanceof ParseError
            ? `${file.name}: ${err.message}`
            : `${file.name}: 解码失败`;
          errors.push(msg);
        }
      }
      if (allAccounts.length > 0) {
        onAccountsDecoded(allAccounts);
      }
      if (errors.length > 0) {
        showError(errors.join("\n"));
      }
      setLoading(false);
    },
    [onAccountsDecoded, showError]
  );

  // 从剪贴板解码
  const processClipboard = useCallback(
    async (clipboardItems: ClipboardItems) => {
      setLoading(true);
      setError(null);
      try {
        const qrContent = await decodeQRFromClipboard(clipboardItems);
        const accounts = parseQRContent(qrContent);
        onAccountsDecoded(accounts);
      } catch (err) {
        if (err instanceof QRDecodeError || err instanceof ParseError) {
          showError(err.message);
        } else {
          showError("解码过程中发生未知错误");
        }
      } finally {
        setLoading(false);
      }
    },
    [onAccountsDecoded, showError]
  );

  // 点击上传
  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFiles(Array.from(files));
    }
    // 重置 input 以便重复选择同一文件
    e.target.value = "";
  };

  // 拖拽事件
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      processFiles(files);
    }
  };

  // Ctrl+V 粘贴（支持多图）
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
        return;
      }
      // 优先从 clipboardData 获取文件（支持多图）
      const files: File[] = [];
      if (e.clipboardData?.files && e.clipboardData.files.length > 0) {
        files.push(...Array.from(e.clipboardData.files));
      }
      if (files.length > 0) {
        processFiles(files);
        return;
      }
      // fallback: 使用 clipboard API
      try {
        const items = await navigator.clipboard.read();
        processClipboard(items);
      } catch {
        // 剪贴板 API 不可用时静默忽略
      }
    };

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [processFiles, processClipboard]);

  return (
    <div className="w-full">
      <div
        role="button"
        tabIndex={0}
        aria-label="上传二维码图片，支持点击、拖拽或 Ctrl+V 粘贴"
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
          }
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative flex flex-col items-center justify-center
          w-full min-h-[180px] p-6
          border-2 border-dashed rounded-xl
          cursor-pointer transition-colors duration-200
          ${isDragOver
            ? "border-blue-500 bg-blue-50"
            : "border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50"
          }
          ${loading ? "pointer-events-none opacity-60" : ""}
        `}
      >
        {loading ? (
          <div className="flex flex-col items-center gap-2">
            <svg
              className="animate-spin h-8 w-8 text-blue-500"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm text-gray-500">正在解码...</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-gray-500">
            <svg
              className="h-10 w-10"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
              />
            </svg>
            <p className="text-sm font-medium">点击选择或拖拽二维码图片到此处</p>
            <p className="text-xs text-gray-400">支持 Ctrl+V 粘贴图片 · PNG / JPG / GIF</p>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/bmp,image/webp"
          multiple
          onChange={handleFileChange}
          className="hidden"
          aria-hidden="true"
        />
      </div>

      {error && (
        <div
          role="alert"
          className="mt-3 px-4 py-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg"
        >
          {error}
        </div>
      )}
    </div>
  );
}
