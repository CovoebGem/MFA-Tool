import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, act, within } from "@testing-library/react";
import { useState } from "react";
import AppUpdateManager from "../AppUpdateManager";
import AccountSearchBar from "../AccountSearchBar";
import type { AppUpdateTransferEvent, CheckAppUpdateResult, UpdateRoute } from "../../lib/updater-client";

const checkAppUpdateMock = vi.fn<() => Promise<CheckAppUpdateResult>>();
const installAppUpdateMock = vi.fn<
  (rid: number, onEvent?: (event: AppUpdateTransferEvent) => void) => Promise<UpdateRoute>
>();
const closeAppUpdateMock = vi.fn<(rid: number) => Promise<void>>();
const relaunchMock = vi.fn();
const isTauriMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => isTauriMock(),
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: (...args: unknown[]) => relaunchMock(...args),
}));

vi.mock("../../lib/updater-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/updater-client")>();
  return {
    ...actual,
    checkAppUpdate: (...args: Parameters<typeof checkAppUpdateMock>) => checkAppUpdateMock(...args),
    installAppUpdate: (...args: Parameters<typeof installAppUpdateMock>) => installAppUpdateMock(...args),
    closeAppUpdate: (...args: Parameters<typeof closeAppUpdateMock>) => closeAppUpdateMock(...args),
  };
});

vi.mock("../../contexts/I18nContext", () => ({
  useI18n: () => ({ locale: "zh", setLocale: vi.fn(), t: (k: string) => k }),
  useOptionalI18n: () => ({ locale: "zh", setLocale: vi.fn(), t: (k: string) => k }),
}));

function createCheckResult(overrides?: Partial<CheckAppUpdateResult>): CheckAppUpdateResult {
  return {
    source: "mirror",
    fallbackFromMirror: false,
    update: {
      rid: 11,
      currentVersion: "0.3.8",
      version: "0.3.9",
      date: "2026-11-21T08:30:00.000Z",
      body: "新增账户搜索\n更新走 github.cbcsec.cc 加速",
    },
    ...overrides,
  };
}

