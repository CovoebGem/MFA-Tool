import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import fc from "fast-check";
import AccountToolbar from "../AccountToolbar";
import type { OTPAccount } from "../../types";
import { isValidBase32 } from "../../lib/validators";

// Mock useTOTP hook to avoid crypto dependency in tests
vi.mock("../../hooks/useTOTP", () => ({
  useTOTP: () => ({ code: "123456", remaining: 25 }),
}));

/**
 * Generator: 生成有效的 OTPAccount
 */
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

/**
 * Generator: 生成 0~10 个账户的列表
 */
const arbAccounts: fc.Arbitrary<OTPAccount[]> = fc
  .integer({ min: 0, max: 10 })
  .chain((len) =>
    len === 0
      ? fc.constant([] as OTPAccount[])
      : fc
          .tuple(...Array.from({ length: len }, (_, i) => arbAccount(i)))
          .map((tuple) => [...tuple]),
  );

/**
 * Generator: 生成账户列表及对应的随机选择状态（空集、部分选中、全选）
 */
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

/**
 * Generator: 生成带随机 secret 的 OTPAccount（可能有效或无效 base32）
 */
const arbAccountWithRandomSecret = (index: number): fc.Arbitrary<OTPAccount> =>
  fc
    .oneof(
      // 有效 base32 secret：由 A-Z2-7 字符组成
      fc.array(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.split('')), { minLength: 1, maxLength: 32 })
        .map((chars) => chars.join('')),
      // 无效 secret（包含非 base32 字符或空字符串）
      fc.string({ minLength: 0, maxLength: 32 }),
    )
    .map((secret) => ({
      id: `acc-${index}`,
      issuer: `Issuer${index}`,
      name: `user${index}@test.com`,
      secret,
      type: "totp" as const,
      counter: 0,
      algorithm: "SHA1" as const,
      digits: 6,
      period: 30,
      createdAt: 1000 + index,
      groupId: "default",
    }));

/**
 * Generator: 生成 1~8 个带随机 secret 的账户列表
 */
const arbAccountsWithRandomSecrets: fc.Arbitrary<OTPAccount[]> = fc
  .integer({ min: 1, max: 8 })
  .chain((len) =>
    fc
      .tuple(...Array.from({ length: len }, (_, i) => arbAccountWithRandomSecret(i)))
      .map((tuple) => [...tuple]),
  );

const defaultCallbacks = {
  onDelete: vi.fn(),
  onRefresh: vi.fn().mockResolvedValue(undefined),
  onToggleSelectAll: vi.fn(),
  onClearSelection: vi.fn(),
};

