import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent, act } from "@testing-library/react";
import fc from "fast-check";
import AccountToolbar from "../AccountToolbar";
import type { Group, OTPAccount } from "../../types";

const arbAccount = (index: number): fc.Arbitrary<OTPAccount> =>
  fc.record({
    id: fc.constant(`acc-${index}`),
    issuer: fc.constant(`Issuer${index}`),
    name: fc.constant(`user${index}@test.com`),
    secret: fc.constant("JBSWY3DPEHPK3PXP"),
    type: fc.constant("totp" as const),
    counter: fc.constant(0),
    algorithm: fc.constant("SHA1" as const),
    digits: fc.constant(6),
    period: fc.constant(30),
    createdAt: fc.constant(1000 + index),
    groupId: fc.constant("default"),
  });

const arbAccounts: fc.Arbitrary<OTPAccount[]> = fc
  .integer({ min: 0, max: 10 })
  .chain((len) =>
    len === 0
      ? fc.constant([] as OTPAccount[])
      : fc
          .tuple(...Array.from({ length: len }, (_, i) => arbAccount(i)))
          .map((tuple) => [...tuple]),
  );

const arbAccountsWithSelection: fc.Arbitrary<{
  accounts: OTPAccount[];
  selectedIds: Set<string>;
}> = arbAccounts.chain((accounts) =>
  accounts.length === 0
    ? fc.constant({ accounts, selectedIds: new Set<string>() })
    : fc
        .subarray(accounts, { minLength: 0, maxLength: accounts.length })
        .map((subset) => ({
          accounts,
          selectedIds: new Set(subset.map((a) => a.id)),
        })),
);

const mockGroups: Group[] = [
  { id: "default", name: "默认", isDefault: true, createdAt: 0 },
  { id: "work", name: "工作", isDefault: false, createdAt: 1000 },
  { id: "personal", name: "个人", isDefault: false, createdAt: 2000 },
];

const defaultCallbacks = {
  groups: mockGroups,
  onDelete: vi.fn(),
  onBatchSetPinned: vi.fn().mockResolvedValue(undefined),
  onBatchMoveToGroup: vi.fn().mockResolvedValue(undefined),
  onRefresh: vi.fn().mockResolvedValue(undefined),
  onToggleSelectAll: vi.fn(),
  onClearSelection: vi.fn(),
};

describe("AccountToolbar Property Tests", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("Property 1: 工具栏始终可见且不再展示检查按钮，非空列表包含置顶、移动、删除、刷新和全选", () => {
    fc.assert(
      fc.property(arbAccountsWithSelection, ({ accounts, selectedIds }) => {
        cleanup();

        const { container } = render(
          <AccountToolbar
            accounts={accounts}
            selectedIds={selectedIds}
            {...defaultCallbacks}
          />,
        );

        const toolbar = container.firstElementChild;
        expect(toolbar).toBeTruthy();
        expect(toolbar).toBeInTheDocument();

        expect(screen.queryByLabelText("检查")).not.toBeInTheDocument();

        const refreshButton = screen.getByLabelText("刷新");
        expect(refreshButton).toBeInTheDocument();
        expect(refreshButton).toBeVisible();

        if (accounts.length > 0) {
          expect(screen.getByLabelText("移动到分组")).toBeInTheDocument();
          expect(screen.getByLabelText("删除")).toBeInTheDocument();
          expect(screen.getByLabelText("全选")).toBeInTheDocument();
          expect(screen.getByRole("button", { name: /置顶$/ })).toBeInTheDocument();
        }

        cleanup();
      }),
      { numRuns: 100 },
    );
  });

  it("Property 4: 批量删除正确性 - onDelete 调用次数等于选中数量且每个 id 恰好传入一次", () => {
    const arbAccountsWithNonEmptySelection = fc
      .integer({ min: 1, max: 10 })
      .chain((len) =>
        fc
          .tuple(...Array.from({ length: len }, (_, i) => arbAccount(i)))
          .map((tuple) => [...tuple]),
      )
      .chain((accounts) =>
        fc
          .subarray(accounts, { minLength: 1, maxLength: accounts.length })
          .map((subset) => ({
            accounts,
            selectedIds: new Set(subset.map((a) => a.id)),
          })),
      );

    fc.assert(
      fc.property(arbAccountsWithNonEmptySelection, ({ accounts, selectedIds }) => {
        cleanup();

        const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
        const onDelete = vi.fn();
        const onClearSelection = vi.fn();

        render(
          <AccountToolbar
            accounts={accounts}
            selectedIds={selectedIds}
            onDelete={onDelete}
            onRefresh={vi.fn().mockResolvedValue(undefined)}
            onToggleSelectAll={vi.fn()}
            onClearSelection={onClearSelection}
          />,
        );

        fireEvent.click(screen.getByLabelText("删除"));

        expect(confirmSpy).toHaveBeenCalledOnce();
        expect(onDelete).toHaveBeenCalledTimes(selectedIds.size);

        const calledIds = onDelete.mock.calls.map((call) => call[0]);
        const calledIdSet = new Set(calledIds);
        expect(calledIds.length).toBe(calledIdSet.size);
        for (const id of selectedIds) {
          expect(calledIdSet.has(id)).toBe(true);
        }
        expect(onClearSelection).toHaveBeenCalledOnce();

        confirmSpy.mockRestore();
        cleanup();
      }),
      { numRuns: 100 },
    );
  });
});

