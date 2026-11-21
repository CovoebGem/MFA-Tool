import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import ManualAddForm from "../ManualAddForm";
import { TempPanel } from "../TempPanel";
import type { TempEntry } from "../TempPanel";
import { useState } from "react";

vi.mock("../../hooks/useTOTP", () => ({
  useTOTP: () => ({ code: "123456", remaining: 25 }),
}));

describe("Base32 whitespace normalization in input boundaries", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("normalizes whitespace and lowercase in ManualAddForm before validating and saving", async () => {
    const onAccountAdded = vi.fn().mockResolvedValue(undefined);
    render(<ManualAddForm onAccountAdded={onAccountAdded} />);

    fireEvent.change(screen.getByLabelText(/密钥/), {
      target: { value: " jbsw y3dp ehpk 3pxp " },
    });
    fireEvent.change(screen.getByLabelText(/账户名称/), {
      target: { value: "alice@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加账户" }));

    await waitFor(() => {
      expect(onAccountAdded).toHaveBeenCalledWith([
        expect.objectContaining({
          name: "alice@example.com",
          secret: "JBSWY3DPEHPK3PXP",
        }),
      ]);
      expect(screen.getByRole("button", { name: "添加账户" })).not.toBeDisabled();
    });
  });

  it("normalizes whitespace and lowercase in TempPanel before adding entry", async () => {
    function Harness() {
      const [entries, setEntries] = useState<TempEntry[]>([]);
      return (
        <TempPanel
          entries={entries}
          onEntriesChange={setEntries}
          onSaveToAccount={vi.fn()}
        />
      );
    }

    render(<Harness />);

    fireEvent.change(screen.getByPlaceholderText("输入 base32 密钥..."), {
      target: { value: " jbsw y3dp ehpk 3pxp " },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加" }));

    await waitFor(() => {
      expect(screen.getByText("JBSWY3DPEHPK3PXP")).toBeInTheDocument();
    });
  });

  it("preserves ManualAddForm inputs and shows alert when onAccountAdded rejects", async () => {
    const onAccountAdded = vi.fn().mockRejectedValueOnce(new Error("写入失败"));
    render(<ManualAddForm onAccountAdded={onAccountAdded} />);

    const secretInput = screen.getByLabelText(/密钥/) as HTMLInputElement;
    const nameInput = screen.getByLabelText(/账户名称/) as HTMLInputElement;
    const issuerInput = screen.getByLabelText(/服务商/) as HTMLInputElement;

    fireEvent.change(secretInput, { target: { value: "JBSWY3DPEHPK3PXP" } });
    fireEvent.change(nameInput, { target: { value: "alice@example.com" } });
    fireEvent.change(issuerInput, { target: { value: "GitHub" } });
    fireEvent.click(screen.getByRole("button", { name: "添加账户" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("写入失败");
    });

    expect(secretInput.value).toBe("JBSWY3DPEHPK3PXP");
    expect(nameInput.value).toBe("alice@example.com");
    expect(issuerInput.value).toBe("GitHub");
  });

  it("keeps TempPanel entry and shows alert when onSaveToAccount rejects", async () => {
    const onSaveToAccount = vi.fn().mockRejectedValueOnce(new Error("保存持久化失败"));
    function Harness() {
      const [entries, setEntries] = useState<TempEntry[]>([
        { id: "temp-1", secret: "JBSWY3DPEHPK3PXP" },
      ]);
      return (
        <TempPanel
          entries={entries}
          onEntriesChange={setEntries}
          onSaveToAccount={onSaveToAccount}
        />
      );
    }

    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "保存到账户" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("保存持久化失败");
    });

    expect(screen.getByText("JBSWY3DPEHPK3PXP")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存到账户" })).not.toBeDisabled();
  });

  it("TempPanel 在保存 A 期间离开并新增 C，A 成功后只删除 A 且保留 C", async () => {
    let resolveA!: () => void;
    const onSaveToAccount = vi.fn().mockImplementationOnce(
      () => new Promise<void>((resolve) => { resolveA = resolve; }),
    );

    const entryA: TempEntry = { id: "temp-remount-a", secret: "JBSWY3DPEHPK3PXP" };
    function AppLikeWrapper() {
      const [showTemp, setShowTemp] = useState(true);
      const [entries, setEntries] = useState<TempEntry[]>([entryA]);
      return (
        <div>
          <button type="button" onClick={() => setShowTemp((v) => !v)}>
            toggle-temp
          </button>
          {showTemp && (
            <TempPanel
              entries={entries}
              onEntriesChange={setEntries}
              onSaveToAccount={onSaveToAccount}
            />
          )}
        </div>
      );
    }

    render(<AppLikeWrapper />);

    fireEvent.click(screen.getByRole("button", { name: "保存到账户" }));
    // 离开临时页再返回并新增 C
    fireEvent.click(screen.getByRole("button", { name: "toggle-temp" }));
    fireEvent.click(screen.getByRole("button", { name: "toggle-temp" }));

    // 重挂载后 A 仍处于保存禁用态
    expect(screen.getByRole("button", { name: "保存中..." })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("输入 base32 密钥..."), {
      target: { value: "KRSXG5CTMVRXEZLU" },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加" }));
    expect(screen.getByText("KRSXG5CTMVRXEZLU")).toBeInTheDocument();

    await act(async () => {
      resolveA();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.queryByText("JBSWY3DPEHPK3PXP")).not.toBeInTheDocument();
    });
    expect(screen.getByText("KRSXG5CTMVRXEZLU")).toBeInTheDocument();
  });

  it("TempPanel 在保存 A 期间切页返回后若保存失败，新实例解锁按钮展示错误并可重试成功", async () => {
    let rejectFirstA!: (err: Error) => void;
    const onSaveToAccount = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<void>((_resolve, reject) => { rejectFirstA = reject; }),
      )
      .mockResolvedValueOnce(undefined);

    const entryA: TempEntry = { id: "temp-remount-fail-a", secret: "JBSWY3DPEHPK3PXP" };
    function AppLikeWrapper() {
      const [showTemp, setShowTemp] = useState(true);
      const [entries, setEntries] = useState<TempEntry[]>([entryA]);
      return (
        <div>
          <button type="button" onClick={() => setShowTemp((v) => !v)}>
            toggle-temp
          </button>
          {showTemp && (
            <TempPanel
              entries={entries}
              onEntriesChange={setEntries}
              onSaveToAccount={onSaveToAccount}
            />
          )}
        </div>
      );
    }

    render(<AppLikeWrapper />);

    fireEvent.click(screen.getByRole("button", { name: "保存到账户" }));
    fireEvent.click(screen.getByRole("button", { name: "toggle-temp" }));
    fireEvent.click(screen.getByRole("button", { name: "toggle-temp" }));
    expect(screen.getByRole("button", { name: "保存中..." })).toBeDisabled();

    await act(async () => {
      rejectFirstA(new Error("网络异常"));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("网络异常");
    });
    expect(screen.getByRole("button", { name: "保存到账户" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "移除" })).not.toBeDisabled();
    expect(screen.getByText("JBSWY3DPEHPK3PXP")).toBeInTheDocument();

    // 重试保存到账户应可成功移除
    fireEvent.click(screen.getByRole("button", { name: "保存到账户" }));
    await waitFor(() => {
      expect(screen.queryByText("JBSWY3DPEHPK3PXP")).not.toBeInTheDocument();
    });
  });

  it("TempPanel 同时保存两条记录并同时成功时，两条均被删除且不复活", async () => {
    let resolveA!: () => void;
    let resolveB!: () => void;
    const onSaveToAccount = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => { resolveA = resolve; }))
      .mockImplementationOnce(() => new Promise<void>((resolve) => { resolveB = resolve; }));

    function Harness() {
      const [entries, setEntries] = useState<TempEntry[]>([
        { id: "temp-conc-a", secret: "JBSWY3DPEHPK3PXP" },
        { id: "temp-conc-b", secret: "KRSXG5CTMVRXEZLU" },
      ]);
      return (
        <TempPanel
          entries={entries}
          onEntriesChange={setEntries}
          onSaveToAccount={onSaveToAccount}
        />
      );
    }

    render(<Harness />);
    const saveButtons = screen.getAllByRole("button", { name: "保存到账户" });
    fireEvent.click(saveButtons[0]);
    fireEvent.click(saveButtons[1]);

    await act(async () => {
      resolveA();
      resolveB();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.queryByText("JBSWY3DPEHPK3PXP")).not.toBeInTheDocument();
      expect(screen.queryByText("KRSXG5CTMVRXEZLU")).not.toBeInTheDocument();
    });
  });

  it("ManualAddForm 提交期间锁定输入与模式 Tab，禁止修改草稿导致误清空", async () => {
    let resolveSave!: () => void;
    const onAccountAdded = vi.fn().mockImplementationOnce(
      () => new Promise<void>((resolve) => { resolveSave = resolve; }),
    );
    render(<ManualAddForm onAccountAdded={onAccountAdded} />);

    const secretInput = screen.getByLabelText(/密钥/) as HTMLInputElement;
    const nameInput = screen.getByLabelText(/账户名称/) as HTMLInputElement;
    const issuerInput = screen.getByLabelText(/服务商/) as HTMLInputElement;
    const urlTab = screen.getByRole("tab", { name: "otpauth:// URL" });

    fireEvent.change(secretInput, { target: { value: "JBSWY3DPEHPK3PXP" } });
    fireEvent.change(nameInput, { target: { value: "alice@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "添加账户" }));

    expect(secretInput).toBeDisabled();
    expect(nameInput).toBeDisabled();
    expect(issuerInput).toBeDisabled();
    expect(urlTab).toBeDisabled();

    fireEvent.change(nameInput, { target: { value: "should-not-overwrite" } });
    fireEvent.click(urlTab);
    expect(nameInput.value).toBe("alice@example.com");
    expect(screen.getByRole("tab", { name: "手动输入" })).toHaveAttribute("aria-selected", "true");

    await act(async () => {
      resolveSave();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(secretInput.value).toBe("");
      expect(nameInput.value).toBe("");
    });
  });
});
