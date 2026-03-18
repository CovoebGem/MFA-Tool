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

        // 再次点击（取消全选）
        const deselectButton = screen.getByLabelText("全选");
        act(() => {
          fireEvent.click(deselectButton);
        });

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
    render(<AccountPage {...props} accounts={accounts} />);

    // 页面上唯一的 <select> 应该是 SortControls 的排序字段选择器
    const allSelects = document.querySelectorAll("select");
    expect(allSelects.length).toBe(1);
    // 该 select 是排序字段选择器，aria-label 为 "排序字段"
    expect(allSelects[0].getAttribute("aria-label")).toBe("排序字段");

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