describe("AccountToolbar 单元测试", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  function makeAccount(overrides: Partial<OTPAccount> = {}): OTPAccount {
    return {
      id: "acc-1",
      issuer: "GitHub",
      name: "user@test.com",
      secret: "JBSWY3DPEHPK3PXP",
      type: "totp",
      counter: 0,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      createdAt: 1000,
      groupId: "default",
      ...overrides,
    };
  }

  describe("空账户列表时按钮可见性", () => {
    it("空账户列表时，仅保留刷新按钮，检查与选择类按钮不在 DOM 中", () => {
      render(
        <AccountToolbar
          accounts={[]}
          selectedIds={new Set<string>()}
          {...defaultCallbacks}
        />,
      );

      expect(screen.getByLabelText("刷新")).toBeInTheDocument();
      expect(screen.queryByLabelText("检查")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("删除")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("全选")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("移动到分组")).not.toBeInTheDocument();
    });
  });

  describe("工具栏置顶与移动到分组交互", () => {
    it("未选中账户时置顶与移动到分组按钮禁用，有选中后启用并显示内联计数与取消选择", () => {
      const accounts = [makeAccount({ id: "a1" }), makeAccount({ id: "a2", pinned: true })];
      const onClearSelection = vi.fn();

      const { rerender } = render(
        <AccountToolbar
          accounts={accounts}
          selectedIds={new Set()}
          {...defaultCallbacks}
          onClearSelection={onClearSelection}
        />,
      );

      expect(screen.getByRole("button", { name: "置顶" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "移动到分组" })).toBeDisabled();
      expect(screen.queryByText(/已选/)).not.toBeInTheDocument();

      rerender(
        <AccountToolbar
          accounts={accounts}
          selectedIds={new Set(["a1", "a2"])}
          {...defaultCallbacks}
          onClearSelection={onClearSelection}
        />,
      );

      expect(screen.getByText("已选 2")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "置顶" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "移动到分组" })).toBeEnabled();

      fireEvent.click(screen.getByRole("button", { name: "取消选择" }));
      expect(onClearSelection).toHaveBeenCalledOnce();
    });

    it("全选已置顶账户时切换为取消置顶并传递 false，混合或未置顶时传递 true", async () => {
      const accounts = [
        makeAccount({ id: "a1", pinned: false }),
        makeAccount({ id: "a2", pinned: true }),
      ];
      const onBatchSetPinned = vi.fn().mockResolvedValue(undefined);
      const onClearSelection = vi.fn();

      const { rerender } = render(
        <AccountToolbar
          accounts={accounts}
          groups={mockGroups}
          selectedIds={new Set(["a1", "a2"])}
          onDelete={vi.fn()}
          onBatchSetPinned={onBatchSetPinned}
          onBatchMoveToGroup={vi.fn()}
          onRefresh={vi.fn().mockResolvedValue(undefined)}
          onToggleSelectAll={vi.fn()}
          onClearSelection={onClearSelection}
        />,
      );

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "置顶" }));
        await Promise.resolve();
      });
      expect(onBatchSetPinned).toHaveBeenCalledWith(["a1", "a2"], true);
      expect(onClearSelection).toHaveBeenCalledTimes(1);

      onBatchSetPinned.mockClear();
      onClearSelection.mockClear();

      rerender(
        <AccountToolbar
          accounts={accounts}
          groups={mockGroups}
          selectedIds={new Set(["a2"])}
          onDelete={vi.fn()}
          onBatchSetPinned={onBatchSetPinned}
          onBatchMoveToGroup={vi.fn()}
          onRefresh={vi.fn().mockResolvedValue(undefined)}
          onToggleSelectAll={vi.fn()}
          onClearSelection={onClearSelection}
        />,
      );

      const unpinBtn = screen.getByRole("button", { name: "取消置顶" });
      await act(async () => {
        fireEvent.click(unpinBtn);
        await Promise.resolve();
      });
      expect(onBatchSetPinned).toHaveBeenCalledWith(["a2"], false);
      expect(onClearSelection).toHaveBeenCalledTimes(1);
    });

    it("移动到分组浮层支持选中分组、Escape 关闭、成功后清空以及失败保留选中", async () => {
      const accounts = [makeAccount({ id: "a1" })];
      const onBatchMoveToGroup = vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("move failed"));
      const onClearSelection = vi.fn();

      render(
        <AccountToolbar
          accounts={accounts}
          groups={mockGroups}
          selectedIds={new Set(["a1"])}
          onDelete={vi.fn()}
          onBatchSetPinned={vi.fn()}
          onBatchMoveToGroup={onBatchMoveToGroup}
          onRefresh={vi.fn().mockResolvedValue(undefined)}
          onToggleSelectAll={vi.fn()}
          onClearSelection={onClearSelection}
        />,
      );

      const moveBtn = screen.getByRole("button", { name: "移动到分组" });
      fireEvent.click(moveBtn);
      expect(screen.getByRole("menu", { name: "选择目标分组" })).toBeInTheDocument();

      // Escape 关闭浮层
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("menu", { name: "选择目标分组" })).not.toBeInTheDocument();

      // 再次打开并选择目标分组 -> 成功清空选择
      fireEvent.click(moveBtn);
      await act(async () => {
        fireEvent.click(screen.getByRole("menuitem", { name: "工作" }));
        await Promise.resolve();
      });
      expect(onBatchMoveToGroup).toHaveBeenCalledWith(["a1"], "work");
      expect(onClearSelection).toHaveBeenCalledTimes(1);

      // 失败时关闭浮层并保留选择
      onClearSelection.mockClear();
      fireEvent.click(moveBtn);
      await act(async () => {
        fireEvent.click(screen.getByRole("menuitem", { name: "个人" }));
        await Promise.resolve();
      });
      expect(onClearSelection).not.toHaveBeenCalled();
      expect(screen.queryByRole("menu", { name: "选择目标分组" })).not.toBeInTheDocument();
    });
  });

  describe("删除确认对话框交互", () => {
    it("选择为空时点击删除，弹出 alert 提示", () => {
      const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});

      render(
        <AccountToolbar
          accounts={[makeAccount()]}
          selectedIds={new Set<string>()}
          {...defaultCallbacks}
        />,
      );

      fireEvent.click(screen.getByLabelText("删除"));

      expect(alertSpy).toHaveBeenCalledWith("请先选择要删除的账户");
      expect(defaultCallbacks.onDelete).not.toHaveBeenCalled();

      alertSpy.mockRestore();
    });

    it("确认删除后，为每个选中账户调用 onDelete 并调用 onClearSelection", async () => {
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
      const onDelete = vi.fn();
      const onClearSelection = vi.fn();

      const accounts = [
        makeAccount({ id: "a1" }),
        makeAccount({ id: "a2" }),
        makeAccount({ id: "a3" }),
      ];

      render(
        <AccountToolbar
          accounts={accounts}
          selectedIds={new Set(["a1", "a3"])}
          onDelete={onDelete}
          onRefresh={vi.fn().mockResolvedValue(undefined)}
          onToggleSelectAll={vi.fn()}
          onClearSelection={onClearSelection}
        />,
      );

      await act(async () => {
        fireEvent.click(screen.getByLabelText("删除"));
        await Promise.resolve();
      });

      expect(onDelete).toHaveBeenCalledTimes(2);
      expect(onClearSelection).toHaveBeenCalledOnce();

      confirmSpy.mockRestore();
    });
  });

  describe("刷新按钮加载状态和错误处理", () => {
    it("刷新期间按钮禁用并显示 spinner，失败时显示错误信息", async () => {
      let resolveRefresh!: () => void;
      const onRefresh = vi
        .fn()
        .mockImplementationOnce(
          () => new Promise<void>((resolve) => { resolveRefresh = resolve; }),
        )
        .mockRejectedValueOnce(new Error("网络错误"));

      render(
        <AccountToolbar
          accounts={[makeAccount()]}
          selectedIds={new Set<string>()}
          onDelete={vi.fn()}
          onRefresh={onRefresh}
          onToggleSelectAll={vi.fn()}
          onClearSelection={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByLabelText("刷新"));

      await waitFor(() => {
        const refreshButton = screen.getByLabelText("刷新");
        expect(refreshButton).toBeDisabled();
        expect(refreshButton.querySelector(".animate-spin")).toBeTruthy();
      });

      resolveRefresh();

      await waitFor(() => {
        expect(screen.getByLabelText("刷新")).not.toBeDisabled();
      });

      fireEvent.click(screen.getByLabelText("刷新"));
      await waitFor(() => {
        expect(screen.getByRole("alert")).toHaveTextContent("网络错误");
      });
    });
  });
});