describe("AppUpdateManager", () => {
  beforeEach(() => {
    vi.useRealTimers();
    isTauriMock.mockReturnValue(true);
    checkAppUpdateMock.mockReset();
    installAppUpdateMock.mockReset();
    closeAppUpdateMock.mockReset().mockResolvedValue(undefined);
    relaunchMock.mockReset();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("启动后发现新版本时会自动弹出更新对话框并展示镜像加速通道", async () => {
    checkAppUpdateMock.mockResolvedValue(createCheckResult());

    render(<AppUpdateManager onToast={vi.fn()} />);

    expect(await screen.findByRole("dialog", { name: "应用更新" })).toBeInTheDocument();
    expect(screen.getByText("发现新版本可更新")).toBeInTheDocument();
    expect(screen.getByText(/当前版本 0\.3\.8，最新版本 0\.3\.9/)).toBeInTheDocument();
    expect(screen.getByText("GitHub 镜像加速 (github.cbcsec.cc)")).toBeInTheDocument();
    expect(checkAppUpdateMock).toHaveBeenCalledTimes(1);
  });

  it("同版本已被稍后提醒时不会自动打断，但可以手动再次打开", async () => {
    checkAppUpdateMock.mockResolvedValue(createCheckResult());
    window.localStorage.setItem("mfa-tool:dismissed-update-version", "0.3.9");

    render(<AppUpdateManager onToast={vi.fn()} />);

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "应用更新" })).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /发现新版本 0\.3\.9/ }));

    expect(await screen.findByRole("dialog", { name: "应用更新" })).toBeInTheDocument();
  });

  it("点击稍后提醒会关闭弹窗并记住当前版本", async () => {
    checkAppUpdateMock.mockResolvedValue(createCheckResult());

    render(<AppUpdateManager onToast={vi.fn()} />);

    await screen.findByRole("dialog", { name: "应用更新" });
    fireEvent.click(screen.getByRole("button", { name: "稍后提醒" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "应用更新" })).not.toBeInTheDocument();
    });
    expect(window.localStorage.getItem("mfa-tool:dismissed-update-version")).toBe("0.3.9");
  });

  it("下载安装完成后允许用户重启应用", async () => {
    checkAppUpdateMock.mockResolvedValue(createCheckResult());
    installAppUpdateMock.mockImplementation(async (_rid, onEvent) => {
      onEvent?.({
        event: "Started",
        data: { source: "mirror", fallbackFromMirror: false, totalBytes: 2048 },
      });
      onEvent?.({
        event: "Progress",
        data: { source: "mirror", fallbackFromMirror: false, downloadedBytes: 1024, totalBytes: 2048 },
      });
      onEvent?.({
        event: "Progress",
        data: { source: "mirror", fallbackFromMirror: false, downloadedBytes: 2048, totalBytes: 2048 },
      });
      onEvent?.({
        event: "Installing",
        data: { source: "mirror", fallbackFromMirror: false },
      });
      return { source: "mirror", fallbackFromMirror: false };
    });
    const onToast = vi.fn();

    render(<AppUpdateManager onToast={onToast} />);

    await screen.findByRole("dialog", { name: "应用更新" });
    fireEvent.click(screen.getByRole("button", { name: "立即更新" }));

    await waitFor(() => {
      expect(installAppUpdateMock).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("button", { name: "立即重启" })).toBeInTheDocument();
    });

    expect(onToast).toHaveBeenCalledWith("更新已下载完成，重启应用后即可生效", "success");

    fireEvent.click(screen.getByRole("button", { name: "立即重启" }));

    await waitFor(() => {
      expect(relaunchMock).toHaveBeenCalledTimes(1);
    });
  });

  it("检查阶段回退官方源时正常弹窗并展示回退提示", async () => {
    checkAppUpdateMock.mockResolvedValue(
      createCheckResult({
        source: "official",
        fallbackFromMirror: true,
      }),
    );

    render(<AppUpdateManager onToast={vi.fn()} />);

    await screen.findByRole("dialog", { name: "应用更新" });
    expect(screen.getByText("GitHub 官方源（加速通道不可用，已自动回退）")).toBeInTheDocument();
    expect(screen.getByText("加速通道不可用，已自动回退 GitHub 官方源")).toBeInTheDocument();
  });

  it("下载中途镜像失败回退官方源时进度归零并最终完成安装", async () => {
    checkAppUpdateMock.mockResolvedValue(createCheckResult());
    let emitEvent!: (event: AppUpdateTransferEvent) => void;
    let resolveInstall!: (route: UpdateRoute) => void;

    installAppUpdateMock.mockImplementationOnce(
      (_rid, onEvent) =>
        new Promise<UpdateRoute>((resolve) => {
          emitEvent = onEvent!;
          resolveInstall = resolve;
        }),
    );

    render(<AppUpdateManager onToast={vi.fn()} />);

    await screen.findByRole("dialog", { name: "应用更新" });
    fireEvent.click(screen.getByRole("button", { name: "立即更新" }));

    await waitFor(() => {
      expect(installAppUpdateMock).toHaveBeenCalledTimes(1);
    });

    act(() => {
      emitEvent({
        event: "Started",
        data: { source: "mirror", fallbackFromMirror: false, totalBytes: null },
      });
    });

    // 未知总字节时进度条应使用不确定态而非满格 100%
    expect(screen.getByTestId("update-progress-bar")).toHaveAttribute("data-indeterminate", "true");

    act(() => {
      emitEvent({
        event: "Progress",
        data: { source: "mirror", fallbackFromMirror: false, downloadedBytes: 1024, totalBytes: 2048 },
      });
    });
    expect(screen.getByText("50%")).toBeInTheDocument();

    act(() => {
      emitEvent({
        event: "Fallback",
        data: { from: "mirror", source: "official", fallbackFromMirror: true, reason: "network" },
      });
    });
    expect(screen.getByText("加速通道下载中断，已自动切换 GitHub 官方源重新下载")).toBeInTheDocument();
    expect(screen.getByText("已下载 0 B")).toBeInTheDocument();

    act(() => {
      emitEvent({
        event: "Started",
        data: { source: "official", fallbackFromMirror: true, totalBytes: 2048 },
      });
      emitEvent({
        event: "Progress",
        data: { source: "official", fallbackFromMirror: true, downloadedBytes: 2048, totalBytes: 2048 },
      });
      emitEvent({
        event: "Installing",
        data: { source: "official", fallbackFromMirror: true },
      });
      resolveInstall({ source: "official", fallbackFromMirror: true });
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "立即重启" })).toBeInTheDocument();
    });
  });

  it("验签或安装失败时不进入待重启状态且允许重新尝试", async () => {
    checkAppUpdateMock.mockResolvedValue(createCheckResult());
    installAppUpdateMock.mockRejectedValueOnce(
      new Error(
        JSON.stringify({
          stage: "download",
          source: "mirror",
          kind: "signature",
          message: "更新包签名校验失败，已中止安装",
        }),
      ),
    );
    const onToast = vi.fn();

    render(<AppUpdateManager onToast={onToast} />);

    await screen.findByRole("dialog", { name: "应用更新" });
    fireEvent.click(screen.getByRole("button", { name: "立即更新" }));

    await waitFor(() => {
      expect(screen.getByText("更新包签名校验失败，已中止安装")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "立即重启" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "立即更新" })).not.toBeDisabled();
    expect(onToast).toHaveBeenCalledWith("安装更新失败：更新包签名校验失败，已中止安装", "error");
  });

  it("快速双击立即更新不重复触发安装，待重启期间整点轮询不覆盖状态", async () => {
    vi.useFakeTimers();
    checkAppUpdateMock.mockResolvedValue(createCheckResult());

    let resolveInstall!: (route: UpdateRoute) => void;
    installAppUpdateMock.mockImplementationOnce(
      () => new Promise<UpdateRoute>((resolve) => { resolveInstall = resolve; }),
    );

    render(<AppUpdateManager onToast={vi.fn()} />);

    await act(async () => {
      await Promise.resolve();
    });

    const installBtn = screen.getByRole("button", { name: "立即更新" });
    fireEvent.click(installBtn);
    fireEvent.click(installBtn);
    expect(installAppUpdateMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveInstall({ source: "mirror", fallbackFromMirror: false });
      await Promise.resolve();
    });

    expect(screen.getByRole("button", { name: "立即重启" })).toBeInTheDocument();

    // 推进 1 小时自动检查轮询，不应重置待重启状态或重新调用 checkAppUpdate
    await act(async () => {
      vi.advanceTimersByTime(60 * 60 * 1000);
      await Promise.resolve();
    });

    expect(checkAppUpdateMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "立即重启" })).toBeInTheDocument();
  });

  it("检查进行中禁用弹窗安装按钮且新检查结果不会覆盖已生效的待重启状态", async () => {
    vi.useFakeTimers();
    let resolveFirstCheck!: (value: CheckAppUpdateResult) => void;
    let resolveSecondCheck!: (value: CheckAppUpdateResult) => void;
    checkAppUpdateMock
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirstCheck = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecondCheck = resolve; }));

    render(<AppUpdateManager onToast={vi.fn()} />);

    await act(async () => {
      resolveFirstCheck(createCheckResult({ update: { ...createCheckResult().update!, rid: 11 } }));
      await Promise.resolve();
    });

    const dialog = screen.getByRole("dialog", { name: "应用更新" });

    // 先触发 1 小时定时检查处于 in-flight，验证主按钮显示检查中并禁用，不触发 install
    await act(async () => {
      vi.advanceTimersByTime(60 * 60 * 1000);
      await Promise.resolve();
    });

    const checkingBtn = within(dialog).getByRole("button", { name: "检查更新中..." });
    expect(checkingBtn).toBeDisabled();
    fireEvent.click(checkingBtn);
    expect(installAppUpdateMock).not.toHaveBeenCalled();

    // 第二个检查带着新 rid: 22 完成，应关闭旧 rid: 11 并切到可点击安装
    await act(async () => {
      resolveSecondCheck(
        createCheckResult({
          update: {
            ...createCheckResult().update!,
            rid: 22,
            version: "0.3.10",
          },
        }),
      );
      await Promise.resolve();
    });

    expect(closeAppUpdateMock).toHaveBeenCalledWith(11);
    const updateBtn = within(dialog).getByRole("button", { name: "立即更新" });
    expect(updateBtn).not.toBeDisabled();

    // 点击安装后再触发下一个定时检查周期，确保检查完全被阻止且不覆盖待重启状态
    installAppUpdateMock.mockResolvedValueOnce({ source: "mirror", fallbackFromMirror: false });
    await act(async () => {
      fireEvent.click(updateBtn);
      await Promise.resolve();
    });
    expect(installAppUpdateMock).toHaveBeenCalledWith(22, expect.any(Function));
    expect(screen.getByRole("button", { name: "立即重启" })).toBeInTheDocument();
  });

  it("句柄失效 invalid_handle 后切换为重新检查更新并允许重新检查安装", async () => {
    checkAppUpdateMock
      .mockResolvedValueOnce(createCheckResult())
      .mockResolvedValueOnce(
        createCheckResult({
          update: {
            rid: 99,
            currentVersion: "0.3.8",
            version: "0.3.10",
            date: "2026-11-21T09:00:00.000Z",
            body: "重新检查后的版本",
          },
        }),
      );

    installAppUpdateMock
      .mockRejectedValueOnce(
        new Error(
          JSON.stringify({
            stage: "install",
            source: "official",
            kind: "invalid_handle",
            message: "更新句柄已失效，请重新检查更新",
          }),
        ),
      )
      .mockResolvedValueOnce({ source: "mirror", fallbackFromMirror: false });

    render(<AppUpdateManager onToast={vi.fn()} />);

    await screen.findByRole("dialog", { name: "应用更新" });
    fireEvent.click(screen.getByRole("button", { name: "立即更新" }));

    const recheckBtn = await screen.findByRole("button", { name: "重新检查更新" });
    expect(recheckBtn).not.toBeDisabled();
    fireEvent.click(recheckBtn);

    await waitFor(() => {
      expect(checkAppUpdateMock).toHaveBeenCalledTimes(2);
      expect(screen.getByRole("button", { name: "立即更新" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "立即更新" }));
    await waitFor(() => {
      expect(installAppUpdateMock).toHaveBeenLastCalledWith(99, expect.any(Function));
      expect(screen.getByRole("button", { name: "立即重启" })).toBeInTheDocument();
    });
  });

  it("更新弹窗打开后接管背景搜索框焦点、忽略输入法 Escape、捕获 Tab 并在关闭后恢复搜索框焦点", async () => {
    let resolveCheck!: (value: CheckAppUpdateResult) => void;
    checkAppUpdateMock.mockImplementationOnce(
      () => new Promise((resolve) => { resolveCheck = resolve; }),
    );

    function Harness() {
      const [query, setQuery] = useState("github");
      return (
        <div>
          <AccountSearchBar value={query} onChange={setQuery} onClear={() => setQuery("")} />
          <AppUpdateManager onToast={vi.fn()} />
        </div>
      );
    }

    render(<Harness />);

    const searchInput = screen.getByRole("searchbox") as HTMLInputElement;
    searchInput.focus();
    expect(document.activeElement).toBe(searchInput);

    await act(async () => {
      resolveCheck(createCheckResult());
      await Promise.resolve();
    });

    const dialog = await screen.findByRole("dialog", { name: "应用更新" });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(searchInput);

    // 输入法组词期间 Escape 和 keyCode === 229 不关闭弹窗
    fireEvent.keyDown(document, { key: "Escape", isComposing: true });
    expect(screen.getByRole("dialog", { name: "应用更新" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape", keyCode: 229 });
    expect(screen.getByRole("dialog", { name: "应用更新" })).toBeInTheDocument();

    // Tab 循环停留在弹窗内部元素之间
    const laterBtn = screen.getByRole("button", { name: "稍后提醒" });
    const installBtn = screen.getByRole("button", { name: "立即更新" });
    installBtn.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(laterBtn);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(installBtn);

    // 普通 Escape 关闭弹窗，恢复焦点到背景非空搜索框且不误清搜索词
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "应用更新" })).not.toBeInTheDocument();
    });
    expect(searchInput.value).toBe("github");
    expect(document.activeElement).toBe(searchInput);
  });

  it("当前存在其他模态对话框时推迟自动弹出更新框，关闭后再自动弹出", async () => {
    let resolveCheck!: (value: CheckAppUpdateResult) => void;
    checkAppUpdateMock.mockImplementationOnce(
      () => new Promise((resolve) => { resolveCheck = resolve; }),
    );

    function Harness() {
      const [otherOpen, setOtherOpen] = useState(true);
      return (
        <div>
          {otherOpen && (
            <div role="dialog" aria-modal="true" aria-label="其他弹窗">
              <button type="button" onClick={() => setOtherOpen(false)}>
                关闭其他弹窗
              </button>
            </div>
          )}
          <AppUpdateManager onToast={vi.fn()} />
        </div>
      );
    }

    render(<Harness />);

    await act(async () => {
      resolveCheck(createCheckResult());
      await Promise.resolve();
    });

    expect(screen.queryByRole("dialog", { name: "应用更新" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "关闭其他弹窗" }));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "应用更新" })).toBeInTheDocument();
    });
  });

  it("当后挂载的高层弹窗处于顶层时，UpdateDialog 不抢焦点且不拦截 Escape/Tab", async () => {
    checkAppUpdateMock.mockResolvedValue(createCheckResult());

    function Harness() {
      const [topModalOpen, setTopModalOpen] = useState(false);
      return (
        <div>
          <button type="button" onClick={() => setTopModalOpen(true)}>
            打开顶层弹窗
          </button>
          <AppUpdateManager onToast={vi.fn()} />
          {topModalOpen && (
            <div role="dialog" aria-modal="true" aria-label="顶层弹窗">
              <button type="button" data-testid="top-modal-btn" onClick={() => setTopModalOpen(false)}>
                顶层按钮
              </button>
            </div>
          )}
        </div>
      );
    }

    render(<Harness />);

    await screen.findByRole("dialog", { name: "应用更新" });

    fireEvent.click(screen.getByRole("button", { name: "打开顶层弹窗" }));
    const topBtn = screen.getByTestId("top-modal-btn");
    topBtn.focus();

    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(topBtn);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "应用更新" })).toBeInTheDocument();
  });

  it("上层弹窗仍打开时关闭底层 UpdateDialog，不会把焦点拉回背景按钮", async () => {
    checkAppUpdateMock.mockResolvedValue(createCheckResult());

    function Harness() {
      const [topModalOpen, setTopModalOpen] = useState(false);
      return (
        <div>
          <button type="button" data-testid="bg-btn">
            背景按钮
          </button>
          <button type="button" onClick={() => setTopModalOpen(true)}>
            打开顶层弹窗
          </button>
          <AppUpdateManager onToast={vi.fn()} />
          {topModalOpen && (
            <div role="dialog" aria-modal="true" aria-label="顶层弹窗">
              <button type="button" data-testid="top-modal-btn">
                顶层按钮
              </button>
            </div>
          )}
        </div>
      );
    }

    render(<Harness />);

    // 先把初始焦点放到背景按钮，等更新框打开后捕获 previousFocusRef = bgBtn
    const bgBtn = screen.getByTestId("bg-btn");
    bgBtn.focus();

    await screen.findByRole("dialog", { name: "应用更新" });

    // 在更新框之上打开另一个模态弹窗并聚焦顶层按钮
    fireEvent.click(screen.getByRole("button", { name: "打开顶层弹窗" }));
    const topBtn = screen.getByTestId("top-modal-btn");
    topBtn.focus();
    expect(document.activeElement).toBe(topBtn);

    // 底层更新框被关闭，上层弹窗仍在打开 -> 焦点不得回跳到背景按钮
    fireEvent.click(screen.getByRole("button", { name: "稍后提醒" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "应用更新" })).not.toBeInTheDocument();
    });
    expect(document.activeElement).toBe(topBtn);
  });
});
