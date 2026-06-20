import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import AppUpdateManager from "../AppUpdateManager";

const checkMock = vi.fn();
const relaunchMock = vi.fn();
const isTauriMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => isTauriMock(),
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: (...args: unknown[]) => relaunchMock(...args),
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: (...args: unknown[]) => checkMock(...args),
}));

vi.mock("../../contexts/I18nContext", () => ({
  useI18n: () => ({ locale: "zh" }),
}));

function createUpdate(overrides?: Partial<{
  currentVersion: string;
  version: string;
  date: string;
  body: string;
  downloadAndInstall: Parameters<typeof vi.fn>[0];
  close: Parameters<typeof vi.fn>[0];
}>) {
  const downloadAndInstall = vi.fn(overrides?.downloadAndInstall);
  const close = vi.fn(overrides?.close);

  return {
    currentVersion: "0.3.0",
    version: "0.3.1",
    date: "2026-03-19T08:30:00.000Z",
    body: "修复同步问题\n增加应用内更新",
    ...overrides,
    downloadAndInstall,
    close,
  };
}

describe("AppUpdateManager", () => {
  beforeEach(() => {
    isTauriMock.mockReturnValue(true);
    checkMock.mockReset();
    relaunchMock.mockReset();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("启动后发现新版本时会自动弹出更新对话框", async () => {
    const update = createUpdate();
    checkMock.mockResolvedValue(update);

    render(<AppUpdateManager onToast={vi.fn()} />);

    expect(await screen.findByRole("dialog", { name: "应用更新" })).toBeInTheDocument();
    expect(screen.getByText("发现新版本可更新")).toBeInTheDocument();
    expect(screen.getByText(/当前版本 0.3.0，最新版本 0.3.1/)).toBeInTheDocument();
    expect(checkMock).toHaveBeenCalledTimes(1);
  });

  it("同版本已被稍后提醒时不会自动打断，但可以手动再次打开", async () => {
    const update = createUpdate();
    checkMock.mockResolvedValue(update);
    window.localStorage.setItem("mfa-tool:dismissed-update-version", "0.3.1");

    render(<AppUpdateManager onToast={vi.fn()} />);

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "应用更新" })).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /发现新版本 0.3.1/ }));

    expect(await screen.findByRole("dialog", { name: "应用更新" })).toBeInTheDocument();
  });

  it("点击稍后提醒会关闭弹窗并记住当前版本", async () => {
    const update = createUpdate();
    checkMock.mockResolvedValue(update);

    render(<AppUpdateManager onToast={vi.fn()} />);

    await screen.findByRole("dialog", { name: "应用更新" });
    fireEvent.click(screen.getByRole("button", { name: "稍后提醒" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "应用更新" })).not.toBeInTheDocument();
    });
    expect(window.localStorage.getItem("mfa-tool:dismissed-update-version")).toBe("0.3.1");
  });

  it("下载安装完成后允许用户重启应用", async () => {
    const update = createUpdate({
      downloadAndInstall: async (onEvent?: (event: { event: string; data?: { contentLength?: number; chunkLength?: number } }) => void) => {
        onEvent?.({ event: "Started", data: { contentLength: 2048 } });
        onEvent?.({ event: "Progress", data: { chunkLength: 1024 } });
        onEvent?.({ event: "Progress", data: { chunkLength: 1024 } });
        onEvent?.({ event: "Finished" });
      },
    });
    const onToast = vi.fn();
    checkMock.mockResolvedValue(update);

    render(<AppUpdateManager onToast={onToast} />);

    await screen.findByRole("dialog", { name: "应用更新" });
    fireEvent.click(screen.getByRole("button", { name: "立即更新" }));

    await waitFor(() => {
      expect(update.downloadAndInstall).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("button", { name: "立即重启" })).toBeInTheDocument();
    });

    expect(onToast).toHaveBeenCalledWith("更新已下载完成，重启应用后即可生效", "success");

    fireEvent.click(screen.getByRole("button", { name: "立即重启" }));

    await waitFor(() => {
      expect(relaunchMock).toHaveBeenCalledTimes(1);
    });
  });
});
