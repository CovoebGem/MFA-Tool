import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import fc from "fast-check";
import { useState } from "react";
import AccountPage from "../AccountPage";
import type { OTPAccount, Group } from "../../types";

// Mock useTOTP hook to avoid crypto dependency in tests
vi.mock("../../hooks/useTOTP", () => ({
  useTOTP: () => ({ code: "123456", remaining: 25 }),
}));

// Mock clipboard API
Object.assign(navigator, {
  clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
});

const defaultGroup: Group = {
  id: "default",
  name: "默认分组",
  isDefault: true,
  createdAt: 0,
};

const mockGroups: Group[] = [
  defaultGroup,
  { id: "g1", name: "工作", isDefault: false, createdAt: 1000 },
  { id: "g2", name: "个人", isDefault: false, createdAt: 2000 },
];

/**
 * Generator: 生成有效的 OTPAccount，使用唯一 issuer 确保 aria-label 唯一
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
 * Generator: 生成非空账户列表（1~8 个），每个账户有唯一 issuer
 */
const arbNonEmptyAccounts: fc.Arbitrary<OTPAccount[]> = fc
  .integer({ min: 1, max: 8 })
  .chain((len) =>
    fc.tuple(...Array.from({ length: len }, (_, i) => arbAccount(i))),
  )
  .map((tuple) => [...tuple]);

const createDefaultProps = () => ({
  groups: mockGroups,
  onDelete: vi.fn(),
  onBatchMoveToGroup: vi.fn(),
  onRefresh: vi.fn().mockResolvedValue(undefined),
  selectedIds: new Set<string>(),
  onSelectedIdsChange: vi.fn(),
});

function renderWithSelectionState(accounts: OTPAccount[]) {
  const props = createDefaultProps();

  function Harness() {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    return (
      <AccountPage
        {...props}
        accounts={accounts}
        selectedIds={selectedIds}
        onSelectedIdsChange={setSelectedIds}
      />
    );
  }

  return render(<Harness />);
}

