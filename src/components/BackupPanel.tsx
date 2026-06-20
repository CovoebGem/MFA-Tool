import { useState, useRef, useCallback } from "react";
import { save, open } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import {
  exportToJSON,
  parseBackupJSON,
  downloadFile,
  generateBackupFilename,
} from "../lib/backup";
import type { OTPAccount, Group } from "../types";

interface BackupPanelProps {
  accounts: OTPAccount[];
  groups: Group[];
  selectedAccountIds?: Set<string>;
  onImport: (accounts: OTPAccount[], groups: Group[]) => void;
  onToast: (message: string, type: "success" | "error") => void;
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getExportAccounts = useCallback(() => {
    if (selectedAccountIds && selectedAccountIds.size > 0) {
      return accounts.filter(a => selectedAccountIds.has(a.id));
    }
    return accounts;
  }, [accounts, selectedAccountIds]);

  const handleExport = async () => {
    const exportAccounts = getExportAccounts();
    
    if (exportAccounts.length === 0) {
      onToast("没有账户可导出", "error");
      return;
    }
    
    const json = await exportToJSON(exportAccounts, groups);
    
    try {
      const filePath = await save({
        defaultPath: generateBackupFilename(),
        filters: [
          {
            name: "JSON",
            extensions: ["json"],
          },
        ],
      });
      
      if (filePath) {
        await writeTextFile(filePath, json);
        onToast(`成功导出 ${exportAccounts.length} 个账户到: ${filePath}`, "success");
      }
    } catch (err) {
      console.error("Export error:", err);
      if (String(err).includes("cancelled") || String(err).includes("Cancel")) {
        return;
      }
      downloadFile(json, generateBackupFilename(), "application/json");
      onToast(`成功导出 ${exportAccounts.length} 个账户`, "success");
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
      onImport(data.accounts, data.groups);
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
      onImport(data.accounts, data.groups);
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

  const hasSelection = selectedAccountIds && selectedAccountIds.size > 0;
  const exportCount = hasSelection ? selectedAccountIds.size : accounts.length;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleExport}
        disabled={exportCount === 0}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <DownloadIcon className="w-4 h-4" />
        {hasSelection ? `导出选中 (${selectedAccountIds.size})` : "导出全部"}
      </button>

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
