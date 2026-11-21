import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import BackupPanel from "../BackupPanel";
import type { Group, OTPAccount } from "../../types";

const dialogMocks = vi.hoisted(() => ({
  open: vi.fn(),
  save: vi.fn(),
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => dialogMocks.open(...args),
  save: (...args: unknown[]) => dialogMocks.save(...args),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: (...args: unknown[]) => dialogMocks.readTextFile(...args),
  writeTextFile: (...args: unknown[]) => dialogMocks.writeTextFile(...args),
}));

const sampleGroups: Group[] = [
  { id: "default", name: "默认", isDefault: true, createdAt: 0 },
];

const sampleAccounts: OTPAccount[] = [
  {
    id: "acc-1",
    issuer: "GitHub",
    name: "alice@example.com",
    secret: "JBSWY3DPEHPK3PXP",
    type: "totp",
    counter: 0,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    createdAt: 1,
    groupId: "default",
  },
];

const validBackupJson = JSON.stringify({
  version: 1,
  exportedAt: "2026-01-01T00:00:00.000Z",
  accounts: sampleAccounts,
  groups: sampleGroups,
});

describe("BackupPanel", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("waits for async onImport completion before showing success toast on Tauri file import", async () => {
    let resolveImport!: () => void;
    const onImport = vi.fn(
      () => new Promise<void>((resolve) => { resolveImport = resolve; }),
    );
    const onToast = vi.fn();

    dialogMocks.open.mockResolvedValue("/tmp/backup.json");
    dialogMocks.readTextFile.mockResolvedValue(validBackupJson);

    render(
      <BackupPanel
        accounts={[]}
        groups={sampleGroups}
        onImport={onImport}
        onToast={onToast}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /导入备份/ }));

    await waitFor(() => {
      expect(onImport).toHaveBeenCalledOnce();
    });

    expect(onToast).not.toHaveBeenCalled();

    resolveImport();

    await waitFor(() => {
      expect(onToast).toHaveBeenCalledWith("成功导入备份，已合并现有数据", "success");
    });
  });

  it("shows error toast when async onImport rejects on browser file input import", async () => {
    const onImport = vi.fn().mockRejectedValue(new Error("写入磁盘失败"));
    const onToast = vi.fn();

    const { container } = render(
      <BackupPanel
        accounts={[]}
        groups={sampleGroups}
        onImport={onImport}
        onToast={onToast}
      />,
    );

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([validBackupJson], "backup.json", { type: "application/json" });
    Object.defineProperty(file, "text", {
      value: vi.fn().mockResolvedValue(validBackupJson),
    });

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(onToast).toHaveBeenCalledWith("写入磁盘失败", "error");
    });
    expect(onToast).not.toHaveBeenCalledWith("成功导入备份，已合并现有数据", "success");
  });
});