describe("AccountToolbar Property Tests", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  /**
   * Feature: account-toolbar, Property 1: 工具栏始终可见
   * Validates: Requirements 1.2
   *
   * 对于任意账户列表和任意选择状态（空集、部分选中、全选），
   * AccountToolbar 组件应始终在 DOM 中存在且可见，
   * 且"检查"和"刷新"按钮始终存在。
   */
  it("Property 1: 工具栏始终可见 - 任意账户列表和选择状态下工具栏及核心按钮始终存在", () => {
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

        // 工具栏容器应在 DOM 中存在
        const toolbar = container.firstElementChild;
        expect(toolbar).toBeTruthy();
        expect(toolbar).toBeInTheDocument();

        // "检查"按钮始终可见
        const checkButton = screen.getByLabelText("检查");
        expect(checkButton).toBeInTheDocument();
        expect(checkButton).toBeVisible();

        // "刷新"按钮始终可见
        const refreshButton = screen.getByLabelText("刷新");
        expect(refreshButton).toBeInTheDocument();
        expect(refreshButton).toBeVisible();

        cleanup();
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: account-toolbar, Property 4: 批量删除正确性
   * Validates: Requirements 3.2
   *
   * 对于任意账户列表和任意非空选中子集，执行批量删除后，
   * onDelete 应被调用的次数等于选中账户数量，
   * 且每个选中账户的 id 都被传入 onDelete 恰好一次。
   */
  it("Property 4: 批量删除正确性 - onDelete 调用次数等于选中数量且每个 id 恰好传入一次", () => {
    // Generator: 生成至少 1 个账户的列表及非空选中子集
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

        // Mock window.confirm 返回 true
        const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

        // 每次迭代使用新的 mock 函数
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

        // 点击删除按钮
        const deleteButton = screen.getByLabelText("删除");
        fireEvent.click(deleteButton);

        // 验证 confirm 被调用
        expect(confirmSpy).toHaveBeenCalledOnce();

        // 验证 onDelete 调用次数等于选中账户数量
        expect(onDelete).toHaveBeenCalledTimes(selectedIds.size);

        // 验证每个选中账户的 id 都被传入 onDelete 恰好一次
        const calledIds = onDelete.mock.calls.map((call) => call[0]);
        const calledIdSet = new Set(calledIds);

        // 没有重复调用
        expect(calledIds.length).toBe(calledIdSet.size);

        // 每个选中的 id 都被调用了
        for (const id of selectedIds) {
          expect(calledIdSet.has(id)).toBe(true);
        }

        // 调用的 id 都是选中的 id
        for (const id of calledIds) {
          expect(selectedIds.has(id)).toBe(true);
        }

        // 验证 onClearSelection 在删除后被调用一次
        expect(onClearSelection).toHaveBeenCalledOnce();

        confirmSpy.mockRestore();
        cleanup();
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: account-toolbar, Property 2: 检查功能正确识别无效密钥
   * Validates: Requirements 2.1
   *
   * 对于任意 OTPAccount 列表（其中 secret 字段为随机字符串，可能包含有效和无效的 base32 编码），
   * 执行检查后返回的无效账户集合应恰好等于 secret 不通过 isValidBase32 校验的账户集合。
   */
  it("Property 2: 检查功能正确识别无效密钥 - 无效账户集合恰好等于未通过 isValidBase32 的账户", async () => {
    await fc.assert(
      fc.asyncProperty(arbAccountsWithRandomSecrets, async (accounts) => {
        cleanup();

        // 独立计算预期的无效账户 ID 集合
        const expectedInvalidIds = new Set(
          accounts.filter((a) => !isValidBase32(a.secret)).map((a) => a.id),
        );

        const { container } = render(
          <AccountToolbar
            accounts={accounts}
            selectedIds={new Set<string>()}
            {...defaultCallbacks}
          />,
        );

        // 点击"检查"按钮
        const checkButton = screen.getByLabelText("检查");
        fireEvent.click(checkButton);

        if (expectedInvalidIds.size > 0) {
          // 应弹出 CheckResultDialog，显示无效密钥信息
          await waitFor(() => {
            expect(screen.getByRole("dialog")).toBeInTheDocument();
          });

          // 验证显示的无效密钥数量与预期一致
          const invalidCountText = `${expectedInvalidIds.size} 个无效密钥`;
          expect(screen.getByText(invalidCountText)).toBeInTheDocument();

          // 验证每个无效账户都在"无效密钥"区域中显示
          const invalidSection = container.querySelector("ul.space-y-2");
          expect(invalidSection).toBeTruthy();
          const invalidItems = invalidSection!.querySelectorAll("li");
          const renderedLabels = new Set(
            Array.from(invalidItems).map((li) => {
              const nameDiv = li.querySelector(".font-medium.text-gray-800");
              return nameDiv?.textContent ?? "";
            }),
          );

          for (const account of accounts) {
            const label = account.issuer
              ? `${account.issuer} - ${account.name}`
              : account.name;
            if (expectedInvalidIds.has(account.id)) {
              expect(renderedLabels.has(label)).toBe(true);
            }
          }

          // 验证无效密钥列表项数量与预期一致
          expect(invalidItems.length).toBe(expectedInvalidIds.size);
        } else {
          // 所有账户有效（且可能无重复），应显示成功提示或重复对话框
          // 如果有重复但无无效密钥，也会弹出对话框
          const hasDuplicates = await screen.queryByRole("dialog");
          if (hasDuplicates) {
            // 有重复但无无效密钥，对话框中应显示 0 个无效密钥
            expect(screen.getByText("0 个无效密钥")).toBeInTheDocument();
          } else {
            await waitFor(() => {
              expect(screen.getByText(/正常/)).toBeInTheDocument();
            });
          }
        }

        cleanup();
      }),
      { numRuns: 100 },
    );
  });
});

describe("AccountToolbar Property 5 - 全选/取消全选 round-trip", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  /**
   * Generator: 生成至少 1 个账户的列表及非全选的选择状态（空集或部分选中）
   */
  const arbAccountsWithPartialSelection: fc.Arbitrary<{
    accounts: OTPAccount[];
    selectedIds: Set<string>;
  }> = fc
    .integer({ min: 1, max: 10 })
    .chain((len) =>
      fc
        .tuple(...Array.from({ length: len }, (_, i) => arbAccount(i)))
        .map((tuple) => [...tuple]),
    )
    .chain((accounts) =>
      fc
        .subarray(accounts, { minLength: 0, maxLength: Math.max(0, accounts.length - 1) })
        .map((subset) => ({
          accounts,
          selectedIds: new Set(subset.map((a) => a.id)),
        })),
    );

  /**
   * Generator: 生成至少 1 个账户的列表及全选状态
   */
  const arbAccountsWithFullSelection: fc.Arbitrary<{
    accounts: OTPAccount[];
    selectedIds: Set<string>;
  }> = fc
    .integer({ min: 1, max: 10 })
    .chain((len) =>
      fc
        .tuple(...Array.from({ length: len }, (_, i) => arbAccount(i)))
        .map((tuple) => [...tuple]),
    )
    .map((accounts) => ({
      accounts,
      selectedIds: new Set(accounts.map((a) => a.id)),
    }));

  /**
   * Feature: account-toolbar, Property 5: 全选/取消全选 round-trip
   * Validates: Requirements 5.1, 5.2
   *
   * 对于任意非空账户列表和任意初始选择状态（未选或部分选中），
   * 点击全选按钮后所有账户应被选中；在全选状态下再次点击全选按钮后，SelectionState 应为空。
   *
   * 由于 AccountToolbar 是受控组件，round-trip 属性通过以下方式验证：
   * 1. 未选/部分选中 → 按钮文字为"全选" → 点击触发 onToggleSelectAll
   * 2. 全选状态 → 按钮文字为"取消全选" → 点击触发 onToggleSelectAll
   * 3. 按钮文字正确反映选择状态，形成完整的 round-trip 契约
   */
  it("Property 5a: 未选/部分选中时，按钮显示'全选'且点击触发 onToggleSelectAll", () => {
    fc.assert(
      fc.property(arbAccountsWithPartialSelection, ({ accounts, selectedIds }) => {
        cleanup();

        const onToggleSelectAll = vi.fn();

        render(
          <AccountToolbar
            accounts={accounts}
            selectedIds={selectedIds}
            onDelete={vi.fn()}
            onRefresh={vi.fn().mockResolvedValue(undefined)}
            onToggleSelectAll={onToggleSelectAll}
            onClearSelection={vi.fn()}
          />,
        );

        // 全选按钮应存在
        const selectAllButton = screen.getByLabelText("全选");
        expect(selectAllButton).toBeInTheDocument();

        // 按钮文字应为"全选"（非全选状态）
        expect(selectAllButton.textContent).toContain("全选");
        expect(selectAllButton.textContent).not.toContain("取消全选");

        // 点击按钮应触发 onToggleSelectAll
        fireEvent.click(selectAllButton);
        expect(onToggleSelectAll).toHaveBeenCalledOnce();

        cleanup();
      }),
      { numRuns: 100 },
    );
  });

  it("Property 5b: 全选状态时，按钮显示'取消全选'且点击触发 onToggleSelectAll", () => {
    fc.assert(
      fc.property(arbAccountsWithFullSelection, ({ accounts, selectedIds }) => {
        cleanup();

        const onToggleSelectAll = vi.fn();

        render(
          <AccountToolbar
            accounts={accounts}
            selectedIds={selectedIds}
            onDelete={vi.fn()}
            onRefresh={vi.fn().mockResolvedValue(undefined)}
            onToggleSelectAll={onToggleSelectAll}
            onClearSelection={vi.fn()}
          />,
        );

        // 全选按钮应存在
        const selectAllButton = screen.getByLabelText("全选");
        expect(selectAllButton).toBeInTheDocument();

        // 按钮文字应为"取消全选"（全选状态）
        expect(selectAllButton.textContent).toContain("取消全选");

        // 点击按钮应触发 onToggleSelectAll
        fireEvent.click(selectAllButton);
        expect(onToggleSelectAll).toHaveBeenCalledOnce();

        cleanup();
      }),
      { numRuns: 100 },
    );
  });

  it("Property 5c: round-trip 完整性 - 模拟全选再取消全选的状态转换", () => {
    fc.assert(
      fc.property(arbAccountsWithPartialSelection, ({ accounts, selectedIds }) => {
        cleanup();

        const onToggleSelectAll = vi.fn();

        // 第一步：以未选/部分选中状态渲染
        const { unmount } = render(
          <AccountToolbar
            accounts={accounts}
            selectedIds={selectedIds}
            onDelete={vi.fn()}
            onRefresh={vi.fn().mockResolvedValue(undefined)}
            onToggleSelectAll={onToggleSelectAll}
            onClearSelection={vi.fn()}
          />,
        );

        // 按钮应显示"全选"
        let selectAllButton = screen.getByLabelText("全选");
        expect(selectAllButton.textContent).toContain("全选");
        expect(selectAllButton.textContent).not.toContain("取消全选");

        // 点击全选
        fireEvent.click(selectAllButton);
        expect(onToggleSelectAll).toHaveBeenCalledOnce();

        unmount();

        // 第二步：模拟父组件响应后，以全选状态重新渲染
        const allSelectedIds = new Set(accounts.map((a) => a.id));
        const onToggleSelectAll2 = vi.fn();

        const { unmount: unmount2 } = render(
          <AccountToolbar
            accounts={accounts}
            selectedIds={allSelectedIds}
            onDelete={vi.fn()}
            onRefresh={vi.fn().mockResolvedValue(undefined)}
            onToggleSelectAll={onToggleSelectAll2}
            onClearSelection={vi.fn()}
          />,
        );

        // 按钮应显示"取消全选"
        selectAllButton = screen.getByLabelText("全选");
        expect(selectAllButton.textContent).toContain("取消全选");

        // 点击取消全选
        fireEvent.click(selectAllButton);
        expect(onToggleSelectAll2).toHaveBeenCalledOnce();

        unmount2();

        // 第三步：模拟父组件响应后，以空选择状态重新渲染
        const { unmount: unmount3 } = render(
          <AccountToolbar
            accounts={accounts}
            selectedIds={new Set<string>()}
            onDelete={vi.fn()}
            onRefresh={vi.fn().mockResolvedValue(undefined)}
            onToggleSelectAll={vi.fn()}
            onClearSelection={vi.fn()}
          />,
        );

        // 按钮应回到"全选"状态，完成 round-trip
        selectAllButton = screen.getByLabelText("全选");
        expect(selectAllButton.textContent).toContain("全选");
        expect(selectAllButton.textContent).not.toContain("取消全选");

        unmount3();
        cleanup();
      }),
      { numRuns: 100 },
    );
  });
});



describe("AccountToolbar Property 6 - 全选按钮状态与选择状态同步", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  /**
   * Generator: 生成至少 1 个账户的非空列表
   */
  const arbNonEmptyAccounts: fc.Arbitrary<OTPAccount[]> = fc
    .integer({ min: 1, max: 10 })
    .chain((len) =>
      fc
        .tuple(...Array.from({ length: len }, (_, i) => arbAccount(i)))
        .map((tuple) => [...tuple]),
    );

  /**
   * Generator: 生成非空账户列表 + 空选择（无账户被选中）
   */
  const arbWithNoSelection: fc.Arbitrary<{
    accounts: OTPAccount[];
    selectedIds: Set<string>;
  }> = arbNonEmptyAccounts.map((accounts) => ({
    accounts,
    selectedIds: new Set<string>(),
  }));

  /**
   * Generator: 生成至少 2 个账户的列表 + 部分选中（非空且非全选）
   */
  const arbWithPartialSelection: fc.Arbitrary<{
    accounts: OTPAccount[];
    selectedIds: Set<string>;
  }> = fc
    .integer({ min: 2, max: 10 })
    .chain((len) =>
      fc
        .tuple(...Array.from({ length: len }, (_, i) => arbAccount(i)))
        .map((tuple) => [...tuple]),
    )
    .chain((accounts) =>
      fc
        .subarray(accounts, { minLength: 1, maxLength: accounts.length - 1 })
        .map((subset) => ({
          accounts,
          selectedIds: new Set(subset.map((a) => a.id)),
        })),
    );

  /**
   * Generator: 生成非空账户列表 + 全选状态
   */
  const arbWithFullSelection: fc.Arbitrary<{
    accounts: OTPAccount[];
    selectedIds: Set<string>;
  }> = arbNonEmptyAccounts.map((accounts) => ({
    accounts,
    selectedIds: new Set(accounts.map((a) => a.id)),
  }));

  /**
   * Feature: account-toolbar, Property 6: 全选按钮状态与选择状态同步
   * Validates: Requirements 5.3
   *
   * 对于任意非空账户列表和任意选择子集，全选按钮的视觉状态应与 SelectionState 一致：
   * 当无账户被选中时显示"未选"样式，当部分账户被选中时显示"部分选中"样式，
   * 当所有账户被选中时显示"已选"样式。
   */
  it("Property 6a: 无账户被选中时，全选按钮显示'未选'样式", () => {
    fc.assert(
      fc.property(arbWithNoSelection, ({ accounts, selectedIds }) => {
        cleanup();

        render(
          <AccountToolbar
            accounts={accounts}
            selectedIds={selectedIds}
            {...defaultCallbacks}
          />,
        );

        const selectAllButton = screen.getByLabelText("全选");

        // 未选样式：text-slate-600 bg-white border-slate-300
        expect(selectAllButton.className).toContain("text-slate-600");
        expect(selectAllButton.className).toContain("bg-white");
        expect(selectAllButton.className).toContain("border-slate-300");

        // 按钮文字应为"全选"
        expect(selectAllButton.textContent).toContain("全选");
        expect(selectAllButton.textContent).not.toContain("取消全选");

        cleanup();
      }),
      { numRuns: 100 },
    );
  });

  it("Property 6b: 部分账户被选中时，全选按钮显示'部分选中'样式", () => {
    fc.assert(
      fc.property(arbWithPartialSelection, ({ accounts, selectedIds }) => {
        cleanup();

        render(
          <AccountToolbar
            accounts={accounts}
            selectedIds={selectedIds}
            {...defaultCallbacks}
          />,
        );

        const selectAllButton = screen.getByLabelText("全选");

        // 部分选中样式：text-blue-600 bg-white border-blue-200
        expect(selectAllButton.className).toContain("text-blue-600");
        expect(selectAllButton.className).toContain("bg-white");
        expect(selectAllButton.className).toContain("border-blue-200");

        // 按钮文字应为"全选"（非全选状态）
        expect(selectAllButton.textContent).toContain("全选");
        expect(selectAllButton.textContent).not.toContain("取消全选");

        cleanup();
      }),
      { numRuns: 100 },
    );
  });

  it("Property 6c: 所有账户被选中时，全选按钮显示'已选'样式", () => {
    fc.assert(
      fc.property(arbWithFullSelection, ({ accounts, selectedIds }) => {
        cleanup();

        render(
          <AccountToolbar
            accounts={accounts}
            selectedIds={selectedIds}
            {...defaultCallbacks}
          />,
        );

        const selectAllButton = screen.getByLabelText("全选");

        // 全选样式：text-blue-700 bg-blue-50 border-blue-300
        expect(selectAllButton.className).toContain("text-blue-700");
        expect(selectAllButton.className).toContain("bg-blue-50");
        expect(selectAllButton.className).toContain("border-blue-300");

        // 按钮文字应为"取消全选"
        expect(selectAllButton.textContent).toContain("取消全选");

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

  /** 创建一个简单的测试账户 */
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

  // ========================================
  // 1. 空账户列表时按钮可见性（需求 1.4）
  // ========================================
  describe("空账户列表时按钮可见性（需求 1.4）", () => {
    it("空账户列表时，检查和刷新按钮可见", () => {
      render(
        <AccountToolbar
          accounts={[]}
          selectedIds={new Set<string>()}
          {...defaultCallbacks}
        />,
      );

      expect(screen.getByLabelText("检查")).toBeInTheDocument();
      expect(screen.getByLabelText("刷新")).toBeInTheDocument();
    });

    it("空账户列表时，删除和全选按钮不在 DOM 中", () => {
      render(
        <AccountToolbar
          accounts={[]}
          selectedIds={new Set<string>()}
          {...defaultCallbacks}
        />,
      );

      expect(screen.queryByLabelText("删除")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("全选")).not.toBeInTheDocument();
    });
  });

  // ========================================
  // 2. 删除确认对话框交互（需求 3.1, 3.3, 3.4）
  // ========================================
  describe("删除确认对话框交互（需求 3.1, 3.3, 3.4）", () => {
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

    it("有选中账户时点击删除，弹出 confirm 确认对话框", () => {
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
      const account = makeAccount();

      render(
        <AccountToolbar
          accounts={[account]}
          selectedIds={new Set(["acc-1"])}
          {...defaultCallbacks}
        />,
      );

      fireEvent.click(screen.getByLabelText("删除"));

      expect(confirmSpy).toHaveBeenCalledWith("确定要删除选中的 1 个账户吗？");

      confirmSpy.mockRestore();
    });

    it("取消确认时不调用 onDelete", () => {
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

      render(
        <AccountToolbar
          accounts={[makeAccount()]}
          selectedIds={new Set(["acc-1"])}
          {...defaultCallbacks}
        />,
      );

      fireEvent.click(screen.getByLabelText("删除"));

      expect(defaultCallbacks.onDelete).not.toHaveBeenCalled();
      expect(defaultCallbacks.onClearSelection).not.toHaveBeenCalled();

      confirmSpy.mockRestore();
    });

    it("确认删除后，为每个选中账户调用 onDelete 并调用 onClearSelection", () => {
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

      fireEvent.click(screen.getByLabelText("删除"));

      expect(onDelete).toHaveBeenCalledTimes(2);
      const calledIds = onDelete.mock.calls.map((c) => c[0]);
      expect(calledIds).toContain("a1");
      expect(calledIds).toContain("a3");
      expect(onClearSelection).toHaveBeenCalledOnce();

      confirmSpy.mockRestore();
    });
  });

  // ========================================
  // 3. 刷新按钮加载状态和错误处理（需求 4.2, 4.3）
  // ========================================
  describe("刷新按钮加载状态和错误处理（需求 4.2, 4.3）", () => {
    it("点击刷新按钮调用 onRefresh", async () => {
      const onRefresh = vi.fn().mockResolvedValue(undefined);

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
        expect(onRefresh).toHaveBeenCalledOnce();
      });
    });

    it("刷新期间按钮禁用并显示'刷新中...'", async () => {
      let resolveRefresh!: () => void;
      const onRefresh = vi.fn(
        () => new Promise<void>((resolve) => { resolveRefresh = resolve; }),
      );

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
        // icon-only 模式下，刷新中显示 spinner 动画而非文字
        expect(refreshButton.querySelector(".animate-spin")).toBeTruthy();
      });

      // 完成刷新
      resolveRefresh();

      await waitFor(() => {
        const refreshButton = screen.getByLabelText("刷新");
        expect(refreshButton).not.toBeDisabled();
        // 刷新完成后 spinner 消失
        expect(refreshButton.querySelector(".animate-spin")).toBeFalsy();
      });
    });

    it("刷新失败时显示错误信息", async () => {
      const onRefresh = vi.fn().mockRejectedValue(new Error("网络错误"));

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
        expect(screen.getByRole("alert")).toBeInTheDocument();
        expect(screen.getByText(/网络错误/)).toBeInTheDocument();
      });
    });
  });

  // ========================================
  // 4. 检查结果对话框展示（需求 2.3, 2.4）
  // ========================================
  describe("检查结果对话框展示（需求 2.3, 2.4）", () => {
    it("所有账户有效且无重复时，显示成功提示", async () => {
      const account = makeAccount({ secret: "JBSWY3DPEHPK3PXP" });

      render(
        <AccountToolbar
          accounts={[account]}
          selectedIds={new Set<string>()}
          {...defaultCallbacks}
        />,
      );

      fireEvent.click(screen.getByLabelText("检查"));

      await waitFor(() => {
        expect(screen.getByText(/正常/)).toBeInTheDocument();
      });
    });

    it("存在无效密钥时，弹出 CheckResultDialog", async () => {
      const validAccount = makeAccount({ id: "valid-1", secret: "JBSWY3DPEHPK3PXP" });
      const invalidAccount = makeAccount({ id: "invalid-1", secret: "!!!invalid!!!", issuer: "BadService", name: "bad@test.com" });

      render(
        <AccountToolbar
          accounts={[validAccount, invalidAccount]}
          selectedIds={new Set<string>()}
          {...defaultCallbacks}
        />,
      );

      fireEvent.click(screen.getByLabelText("检查"));

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(screen.getByText("1 个无效密钥")).toBeInTheDocument();
        expect(screen.getByText("BadService - bad@test.com")).toBeInTheDocument();
      });
    });
  });
});
