import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import BackupPanel from "../BackupPanel";
import type { Group, OTPAccount } from "../../types";

const dialogMocks = vi.hoisted(() => ({
  open: vi.fn(),
  save: vi.fn(),
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => dialogMocks.open(...args),
  save: (...args: unknown[]) => dialogMocks.save(...args),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: (...args: unknown[]) => dialogMocks.readTextFile(...args),
  writeTextFile: (...args: unknown[]) => dialogMocks.writeTextFile(...args),
  writeFile: (...args: unknown[]) => dialogMocks.writeFile(...args),
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

    fireEvent.click(screen.getByRole("button", { name: "导入" }));

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

  it("opens export menu and exports Excel (.xlsx) grouped by issuer via writeFile", async () => {
    const onToast = vi.fn();
    dialogMocks.save.mockResolvedValue("/tmp/export.xlsx");
    dialogMocks.writeFile.mockResolvedValue(undefined);

    render(
      <BackupPanel
        accounts={sampleAccounts}
        groups={sampleGroups}
        onImport={vi.fn()}
        onToast={onToast}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "导出" }));
    expect(screen.getByRole("menu", { name: "选择导出格式" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: /Excel 表格（\.xlsx）/ }));

    await waitFor(() => {
      expect(dialogMocks.save).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultPath: expect.stringMatching(/\.xlsx$/),
          filters: [{ name: "Excel 工作簿", extensions: ["xlsx"] }],
        }),
      );
      expect(dialogMocks.writeFile).toHaveBeenCalledTimes(1);
    });

    const [writtenPath, writtenBytes] = dialogMocks.writeFile.mock.calls[0] as [string, Uint8Array];
    expect(writtenPath).toBe("/tmp/export.xlsx");
    expect(writtenBytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(writtenBytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(onToast).toHaveBeenCalledWith("成功导出 1 个账户到: /tmp/export.xlsx", "success");
  });

  it("exports TXT grouped by issuer with 邮箱——2FA密钥 format and respects selectedAccountIds", async () => {
    const onToast = vi.fn();
    const extraAccounts: OTPAccount[] = [
      ...sampleAccounts,
      {
        ...sampleAccounts[0],
        id: "acc-2",
        issuer: "Google",
        name: "bob@gmail.com",
        secret: "KRSXG5CTMVRXEZLU",
      },
    ];
    dialogMocks.save.mockResolvedValue("/tmp/export.txt");
    dialogMocks.writeTextFile.mockResolvedValue(undefined);

    render(
      <BackupPanel
        accounts={extraAccounts}
        groups={sampleGroups}
        selectedAccountIds={new Set(["acc-2"])}
        onImport={vi.fn()}
        onToast={onToast}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /导出选中 \(1\)/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /TXT 文本（\.txt）/ }));

    await waitFor(() => {
      expect(dialogMocks.save).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultPath: expect.stringMatching(/\.txt$/),
          filters: [{ name: "纯文本", extensions: ["txt"] }],
        }),
      );
      expect(dialogMocks.writeTextFile).toHaveBeenCalledWith(
        "/tmp/export.txt",
        "Google\nbob@gmail.com——KRSXG5CTMVRXEZLU",
      );
    });
    expect(onToast).toHaveBeenCalledWith("成功导出 1 个账户到: /tmp/export.txt", "success");
  });

  it("exports JSON backup, closes menu on Escape, stays silent on save cancel, and reports write failure as error", async () => {
    const onToast = vi.fn();
    render(
      <BackupPanel
        accounts={sampleAccounts}
        groups={sampleGroups}
        onImport={vi.fn()}
        onToast={onToast}
      />,
    );

    const trigger = screen.getByRole("button", { name: "导出" });
    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);

    // 取消保存弹窗时不弹提示
    dialogMocks.save.mockResolvedValueOnce(null);
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: /JSON 备份（\.json）/ }));
    await waitFor(() => {
      expect(dialogMocks.save).toHaveBeenCalledTimes(1);
    });
    expect(dialogMocks.writeTextFile).not.toHaveBeenCalled();
    expect(onToast).not.toHaveBeenCalled();

    // 写入文件失败时展示错误 toast，不误报成功
    dialogMocks.save.mockResolvedValueOnce("/tmp/blocked.txt");
    dialogMocks.writeTextFile.mockRejectedValueOnce(new Error("permission denied"));
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: /TXT 文本（\.txt）/ }));
    await waitFor(() => {
      expect(onToast).toHaveBeenCalledWith("导出失败：permission denied", "error");
    });
  });
});
