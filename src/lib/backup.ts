import type { OTPAccount, Group } from "../types";

export interface BackupData {
  version: 1;
  exportedAt: string;
  accounts: OTPAccount[];
  groups: Group[];
}

export function createBackupData(accounts: OTPAccount[], groups: Group[]): BackupData {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    accounts,
    groups,
  };
}

export function validateBackupData(data: unknown): data is BackupData {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  
  if (obj.version !== 1) return false;
  if (typeof obj.exportedAt !== "string") return false;
  if (!Array.isArray(obj.accounts)) return false;
  if (!Array.isArray(obj.groups)) return false;

  for (const account of obj.accounts) {
    if (typeof account !== "object" || account === null) return false;
    const a = account as Record<string, unknown>;
    if (typeof a.id !== "string") return false;
    if (typeof a.issuer !== "string") return false;
    if (typeof a.name !== "string") return false;
    if (typeof a.secret !== "string") return false;
  }

  for (const group of obj.groups) {
    if (typeof group !== "object" || group === null) return false;
    const g = group as Record<string, unknown>;
    if (typeof g.id !== "string") return false;
    if (typeof g.name !== "string") return false;
  }

  return true;
}

export async function exportToJSON(accounts: OTPAccount[], groups: Group[]): Promise<string> {
  const data = createBackupData(accounts, groups);
  return JSON.stringify(data, null, 2);
}

export function parseBackupJSON(json: string): BackupData {
  const data = JSON.parse(json);
  if (!validateBackupData(data)) {
    throw new Error("无效的备份文件格式");
  }
  return data;
}

export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function generateBackupFilename(): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, "-");
  return `2fa-backup-${dateStr}_${timeStr}.json`;
}
