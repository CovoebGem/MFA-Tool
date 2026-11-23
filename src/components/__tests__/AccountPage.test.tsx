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
  onBatchSetPinned: vi.fn().mockResolvedValue(undefined),
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
    localStorage.clear();
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
  }, 30000);

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
            // 无选中：按钮文字为"全选"，使用语义未选状态
            expect(selectAllButton.textContent).toContain("全选");
            expect(selectAllButton).toHaveAttribute("data-selection-state", "none");
            expect(selectAllButton.className).toContain("text-muted-foreground");
          } else if (selectedCount === totalCount) {
            // 全选中：按钮文字为"取消全选"，使用语义全选状态
            expect(selectAllButton.textContent).toContain("取消全选");
            expect(selectAllButton).toHaveAttribute("data-selection-state", "all");
            expect(selectAllButton.className).toContain("bg-primary/10");
          } else {
            // 部分选中：按钮文字为"全选"，使用语义部分选中状态
            expect(selectAllButton.textContent).toContain("全选");
            expect(selectAllButton).toHaveAttribute("data-selection-state", "partial");
            expect(selectAllButton.className).toContain("border-primary/25");
          }

          cleanup();
        },
      ),
      { numRuns: 100 },
    );
  }, 30000);

  // Validates: 工具栏选中计数与快捷操作可用性与选择状态一致（不弹出 BatchToolbar）
  it("Property 4: 工具栏选中计数与快捷置顶/移动按钮随选择状态同步且不渲染 BatchToolbar", () => {
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
          expect(screen.queryByLabelText("批量移动")).not.toBeInTheDocument();
          expect(screen.queryByText("批量移动")).not.toBeInTheDocument();

          const moveBtn = screen.getByLabelText("移动到分组");
          const pinBtn = screen.getByLabelText("置顶");

          if (selectedCount > 0) {
            expect(screen.getByText(`已选 ${selectedCount}`)).toBeInTheDocument();
            expect(moveBtn).toBeEnabled();
            expect(pinBtn).toBeEnabled();
          } else {
            expect(screen.queryByText(/已选 \d+/)).not.toBeInTheDocument();
            expect(moveBtn).toBeDisabled();
            expect(pinBtn).toBeDisabled();
          }

          cleanup();
        },
      ),
      { numRuns: 100 },
    );
  }, 30000);
});

