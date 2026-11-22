import { useState, useRef, useCallback, useEffect } from "react";
import { ChevronDown, Download, Upload } from "lucide-react";
import { save, open } from "@tauri-apps/plugin-dialog";
import { writeFile, writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import {
  exportToJSON,
  parseBackupJSON,
  downloadFile,
} from "../lib/backup";
import {
  exportToTXT,
  exportToXLSX,
  generateExportFilename,
  type ExportFormat,
} from "../lib/account-export";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";
import type { OTPAccount, Group } from "../types";

interface BackupPanelProps {
  accounts: OTPAccount[];
  groups: Group[];
  selectedAccountIds?: Set<string>;
  onImport: (accounts: OTPAccount[], groups: Group[]) => Promise<void> | void;
  onToast: (message: string, type: "success" | "error") => void;
}

const EXPORT_FORMAT_OPTIONS: ReadonlyArray<{
  format: ExportFormat;
  label: string;
  description: string;
  filterName: string;
  extensions: string[];
  mimeType: string;
}> = [
  {
    format: "xlsx",
    label: "Excel 表格（.xlsx）",
    description: "按服务商分段，分列展示邮箱与密钥",
    filterName: "Excel 工作簿",
    extensions: ["xlsx"],
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  {
    format: "txt",
    label: "TXT 文本（.txt）",
    description: "按服务商分段，每行 邮箱——2FA密钥",
    filterName: "纯文本",
    extensions: ["txt"],
    mimeType: "text/plain;charset=utf-8",
  },
  {
    format: "json",
    label: "JSON 备份（.json）",
    description: "完整备份数据，可用于导入恢复",
    filterName: "JSON",
    extensions: ["json"],
    mimeType: "application/json",
  },
];

export default function BackupPanel({ accounts, groups, selectedAccountIds, onImport, onToast }: BackupPanelProps) {
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const exportContainerRef = useRef<HTMLDivElement>(null);
  const exportButtonRef = useRef<HTMLButtonElement>(null);

  const hasSelection = Boolean(selectedAccountIds && selectedAccountIds.size > 0);
  const exportCount = hasSelection ? selectedAccountIds!.size : accounts.length;
  const showExportMenu = exportMenuOpen && exportCount > 0 && !exporting;

  useEffect(() => {
    if (!showExportMenu) {
      return;
    }

    const handleMouseDown = (event: MouseEvent) => {
      if (
        exportContainerRef.current &&
        !exportContainerRef.current.contains(event.target as Node)
      ) {
        setExportMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.isComposing && event.keyCode !== 229 && event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setExportMenuOpen(false);
        exportButtonRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [showExportMenu]);

  const getExportAccounts = useCallback(() => {
    if (selectedAccountIds && selectedAccountIds.size > 0) {
      return accounts.filter(a => selectedAccountIds.has(a.id));
    }
    return accounts;
  }, [accounts, selectedAccountIds]);

  const handleExportFormat = async (option: (typeof EXPORT_FORMAT_OPTIONS)[number]) => {
    setExportMenuOpen(false);
    if (exporting) {
      return;
    }

    const exportAccounts = getExportAccounts();

    if (exportAccounts.length === 0) {
      onToast("没有账户可导出", "error");
      return;
    }

    setExporting(true);
    try {
      const filename = generateExportFilename(option.format);
      const payload: string | Uint8Array =
        option.format === "xlsx"
          ? exportToXLSX(exportAccounts)
          : option.format === "txt"
            ? exportToTXT(exportAccounts)
            : await exportToJSON(exportAccounts, groups);

      let filePath: string | null;
      try {
        filePath = await save({
          defaultPath: filename,
          filters: [
            {
              name: option.filterName,
              extensions: option.extensions,
            },
          ],
        });
      } catch (err) {
        if (String(err).includes("cancelled") || String(err).includes("Cancel")) {
          return;
        }
        downloadFile(payload, filename, option.mimeType);
        onToast(`成功导出 ${exportAccounts.length} 个账户`, "success");
        return;
      }

      if (!filePath) {
        return;
      }

      if (typeof payload === "string") {
        await writeTextFile(filePath, payload);
      } else {
        await writeFile(filePath, payload);
      }
      onToast(`成功导出 ${exportAccounts.length} 个账户到: ${filePath}`, "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "写入导出文件失败";
      onToast(`导出失败：${message}`, "error");
    } finally {
      setExporting(false);
    }
  };

  const handleImportClick = async () => {
    try {
      const filePath = await open({
        multiple: false,
        filters: [
          {
            name: "JSON",
            extensions: ["json"],
          },
        ],
      });

      if (filePath && typeof filePath === "string") {
        await handleImportFile(filePath);
      }
    } catch (err) {
      console.error("Import error:", err);
      if (String(err).includes("cancelled") || String(err).includes("Cancel")) {
        return;
      }
      fileInputRef.current?.click();
    }
  };

  const handleImportFile = async (filePath: string) => {
    setImporting(true);
    try {
      const text = await readTextFile(filePath);
      const data = parseBackupJSON(text);
      await onImport(data.accounts, data.groups);
      onToast("成功导入备份，已合并现有数据", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "导入失败";
      onToast(message, "error");
    } finally {
      setImporting(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const text = await file.text();
      const data = parseBackupJSON(text);
      await onImport(data.accounts, data.groups);
      onToast("成功导入备份，已合并现有数据", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "导入失败";
      onToast(message, "error");
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="flex items-center gap-2">
      <div className="relative" ref={exportContainerRef}>
        <Button
          ref={exportButtonRef}
          variant="outline"
          size="sm"
          onClick={() => setExportMenuOpen((prev) => !prev)}
          disabled={exportCount === 0 || exporting}
          aria-haspopup="menu"
          aria-expanded={showExportMenu}
        >
          <Download className="size-3.5" aria-hidden="true" />
          <span>{hasSelection ? `导出选中 (${selectedAccountIds?.size})` : "导出"}</span>
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform duration-150",
              showExportMenu && "rotate-180",
            )}
            aria-hidden="true"
          />
        </Button>

        {showExportMenu && (
          <div
            role="menu"
            aria-label="选择导出格式"
            className="absolute right-0 z-40 mt-2 w-72 origin-top-right rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg"
          >
            {EXPORT_FORMAT_OPTIONS.map((option) => (
              <button
                key={option.format}
                type="button"
                role="menuitem"
                onClick={() => void handleExportFormat(option)}
                className="flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent cursor-pointer"
              >
                <span className="text-sm font-medium text-foreground">
                  {option.label}
                </span>
                <span className="text-xs text-muted-foreground">
                  {option.description}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={handleImportClick}
        disabled={importing}
      >
        <Upload className="size-3.5" aria-hidden="true" />
        {importing ? "导入中..." : "导入"}
      </Button>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