describe("AccountPage Property Tests", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  // Feature: account-toolbar, Property 5: 全选/取消全选 round-trip
  // Validates: Requirements 5.1, 5.2
  it("Property 2: 全选后所有账户被选中，再取消全选后所有账户未被选中", () => {
    fc.assert(
      fc.property(arbNonEmptyAccounts, (accounts) => {
        cleanup();
        renderWithSelectionState(accounts);

        const selectAllButton = screen.getByLabelText("全选");

        // 点击全选
        act(() => {
          fireEvent.click(selectAllButton);
        });
        for (const account of accounts) {
          expect(screen.getByLabelText(`选择账户 ${account.issuer}`)).toBeChecked();
        }

        // 再次点击（取消全选）
        const deselectButton = screen.getByLabelText("全选");
        act(() => {
          fireEvent.click(deselectButton);
        });
        for (const account of accounts) {
          expect(screen.getByLabelText(`选择账户 ${account.issuer}`)).not.toBeChecked();
        }

        cleanup();
      }),
      { numRuns: 100 },
    );
  });

  // Feature: account-toolbar, Property 6: 全选按钮状态与选择状态同步
  // Validates: Requirements 5.3
  it("Property 3: 全选按钮状态与选中子集同步 - 样式和文字变化", () => {
    fc.assert(
      fc.property(
        arbNonEmptyAccounts.chain((accounts) =>
          fc
            .subarray(accounts, { minLength: 0, maxLength: accounts.length })
            .map((subset) => ({ accounts, selectedSubset: subset })),
        ),
        ({ accounts, selectedSubset }) => {
          cleanup();
          renderWithSelectionState(accounts);

          // 逐个点击选中 subset 中的账户
          for (const account of selectedSubset) {
            const checkbox = screen.getByLabelText(
              `选择账户 ${account.issuer}`,
            );
            act(() => {
              fireEvent.click(checkbox);
            });
          }

          const selectAllButton = screen.getByLabelText("全选");

          const selectedCount = selectedSubset.length;
          const totalCount = accounts.length;

          if (selectedCount === 0) {
            // 无选中：按钮文字为"全选"，使用 slate 样式
            expect(selectAllButton.textContent).toContain("全选");
            expect(selectAllButton.className).toContain("text-slate-600");
          } else if (selectedCount === totalCount) {
            // 全选中：按钮文字为"取消全选"，使用 blue-700 样式
            expect(selectAllButton.textContent).toContain("取消全选");
            expect(selectAllButton.className).toContain("text-blue-700");
          } else {
            // 部分选中：按钮文字为"全选"，使用 blue-600 样式
            expect(selectAllButton.textContent).toContain("全选");
            expect(selectAllButton.className).toContain("text-blue-600");
          }

          cleanup();
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: batch-move-group, Property 4: Batch_Toolbar 可见性与选择状态一致
  // Validates: Requirements 3.1, 3.2
  it("Property 4: BatchToolbar 可见当且仅当选中账户数量大于 0", () => {
    fc.assert(
      fc.property(
        arbNonEmptyAccounts.chain((accounts) =>
          fc
            .subarray(accounts, { minLength: 0, maxLength: accounts.length })
            .map((subset) => ({ accounts, selectedSubset: subset })),
        ),
        ({ accounts, selectedSubset }) => {
          cleanup();
          renderWithSelectionState(accounts);

          // 逐个点击选中 subset 中的账户
          for (const account of selectedSubset) {
            const checkbox = screen.getByLabelText(
              `选择账户 ${account.issuer}`,
            );
            act(() => {
              fireEvent.click(checkbox);
            });
          }

          const selectedCount = selectedSubset.length;

          if (selectedCount > 0) {
            // 有选中：BatchToolbar 应可见
            expect(
              screen.getByText(`已选择 ${selectedCount} 个账户`),
            ).toBeInTheDocument();
          } else {
            // 无选中：BatchToolbar 不应存在
            expect(
              screen.queryByText(/已选择 \d+ 个账户/),
            ).not.toBeInTheDocument();
          }

          cleanup();
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("AccountPage Unit Tests - 移除独立分组下拉框 & 分组名称显示", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const accounts: OTPAccount[] = [
    {
      id: "a1",
      issuer: "GitHub",
      name: "dev@github.com",
      secret: "JBSWY3DPEHPK3PXP",
      type: "totp",
      counter: 0,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      createdAt: 1000,
      groupId: "g1",
    },
    {
      id: "a2",
      issuer: "Google",
      name: "user@gmail.com",
      secret: "JBSWY3DPEHPK3PXP",
      type: "totp",
      counter: 0,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      createdAt: 2000,
      groupId: "g2",
    },
  ];

  // Validates: Requirement 1.1
  // AccountPage 不再在每个 AccountCard 下方渲染独立的分组选择下拉框
  it("should not render per-card group <select> dropdowns", () => {
    const props = createDefaultProps();
    const { container } = render(<AccountPage {...props} accounts={accounts} />);

    // 页面上唯一的 <select> 应该是 SortControls 的排序字段选择器
    const allSelects = container.querySelectorAll("select");
    expect(allSelects.length).toBe(1);
    expect(allSelects[0].getAttribute("aria-label")).toBe("排序字段");

    // 卡片网格和搜索栏中不应存在任何 <select>
    const searchInput = screen.getByRole("searchbox", { name: "搜索账户" });
    expect(searchInput.closest("div")?.querySelectorAll("select").length).toBe(0);
    const cardGrid = screen.getByText("GitHub").closest(".grid");
    expect(cardGrid?.querySelectorAll("select").length).toBe(0);

    // 不应存在任何分组相关的 <select>（如 "移动到分组" 下拉框）
    const groupSelect = screen.queryByLabelText(/移动到分组|选择分组|分组选择/);
    expect(groupSelect).not.toBeInTheDocument();
  });

  // Validates: Requirement 1.2
  // AccountPage 保留在每个 AccountCard 上显示当前所属分组名称的能力
  it("should display group names on AccountCards", () => {
    const props = createDefaultProps();
    render(<AccountPage {...props} accounts={accounts} />);

    // 账户 a1 属于 g1（"工作"），a2 属于 g2（"个人"）
    expect(screen.getByText("工作")).toBeInTheDocument();
    expect(screen.getByText("个人")).toBeInTheDocument();
  });
});

describe("AccountPage 搜索与交互边界", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const sampleAccounts: OTPAccount[] = [
    {
      id: "a1",
      issuer: "GitHub",
      name: "dev@company.com",
      secret: "GITHUBONLYSECRET2345",
      type: "totp",
      counter: 0,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      createdAt: 1000,
      groupId: "g1",
      order: 0,
    },
    {
      id: "a2",
      issuer: "Google",
      name: "alice@gmail.com",
      secret: "JBSWY3DPEHPK3PXP",
      type: "totp",
      counter: 0,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      createdAt: 2000,
      groupId: "g2",
      order: 1,
    },
    {
      id: "a3",
      issuer: "Cloudflare",
      name: "ops@site.org",
      secret: "SECRETONLYTOKEN2345",
      type: "totp",
      counter: 0,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      createdAt: 3000,
      groupId: "g1",
      order: 2,
    },
  ];

  function renderStatefulPage(extraProps: Partial<Parameters<typeof AccountPage>[0]> = {}) {
    const onBatchDelete = extraProps.onBatchDelete ?? vi.fn().mockResolvedValue(undefined);
    const onReorder = extraProps.onReorder ?? vi.fn();

    function Harness() {
      const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
      return (
        <AccountPage
          accounts={sampleAccounts}
          groups={mockGroups}
          onDelete={vi.fn()}
          onBatchDelete={onBatchDelete}
          onBatchMoveToGroup={vi.fn()}
          onRefresh={vi.fn().mockResolvedValue(undefined)}
          onReorder={onReorder}
          selectedIds={selectedIds}
          onSelectedIdsChange={setSelectedIds}
          {...extraProps}
        />
      );
    }

    return { ...render(<Harness />), onBatchDelete, onReorder };
  }

  it("支持多词跨字段过滤、显示匹配计数、清空恢复且不匹配密钥", () => {
    renderStatefulPage();

    const searchInput = screen.getByRole("searchbox", { name: "搜索账户" });
    expect(screen.getByText("全部账户（3）")).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: "git 工作" } });
    expect(screen.getByText("全部账户（1 / 3）")).toBeInTheDocument();
    expect(screen.getByText("GitHub")).toBeInTheDocument();
    expect(screen.queryByText("Google")).not.toBeInTheDocument();
    expect(screen.queryByText("Cloudflare")).not.toBeInTheDocument();

    // 搜索仅存在于 secret 中的词不命中
    fireEvent.change(searchInput, { target: { value: "SECRETONLYTOKEN" } });
    expect(screen.getByText("全部账户（0 / 3）")).toBeInTheDocument();
    expect(screen.getByText("未找到匹配「SECRETONLYTOKEN」的账户")).toBeInTheDocument();

    // 点击空状态清空按钮恢复全部并重新聚焦搜索框
    const clearButtons = screen.getAllByRole("button", { name: "清空搜索" });
    fireEvent.click(clearButtons[clearButtons.length - 1]);
    expect(screen.getByText("全部账户（3）")).toBeInTheDocument();
    expect(document.activeElement).toBe(searchInput);
  });

  it("查询变化时清空选择，搜索态下全选和批量删除仅作用于可见账户且检查仍覆盖全库", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const onBatchDelete = vi.fn().mockResolvedValue(undefined);
    const accountsWithInvalidSecret: OTPAccount[] = [
      ...sampleAccounts.slice(0, 2),
      {
        ...sampleAccounts[2],
        secret: "INVALID!SECRET",
      },
    ];

    function Harness() {
      const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
      return (
        <AccountPage
          accounts={accountsWithInvalidSecret}
          groups={mockGroups}
          onDelete={vi.fn()}
          onBatchDelete={onBatchDelete}
          onBatchMoveToGroup={vi.fn()}
          onRefresh={vi.fn().mockResolvedValue(undefined)}
          selectedIds={selectedIds}
          onSelectedIdsChange={setSelectedIds}
        />
      );
    }

    render(<Harness />);

    // 先勾选 Google
    fireEvent.click(screen.getByLabelText("选择账户 Google"));
    expect(screen.getByText("已选择 1 个账户")).toBeInTheDocument();

    // 输入仅匹配 GitHub 的查询词 -> 原先勾选的 Google 应被清空
    const searchInput = screen.getByRole("searchbox", { name: "搜索账户" });
    fireEvent.change(searchInput, { target: { value: "GitHub" } });
    expect(screen.queryByText(/已选择 \d+ 个账户/)).not.toBeInTheDocument();

    // 全选仅选中可见的 GitHub
    fireEvent.click(screen.getByLabelText("全选"));
    expect(screen.getByText("已选择 1 个账户")).toBeInTheDocument();
    expect(screen.getByLabelText("选择账户 GitHub")).toBeChecked();

    // 点击删除只提交可见选中项 a1
    await act(async () => {
      fireEvent.click(screen.getByLabelText("删除"));
      await Promise.resolve();
    });
    expect(onBatchDelete).toHaveBeenCalledTimes(1);
    expect(onBatchDelete).toHaveBeenCalledWith(["a1"]);

    // 全库检查在过滤态下仍能检出隐藏账户 Cloudflare 的无效密钥
    await act(async () => {
      fireEvent.click(screen.getByLabelText("检查"));
      await Promise.resolve();
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("1 个无效密钥")).toBeInTheDocument();
    expect(screen.getByText("Cloudflare - ops@site.org")).toBeInTheDocument();

    confirmSpy.mockRestore();
  });

  it("搜索态禁用拖拽排序，已处于自定义排序时输入查询禁用拖拽且不触发子集覆盖", () => {
    const { container, onReorder } = renderStatefulPage();
    const searchInput = screen.getByRole("searchbox", { name: "搜索账户" });

    // 先切到拖拽排序 -> 所有 3 张卡片都具备 draggable="true"
    const customBtn = screen.getByRole("button", { name: "拖拽排序" });
    fireEvent.click(customBtn);
    expect(screen.getByText("拖拽卡片以调整顺序")).toBeInTheDocument();
    expect(container.querySelectorAll('[draggable="true"]')).toHaveLength(3);

    // 切到拖拽排序后搜索 -> 按钮禁用，显示提示，卡片失去 draggable="true"，派发拖拽也不调用 onReorder
    fireEvent.change(searchInput, { target: { value: "GitHub" } });
    expect(customBtn).toBeDisabled();
    expect(screen.getByText("清空搜索后可调整顺序")).toBeInTheDocument();
    expect(container.querySelectorAll('[draggable="true"]')).toHaveLength(0);

    const card = screen.getByText("GitHub").closest(".bg-white") as HTMLElement;
    const dataTransfer = { effectAllowed: "", dropEffect: "", setData: vi.fn() };
    fireEvent.dragStart(card, { dataTransfer });
    fireEvent.dragOver(card, { dataTransfer });
    fireEvent.drop(card, { dataTransfer });
    fireEvent.dragEnd(card);
    expect(onReorder).not.toHaveBeenCalled();

    // 清空搜索恢复可拖拽状态 -> 3 张卡片恢复 draggable="true"
    fireEvent.keyDown(searchInput, { key: "Escape" });
    expect(customBtn).not.toBeDisabled();
    expect(screen.getByText("拖拽卡片以调整顺序")).toBeInTheDocument();
    expect(container.querySelectorAll('[draggable="true"]')).toHaveLength(3);
  });

  it("Ctrl/Cmd+F 聚焦搜索框且透传分组名与编辑能力给拖拽列表", () => {
    renderStatefulPage({ onUpdate: vi.fn() });
    const searchInput = screen.getByRole("searchbox", { name: "搜索账户" }) as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: "GitHub" } });
    searchInput.blur();

    fireEvent.keyDown(window, { key: "f", ctrlKey: true });
    expect(document.activeElement).toBe(searchInput);

    // 切到拖拽排序模式仍能看到分组徽章与编辑按钮
    fireEvent.keyDown(searchInput, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "拖拽排序" }));
    expect(screen.getAllByText("工作").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "编辑账户" }).length).toBe(3);
  });
});