describe("AccountPage Unit Tests - 移除独立分组下拉框 & 分组名称显示", () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
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
    const groupSelects = Array.from(container.querySelectorAll("select")).filter((el) =>
      /移动到分组|选择分组|分组选择/.test(el.getAttribute("aria-label") ?? ""),
    );
    expect(groupSelects).toHaveLength(0);
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
    localStorage.clear();
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

  it("查询变化时清空选择，搜索态下全选和批量删除仅作用于可见账户且支持按备注过滤", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const onBatchDelete = vi.fn().mockResolvedValue(undefined);
    const accountsWithRemark: OTPAccount[] = [
      ...sampleAccounts.slice(0, 2),
      {
        ...sampleAccounts[2],
        remark: "核心生产网关",
      },
    ];

    function Harness() {
      const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
      return (
        <AccountPage
          accounts={accountsWithRemark}
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
    expect(screen.getByText("已选 1")).toBeInTheDocument();

    // 输入仅匹配 GitHub 的查询词 -> 原先勾选的 Google 应被清空
    const searchInput = screen.getByRole("searchbox", { name: "搜索账户" });
    fireEvent.change(searchInput, { target: { value: "GitHub" } });
    expect(screen.queryByText(/已选 \d+/)).not.toBeInTheDocument();

    // 全选仅选中可见的 GitHub
    fireEvent.click(screen.getByLabelText("全选"));
    expect(screen.getByText("已选 1")).toBeInTheDocument();
    expect(screen.getByLabelText("选择账户 GitHub")).toBeChecked();

    // 点击删除只提交可见选中项 a1
    await act(async () => {
      fireEvent.click(screen.getByLabelText("删除"));
      await Promise.resolve();
    });
    expect(onBatchDelete).toHaveBeenCalledTimes(1);
    expect(onBatchDelete).toHaveBeenCalledWith(["a1"]);

    // 按备注过滤可命中 Cloudflare 且工具栏不渲染检查按钮
    expect(screen.queryByLabelText("检查")).not.toBeInTheDocument();
    fireEvent.change(searchInput, { target: { value: "核心生产" } });
    expect(screen.getByText("Cloudflare")).toBeInTheDocument();
    expect(screen.getByText("核心生产网关")).toBeInTheDocument();
    expect(screen.queryByText("GitHub")).not.toBeInTheDocument();

    confirmSpy.mockRestore();
  });

  it("搜索态自动隐藏拖拽抓手并禁止拖拽重排，清空搜索后恢复可拖拽", () => {
    const { container, onReorder } = renderStatefulPage();
    const searchInput = screen.getByRole("searchbox", { name: "搜索账户" });

    // 默认即可直接拖拽，无需切换模式
    expect(container.querySelectorAll('[data-sortable-id]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-drag-handle="true"]')).toHaveLength(3);

    // 输入搜索词 -> 卡片失去拖拽属性与抓手，派发拖拽不调用 onReorder
    fireEvent.change(searchInput, { target: { value: "GitHub" } });
    expect(container.querySelectorAll('[data-sortable-id]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-drag-handle="true"]')).toHaveLength(0);

    const card = screen.getByText("GitHub").closest('[data-slot="card"]') as HTMLElement;
    fireEvent.pointerDown(card, { button: 0, pointerId: 1, clientX: 50, clientY: 150 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 300, clientY: 150 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 300, clientY: 150 });
    expect(onReorder).not.toHaveBeenCalled();

    // 清空搜索恢复可拖拽状态
    fireEvent.keyDown(searchInput, { key: "Escape" });
    expect(container.querySelectorAll('[data-sortable-id]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-drag-handle="true"]')).toHaveLength(3);
  });

  it("Ctrl/Cmd+F 聚焦搜索框且透传分组名与编辑能力给拖拽列表", () => {
    renderStatefulPage({ onUpdate: vi.fn() });
    const searchInput = screen.getByRole("searchbox", { name: "搜索账户" }) as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: "GitHub" } });
    searchInput.blur();

    fireEvent.keyDown(window, { key: "f", ctrlKey: true });
    expect(document.activeElement).toBe(searchInput);

    fireEvent.keyDown(searchInput, { key: "Escape" });
    expect(screen.getAllByText("工作").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "编辑账户" }).length).toBe(3);
  });

  it("置顶账户分展示在顶部、卡片内不显示置顶按钮、支持网格与列表双层区分、搜索与拖拽跨边界保护", () => {
    const onReorder = vi.fn();
    const pinnedAccounts: OTPAccount[] = [
      { ...sampleAccounts[0], pinned: false, order: 0 },
      { ...sampleAccounts[1], pinned: true, pinnedAt: 5000, order: 1 },
      { ...sampleAccounts[2], pinned: false, order: 2 },
    ];

    const { container } = render(
      <AccountPage
        accounts={pinnedAccounts}
        groups={mockGroups}
        onDelete={vi.fn()}
        onBatchMoveToGroup={vi.fn()}
        onRefresh={vi.fn().mockResolvedValue(undefined)}
        onReorder={onReorder}
        selectedIds={new Set()}
        onSelectedIdsChange={vi.fn()}
      />,
    );

    expect(screen.queryByText(/^\d+\s*已置顶$/)).not.toBeInTheDocument();
    expect(document.querySelectorAll('[data-slot="card"] button[aria-label*="置顶"]')).toHaveLength(0);

    const pinnedSection = screen.getByRole("region", { name: "已置顶" });
    const otherSection = screen.getByRole("region", { name: "其他账户" });
    expect(pinnedSection).toHaveTextContent("Google");
    expect(otherSection).toHaveTextContent("GitHub");
    expect(otherSection).toHaveTextContent("Cloudflare");

    // 切换到列表视图时同样保留“已置顶 / 其他账户”分层且行内无置顶按钮
    fireEvent.click(screen.getByRole("button", { name: "列表视图" }));
    expect(document.querySelectorAll('[data-slot="account-row"] button[aria-label*="置顶"]')).toHaveLength(0);
    const pinnedListSection = screen.getByRole("region", { name: "已置顶" });
    const otherListSection = screen.getByRole("region", { name: "其他账户" });
    expect(pinnedListSection.querySelectorAll('[data-slot="account-row"]')).toHaveLength(1);
    expect(pinnedListSection).toHaveTextContent("Google");
    expect(otherListSection.querySelectorAll('[data-slot="account-row"]')).toHaveLength(2);

    // 切回网格视图继续测试
    fireEvent.click(screen.getByRole("button", { name: "网格视图" }));

    // 搜索仅匹配到置顶和非置顶各一条时，已置顶仍保持在先
    const searchInput = screen.getByRole("searchbox", { name: "搜索账户" });
    fireEvent.change(searchInput, { target: { value: ".com" } });
    const cards = Array.from(document.querySelectorAll('[data-slot="card"]'));
    expect(cards.map((el) => el.getAttribute("data-pinned"))).toEqual(["true", "false"]);

    // 清空搜索后，尝试把置顶卡片拖向未置顶卡片应阻止并显示禁止反馈，不触发跨分区重排
    fireEvent.keyDown(searchInput, { key: "Escape" });
    const pinnedCard = screen.getByText("Google").closest('[data-slot="card"]') as HTMLElement;
    const unpinnedCard = screen.getByText("GitHub").closest('[data-slot="card"]') as HTMLElement;
    const rect = (left: number, top: number, width: number, height: number) =>
      ({
        x: left,
        y: top,
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        toJSON: () => ({}),
      }) as DOMRect;
    pinnedCard.getBoundingClientRect = () => rect(20, 100, 260, 140);
    unpinnedCard.getBoundingClientRect = () => rect(20, 300, 260, 140);
    const cloudflareCard = screen.getByText("Cloudflare").closest('[data-slot="card"]') as HTMLElement;
    cloudflareCard.getBoundingClientRect = () => rect(300, 300, 260, 140);

    fireEvent.pointerDown(pinnedCard, { button: 0, pointerId: 1, clientX: 100, clientY: 160 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 100, clientY: 360 });
    expect(document.querySelector('[data-slot="drag-overlay"]')).toHaveAttribute(
      "data-drag-forbidden",
      "true",
    );
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 100, clientY: 360 });
    expect(onReorder).not.toHaveBeenCalled();
    expect(container.querySelectorAll('[data-slot="card"]')).toHaveLength(3);
  });

  it("支持通过工具栏置顶、取消置顶及移动到分组，并在成功清空、失败保留选中", async () => {
    const onBatchSetPinned = vi.fn().mockResolvedValue(undefined);
    const onBatchMoveToGroup = vi.fn().mockResolvedValue(undefined);
    const mixedAccounts: OTPAccount[] = [
      { ...sampleAccounts[0], pinned: false, remark: "生产主账号" },
      { ...sampleAccounts[1], pinned: true, pinnedAt: 5000 },
      { ...sampleAccounts[2], pinned: false },
    ];

    function Harness() {
      const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
      return (
        <AccountPage
          accounts={mixedAccounts}
          groups={mockGroups}
          onDelete={vi.fn()}
          onBatchSetPinned={onBatchSetPinned}
          onBatchMoveToGroup={onBatchMoveToGroup}
          onRefresh={vi.fn().mockResolvedValue(undefined)}
          selectedIds={selectedIds}
          onSelectedIdsChange={setSelectedIds}
        />
      );
    }

    render(<Harness />);

    expect(screen.getByText("生产主账号")).toBeInTheDocument();

    // 选中未置顶的 GitHub 与已置顶的 Google -> 工具栏按钮启用
    fireEvent.click(screen.getByLabelText("选择账户 GitHub"));
    fireEvent.click(screen.getByLabelText("选择账户 Google"));
    expect(screen.getByText("已选 2")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "置顶" }));
      await Promise.resolve();
    });
    expect(onBatchSetPinned).toHaveBeenCalledTimes(1);
    expect(onBatchSetPinned.mock.calls[0][1]).toBe(true);
    expect(new Set(onBatchSetPinned.mock.calls[0][0])).toEqual(new Set(["a1", "a2"]));
    expect(screen.queryByText(/已选 \d+/)).not.toBeInTheDocument();

    // 仅选已置顶账户 -> 工具栏显示“取消置顶”；若后端拒绝，则保留当前选中状态
    onBatchSetPinned.mockRejectedValueOnce(new Error("写入失败"));
    fireEvent.click(screen.getByLabelText("选择账户 Google"));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "取消置顶" }));
      await Promise.resolve();
    });
    expect(onBatchSetPinned).toHaveBeenCalledTimes(2);
    expect(onBatchSetPinned.mock.calls[1]).toEqual([["a2"], false]);
    expect(screen.getByText("已选 1")).toBeInTheDocument();

    // 通过工具栏移动菜单把选中账户移动到“工作”分组
    fireEvent.click(screen.getByRole("button", { name: "移动到分组" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "工作" }));
      await Promise.resolve();
    });
    expect(onBatchMoveToGroup).toHaveBeenCalledWith(["a2"], "g1");
    expect(screen.queryByText(/已选 \d+/)).not.toBeInTheDocument();
  });

  it("支持网格视图与列表视图切换并持久化偏好、保留多选、备注与拖拽能力", () => {
    renderStatefulPage({
      accounts: [
        { ...sampleAccounts[0], remark: "列表备注示例" },
        sampleAccounts[1],
        sampleAccounts[2],
      ],
      onBatchSetPinned: vi.fn().mockResolvedValue(undefined),
    });

    const gridToggle = screen.getByRole("button", { name: "网格视图" });
    const listToggle = screen.getByRole("button", { name: "列表视图" });
    expect(gridToggle).toHaveAttribute("aria-pressed", "true");
    expect(listToggle).toHaveAttribute("aria-pressed", "false");
    expect(document.querySelectorAll('[data-slot="card"]')).toHaveLength(3);
    expect(document.querySelector('[data-slot="account-list"]')).not.toBeInTheDocument();

    // 切换到列表视图
    fireEvent.click(listToggle);
    expect(listToggle).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem("2fa-view-mode")).toBe("list");
    expect(document.querySelector('[data-slot="account-list"]')).toBeInTheDocument();
    const rows = document.querySelectorAll('[data-slot="account-row"]');
    expect(rows).toHaveLength(3);
    expect(screen.getByText("列表备注示例")).toBeInTheDocument();

    // 列表视图下支持复选框选择、工具栏按钮、备注和复制验证码，且无需切模式即可具备拖拽能力
    fireEvent.click(screen.getByLabelText("选择账户 GitHub"));
    expect(screen.getByText("已选 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "置顶" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "移动到分组" })).toBeEnabled();

    fireEvent.click(screen.getAllByRole("button", { name: "复制验证码 123456" })[0]);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("123456");

    expect(document.querySelectorAll('[data-slot="account-row"][data-sortable-id]')).toHaveLength(3);
    expect(document.querySelectorAll('[data-slot="account-row"] [data-drag-handle="true"]')).toHaveLength(3);
  });

  it("支持在空白处左键拖拽框选账户，同时直接拖拽卡片不会误触发框选", async () => {
    const { container } = renderStatefulPage();

    const makeRect = (left: number, top: number, width: number, height: number) =>
      ({
        x: left,
        y: top,
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        toJSON: () => ({}),
      }) as DOMRect;

    const card1 = container.querySelector('[data-selectable-id="a1"]') as HTMLElement;
    const card2 = container.querySelector('[data-selectable-id="a2"]') as HTMLElement;
    const card3 = container.querySelector('[data-selectable-id="a3"]') as HTMLElement;
    card1.getBoundingClientRect = () => makeRect(20, 140, 280, 130);
    card2.getBoundingClientRect = () => makeRect(320, 140, 280, 130);
    card3.getBoundingClientRect = () => makeRect(20, 300, 280, 130);

    // 直接在卡片上按下拖动不会误触发框选
    fireEvent.mouseDown(card1, { button: 0, clientX: 50, clientY: 160 });
    fireEvent.mouseMove(window, { clientX: 200, clientY: 200 });
    const overlay = container.querySelector('[data-slot="marquee-selection-box"]') as HTMLElement;
    expect(overlay.dataset.active).toBe("false");
    fireEvent.mouseUp(window, { clientX: 200, clientY: 200 });

    const pageRoot = container.firstElementChild as HTMLElement;
    fireEvent.mouseDown(pageRoot, { button: 0, clientX: 5, clientY: 130 });
    fireEvent.mouseMove(window, { clientX: 400, clientY: 220 });
    fireEvent.mouseUp(window, { clientX: 400, clientY: 220 });

    expect(screen.getByText("已选 2")).toBeInTheDocument();
    expect(screen.getByLabelText("选择账户 GitHub")).toBeChecked();
    expect(screen.getByLabelText("选择账户 Google")).toBeChecked();
    expect(screen.getByLabelText("选择账户 Cloudflare")).not.toBeChecked();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // 切换到列表视图并清空选中 -> 支持框选列表行
    fireEvent.click(screen.getByRole("button", { name: "取消选择" }));
    fireEvent.click(screen.getByRole("button", { name: "列表视图" }));

    const row1 = container.querySelector('[data-selectable-id="a1"]') as HTMLElement;
    const row2 = container.querySelector('[data-selectable-id="a2"]') as HTMLElement;
    const row3 = container.querySelector('[data-selectable-id="a3"]') as HTMLElement;
    row1.getBoundingClientRect = () => makeRect(20, 150, 720, 48);
    row2.getBoundingClientRect = () => makeRect(20, 210, 720, 48);
    row3.getBoundingClientRect = () => makeRect(20, 270, 720, 48);

    fireEvent.mouseDown(pageRoot, { button: 0, clientX: 10, clientY: 140 });
    fireEvent.mouseMove(window, { clientX: 300, clientY: 230 });
    fireEvent.mouseUp(window, { clientX: 300, clientY: 230 });

    expect(screen.getByText("已选 2")).toBeInTheDocument();
    expect(screen.getByLabelText("选择账户 GitHub")).toBeChecked();
    expect(screen.getByLabelText("选择账户 Google")).toBeChecked();
  });

  it("支持自定义卡片大小和卡片间距并持久化，同时应用到网格视图", () => {
    renderStatefulPage();

    fireEvent.click(screen.getByRole("button", { name: "卡片布局设置" }));
    fireEvent.click(screen.getByRole("button", { name: "紧凑" }));

    const grid = screen.getByText("GitHub").closest(".grid") as HTMLElement;
    expect(grid).toHaveAttribute("data-card-scale", "compact");
    expect(grid.style.gridTemplateColumns).toBe("repeat(auto-fill, minmax(260px, 1fr))");
    expect(grid.style.gap).toBe("10px");
    expect(JSON.parse(localStorage.getItem("2fa-card-layout") ?? "{}")).toEqual({
      cardMinWidth: 260,
      cardGap: 10,
    });

    fireEvent.change(screen.getByLabelText("卡片大小"), { target: { value: "400" } });
    fireEvent.change(screen.getByLabelText("卡片间距"), { target: { value: "24" } });
    expect(grid).toHaveAttribute("data-card-scale", "large");
    expect(grid.style.gridTemplateColumns).toBe("repeat(auto-fill, minmax(400px, 1fr))");
    expect(grid.style.gap).toBe("24px");
  });

  it("统一排序模型：直接拖拽后自动切入并持久化自定义顺序，且工具栏与下拉框联动", async () => {
    const onReorderSpy = vi.fn();

    function ControlledHarness() {
      const [accounts, setAccounts] = useState<OTPAccount[]>(sampleAccounts);
      const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
      const handleReorder = (reordered: OTPAccount[]) => {
        onReorderSpy(reordered);
        setAccounts(reordered);
      };
      return (
        <AccountPage
          accounts={accounts}
          groups={mockGroups}
          onDelete={vi.fn()}
          onBatchMoveToGroup={vi.fn()}
          onRefresh={vi.fn().mockResolvedValue(undefined)}
          onReorder={handleReorder}
          selectedIds={selectedIds}
          onSelectedIdsChange={setSelectedIds}
        />
      );
    }

    const { container, unmount } = render(<ControlledHarness />);

    const makeRect = (left: number, top: number, width: number, height: number) =>
      ({
        x: left,
        y: top,
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        toJSON: () => ({}),
      }) as DOMRect;

    // 默认按名称升序：Google (alice), GitHub (dev), Cloudflare (ops)
    const initialTitles = Array.from(container.querySelectorAll('[data-slot="card"] h3')).map(
      (el) => el.textContent,
    );
    expect(initialTitles).toEqual(["Google", "GitHub", "Cloudflare"]);

    const cardGoogle = screen.getByText("Google").closest('[data-slot="card"]') as HTMLElement;
    const cardGitHub = screen.getByText("GitHub").closest('[data-slot="card"]') as HTMLElement;
    const cardCloudflare = screen.getByText("Cloudflare").closest('[data-slot="card"]') as HTMLElement;
    cardGoogle.getBoundingClientRect = () => makeRect(20, 100, 260, 140);
    cardGitHub.getBoundingClientRect = () => makeRect(300, 100, 260, 140);
    cardCloudflare.getBoundingClientRect = () => makeRect(580, 100, 260, 140);

    // 直接将 Google 从第 0 位拖到第 2 位（Cloudflare 上）
    fireEvent.pointerDown(cardGoogle, { button: 0, pointerId: 1, clientX: 100, clientY: 160 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 700, clientY: 160 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 700, clientY: 160 });

    expect(onReorderSpy).toHaveBeenCalledTimes(1);
    const reordered = onReorderSpy.mock.calls[0][0] as OTPAccount[];
    expect(reordered.map((a) => a.issuer)).toEqual(["GitHub", "Cloudflare", "Google"]);
    expect(localStorage.getItem("2fa-sort-mode")).toBe("custom");

    const sortSelect = screen.getByLabelText("排序字段") as HTMLSelectElement;
    expect(sortSelect.value).toBe("custom");
    expect(screen.getByRole("button", { name: "自定义排序" })).toBeDisabled();

    // 让松手尾随 click 抑制清理后，验证自定义顺序下仍可正常勾选与使用工具栏
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    fireEvent.click(screen.getByLabelText("选择账户 GitHub"));
    expect(screen.getByText("已选 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "移动到分组" })).toBeEnabled();

    unmount();

    // 重新挂载后保持自定义排序状态与新顺序
    const remounted = renderStatefulPage({ accounts: reordered });
    expect((screen.getByLabelText("排序字段") as HTMLSelectElement).value).toBe("custom");
    expect(
      Array.from(remounted.container.querySelectorAll('[data-slot="card"] h3')).map(
        (el) => el.textContent,
      ),
    ).toEqual(["GitHub", "Cloudflare", "Google"]);

    // 切换排序下拉框回 "name" -> 恢复按名称自动排序并更新 localStorage
    fireEvent.change(screen.getByLabelText("排序字段"), { target: { value: "name" } });
    expect(localStorage.getItem("2fa-sort-mode")).toBe("auto");
    expect(
      Array.from(remounted.container.querySelectorAll('[data-slot="card"] h3')).map(
        (el) => el.textContent,
      ),
    ).toEqual(["Google", "GitHub", "Cloudflare"]);

    // 再次切回 "custom" -> 恢复此前拖拽顺序
    fireEvent.change(screen.getByLabelText("排序字段"), { target: { value: "custom" } });
    expect(localStorage.getItem("2fa-sort-mode")).toBe("custom");
    expect(
      Array.from(remounted.container.querySelectorAll('[data-slot="card"] h3')).map(
        (el) => el.textContent,
      ),
    ).toEqual(["GitHub", "Cloudflare", "Google"]);
  });

  it("勾选多个账户后直接拖拽其中一个会整体移动并切入自定义排序，且保持原选中状态", async () => {
    const onReorderSpy = vi.fn();

    function ControlledHarness() {
      const [accounts, setAccounts] = useState<OTPAccount[]>(sampleAccounts);
      const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
      const handleReorder = (reordered: OTPAccount[]) => {
        onReorderSpy(reordered);
        setAccounts(reordered);
      };
      return (
        <AccountPage
          accounts={accounts}
          groups={mockGroups}
          onDelete={vi.fn()}
          onBatchMoveToGroup={vi.fn()}
          onRefresh={vi.fn().mockResolvedValue(undefined)}
          onReorder={handleReorder}
          selectedIds={selectedIds}
          onSelectedIdsChange={setSelectedIds}
        />
      );
    }

    const { container } = render(<ControlledHarness />);

    const makeRect = (left: number, top: number, width: number, height: number) =>
      ({
        x: left,
        y: top,
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        toJSON: () => ({}),
      }) as DOMRect;

    for (const el of Array.from(container.querySelectorAll<HTMLElement>("[data-sortable-id]"))) {
      el.getBoundingClientRect = () => {
        const siblings = Array.from(container.querySelectorAll<HTMLElement>("[data-sortable-id]"));
        const idx = siblings.indexOf(el);
        return makeRect(20 + idx * 280, 100, 260, 140);
      };
    }

    // 勾选前两项：Google、GitHub
    fireEvent.click(screen.getByLabelText("选择账户 Google"));
    fireEvent.click(screen.getByLabelText("选择账户 GitHub"));
    expect(screen.getByText("已选 2")).toBeInTheDocument();

    const cardGoogle = screen.getByText("Google").closest('[data-slot="card"]') as HTMLElement;
    fireEvent.pointerDown(cardGoogle, { button: 0, pointerId: 1, clientX: 100, clientY: 160 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 120, clientY: 160 });
    // 收拢后 Cloudflare 在 slot 1 (300..560)
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 430, clientY: 160 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 430, clientY: 160 });

    expect(onReorderSpy).toHaveBeenCalledTimes(1);
    const reordered = onReorderSpy.mock.calls[0][0] as OTPAccount[];
    expect(reordered.map((a) => a.issuer)).toEqual(["Cloudflare", "Google", "GitHub"]);
    expect(localStorage.getItem("2fa-sort-mode")).toBe("custom");
    expect((screen.getByLabelText("排序字段") as HTMLSelectElement).value).toBe("custom");

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // 保持原有勾选状态，方便继续操作
    expect(screen.getByText("已选 2")).toBeInTheDocument();
    expect(screen.getByLabelText("选择账户 Google")).toBeChecked();
    expect(screen.getByLabelText("选择账户 GitHub")).toBeChecked();
    expect(screen.getByLabelText("选择账户 Cloudflare")).not.toBeChecked();
  });
});
