import { useState, useRef, useCallback, useEffect } from "react";
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

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
    </svg>
  );
}

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
        <button
          ref={exportButtonRef}
          type="button"
          onClick={() => setExportMenuOpen((prev) => !prev)}
          disabled={exportCount === 0 || exporting}
          aria-haspopup="menu"
          aria-expanded={showExportMenu}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <DownloadIcon className="w-4 h-4" />
          <span>{hasSelection ? `导出选中 (${selectedAccountIds?.size})` : "导出全部"}</span>
          <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform ${showExportMenu ? "rotate-180" : ""}`} />
        </button>

        {showExportMenu && (
          <div
            role="menu"
            aria-label="选择导出格式"
            className="absolute right-0 z-40 mt-2 w-72 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-1.5 shadow-lg"
          >
            {EXPORT_FORMAT_OPTIONS.map((option) => (
              <button
                key={option.format}
                type="button"
                role="menuitem"
                onClick={() => void handleExportFormat(option)}
                className="flex w-full flex-col items-start rounded-lg px-3 py-2 text-left transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
                  {option.label}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {option.description}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={handleImportClick}
        disabled={importing}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <UploadIcon className="w-4 h-4" />
        {importing ? "导入中..." : "导入备份"}
      </button>

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
