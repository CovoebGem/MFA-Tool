import { useState, useRef, useCallback, useEffect } from "react";
import { AlertCircle, Loader2, QrCode, Upload } from "lucide-react";
import { decodeQRFromFile, decodeQRFromClipboard } from "../lib/qr-decoder";
import { parseQRContent } from "../lib/migration-parser";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Alert, AlertDescription } from "./ui/alert";
import { Kbd } from "./ui/kbd";
import { cn } from "../lib/utils";
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
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-sm">
            <QrCode className="size-4 text-primary" aria-hidden="true" />
            二维码导入
          </CardTitle>
          <CardDescription className="mt-1">
            支持单图、多图及 Google Authenticator 迁移码
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
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
          className={cn(
            "relative flex min-h-[192px] w-full flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-[border-color,background-color] duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            isDragOver
              ? "border-primary bg-primary/5"
              : "border-border bg-muted/30 hover:border-primary/40 hover:bg-muted/55",
            loading && "pointer-events-none opacity-60",
          )}
        >
          {loading ? (
            <div className="flex flex-col items-center gap-2.5">
              <Loader2 className="size-7 animate-spin text-primary" aria-hidden="true" />
              <span className="text-sm text-muted-foreground">正在解码...</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2.5">
              <div className="flex size-11 items-center justify-center rounded-xl border border-border/80 bg-card text-muted-foreground shadow-2xs">
                <Upload className="size-5" aria-hidden="true" />
              </div>
              <p className="text-sm font-medium text-foreground">
                点击选择或拖拽二维码图片到此处
              </p>
              <p className="flex flex-wrap items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <span>支持</span>
                <Kbd>Ctrl+V</Kbd>
                <span>粘贴图片 · PNG / JPG / GIF</span>
              </p>
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
          <Alert variant="destructive" role="alert" className="mt-3">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <AlertDescription className="whitespace-pre-line opacity-100">
              {error}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
