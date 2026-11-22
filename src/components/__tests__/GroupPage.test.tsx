import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import GroupPage from "../GroupPage";
import type { Group, OTPAccount } from "../../types";

// Mock useTOTP hook used by AccountCard
vi.mock("../../hooks/useTOTP", () => ({
  useTOTP: () => ({ code: "123456", remaining: 25 }),
}));

const mockGroups: Group[] = [
  { id: "g1", name: "默认分组", isDefault: true, createdAt: 1000 },
  { id: "g2", name: "工作", isDefault: false, createdAt: 2000 },
  { id: "g3", name: "个人", isDefault: false, createdAt: 3000 },
];

const mockAccounts: OTPAccount[] = [
  {
    id: "a1", issuer: "GitHub", name: "dev@test.com", secret: "JBSWY3DPEHPK3PXP",
    type: "totp", counter: 0, algorithm: "SHA1", digits: 6, period: 30,
    createdAt: 1000, groupId: "g1",
  },
  {
    id: "a2", issuer: "Google", name: "user@test.com", secret: "JBSWY3DPEHPK3PXP",
    type: "totp", counter: 0, algorithm: "SHA1", digits: 6, period: 30,
    createdAt: 2000, groupId: "g1",
  },
  {
    id: "a3", issuer: "AWS", name: "admin@test.com", secret: "JBSWY3DPEHPK3PXP",
    type: "totp", counter: 0, algorithm: "SHA1", digits: 6, period: 30,
    createdAt: 3000, groupId: "g2",
  },
];

const defaultProps = {
  groups: mockGroups,
  accounts: mockAccounts,
  onCreateGroup: vi.fn(),
  onRenameGroup: vi.fn(),
  onDeleteGroup: vi.fn(),
  onDeleteAccount: vi.fn(),
};

describe("GroupPage", () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe("布局结构", () => {
    it("渲染标题、下拉选择器和管理按钮", () => {
      render(<GroupPage {...defaultProps} />);
      expect(screen.getByText("分组管理")).toBeTruthy();
      expect(screen.getByLabelText("选择分组")).toBeTruthy();
      expect(screen.getByLabelText("打开分组管理")).toBeTruthy();
    });
  });

  describe("默认选中第一个分组", () => {
    it("页面加载时自动选中第一个分组", () => {
      render(<GroupPage {...defaultProps} />);
      const select = screen.getByLabelText("选择分组") as HTMLSelectElement;
      expect(select.value).toBe("g1");
    });

    it("选中第一个分组后显示其账户卡片", () => {
      render(<GroupPage {...defaultProps} />);
      expect(screen.getByText("GitHub")).toBeTruthy();
      expect(screen.getByText("Google")).toBeTruthy();
    });

    it("无分组时显示空状态", () => {
      render(<GroupPage {...defaultProps} groups={[]} />);
      expect(screen.getByText("暂无分组")).toBeTruthy();
    });
  });

  describe("分组切换", () => {
    it("切换分组后显示对应账户", () => {
      render(<GroupPage {...defaultProps} />);
      const select = screen.getByLabelText("选择分组") as HTMLSelectElement;
      fireEvent.change(select, { target: { value: "g2" } });
      expect(screen.getByText("AWS")).toBeTruthy();
    });

    it("选中空分组时显示空状态提示", () => {
      render(<GroupPage {...defaultProps} />);
      const select = screen.getByLabelText("选择分组") as HTMLSelectElement;
      fireEvent.change(select, { target: { value: "g3" } });
      expect(screen.getByText("该分组下暂无账户")).toBeTruthy();
    });
  });

  describe("分组管理面板", () => {
    const openPanel = () => {
      fireEvent.click(screen.getByLabelText("打开分组管理"));
    };

    it("点击管理按钮打开面板", () => {
      render(<GroupPage {...defaultProps} />);
      openPanel();
      // 面板中应该有分组管理标题（面板内的）
      expect(screen.getByLabelText("关闭")).toBeTruthy();
      expect(screen.getByText("新建分组")).toBeTruthy();
    });

    it("面板中显示所有分组", () => {
      render(<GroupPage {...defaultProps} />);
      openPanel();
      expect(screen.getByText("默认分组")).toBeTruthy();
      expect(screen.getByText("工作")).toBeTruthy();
      expect(screen.getByText("个人")).toBeTruthy();
    });

    it("点击关闭按钮关闭面板", () => {
      render(<GroupPage {...defaultProps} />);
      openPanel();
      fireEvent.click(screen.getByLabelText("关闭"));
      expect(screen.queryByText("新建分组")).toBeNull();
    });

    it("创建分组", () => {
      const onCreateGroup = vi.fn();
      render(<GroupPage {...defaultProps} onCreateGroup={onCreateGroup} />);
      openPanel();
      fireEvent.click(screen.getByText("新建分组"));
      const input = screen.getByLabelText("新分组名称") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "测试分组" } });
      fireEvent.click(screen.getByText("创建"));
      expect(onCreateGroup).toHaveBeenCalledWith("测试分组");
    });

    it("空名称创建时显示错误", () => {
      render(<GroupPage {...defaultProps} />);
      openPanel();
      fireEvent.click(screen.getByText("新建分组"));
      fireEvent.click(screen.getByText("创建"));
      expect(screen.getByRole("alert").textContent).toBe("分组名称不能为空");
    });

    it("编辑分组名称", () => {
      const onRenameGroup = vi.fn();
      render(<GroupPage {...defaultProps} onRenameGroup={onRenameGroup} />);
      openPanel();
      fireEvent.click(screen.getByLabelText("编辑分组 默认分组"));
      const input = screen.getByLabelText("编辑分组名称") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "新名称" } });
      fireEvent.click(screen.getByLabelText("确认重命名"));
      expect(onRenameGroup).toHaveBeenCalledWith("g1", "新名称");
    });

    it("空名称重命名时显示错误", () => {
      render(<GroupPage {...defaultProps} />);
      openPanel();
      fireEvent.click(screen.getByLabelText("编辑分组 默认分组"));
      const input = screen.getByLabelText("编辑分组名称") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "" } });
      fireEvent.click(screen.getByLabelText("确认重命名"));
      expect(screen.getByRole("alert").textContent).toBe("分组名称不能为空");
    });

    it("默认分组的删除按钮被禁用", () => {
      render(<GroupPage {...defaultProps} />);
      openPanel();
      const deleteBtn = screen.getByLabelText("默认分组不可删除");
      expect((deleteBtn as HTMLButtonElement).disabled).toBe(true);
    });

    it("非默认分组可以删除（两次点击确认）", () => {
      const onDeleteGroup = vi.fn();
      render(<GroupPage {...defaultProps} onDeleteGroup={onDeleteGroup} />);
      openPanel();
      const deleteBtn = screen.getByLabelText("删除分组 工作");
      fireEvent.click(deleteBtn); // 第一次：进入确认
      fireEvent.click(screen.getByLabelText("确认删除分组 工作")); // 第二次：确认
      expect(onDeleteGroup).toHaveBeenCalledWith("g2");
    });
  });

  describe("分组内搜索与跨组引导", () => {
    it("支持在当前分组内过滤账户并在无结果时提供前往全部账户查看引导", () => {
      const onSearchInAllAccounts = vi.fn();
      render(<GroupPage {...defaultProps} onSearchInAllAccounts={onSearchInAllAccounts} />);

      const searchInput = screen.getByRole("searchbox", { name: "搜索账户" });
      fireEvent.change(searchInput, { target: { value: "GitHub" } });
      expect(screen.getByText("GitHub")).toBeInTheDocument();
      expect(screen.queryByText("Google")).not.toBeInTheDocument();

      // 搜索其他分组中才有的 AWS
      fireEvent.change(searchInput, { target: { value: "AWS" } });
      expect(screen.getByText("未找到匹配「AWS」的账户")).toBeInTheDocument();

      const jumpButton = screen.getByRole("button", { name: "在全部账户中查看 1 个结果" });
      fireEvent.click(jumpButton);
      expect(onSearchInAllAccounts).toHaveBeenCalledWith("AWS");
    });
  });

  describe("分组内置顶排序、删除分组与视图切换", () => {
    it("分组内与切换不同归属分组均展示置顶分层、支持列表视图且不显示卡片置顶按钮", () => {
      const accountsWithPin: OTPAccount[] = [
        { ...mockAccounts[0], pinned: false, remark: "研发日常" },
        { ...mockAccounts[1], pinned: true, pinnedAt: 999 },
        { ...mockAccounts[2], pinned: true, pinnedAt: 888 },
      ];

      render(
        <GroupPage
          {...defaultProps}
          accounts={accountsWithPin}
        />,
      );

      expect(
        document.querySelectorAll('[data-slot="card"] button[aria-label*="置顶"]'),
      ).toHaveLength(0);
      const pinnedSection = screen.getByRole("region", { name: "已置顶" });
      const otherSection = screen.getByRole("region", { name: "其他账户" });
      expect(pinnedSection).toHaveTextContent("Google");
      expect(otherSection).toHaveTextContent("GitHub");
      expect(otherSection).toHaveTextContent("研发日常");

      // 切换到列表视图时同样保持分组内置顶分层并显示备注
      fireEvent.click(screen.getByRole("button", { name: "列表视图" }));
      expect(screen.getByRole("region", { name: "已置顶" })).toHaveTextContent("Google");
      expect(screen.getByRole("region", { name: "其他账户" })).toHaveTextContent("研发日常");
      expect(
        document.querySelectorAll('[data-slot="account-row"] button[aria-label*="置顶"]'),
      ).toHaveLength(0);

      // 切换到另一个包含已置顶账户的分组也显示为置顶分层
      fireEvent.click(screen.getByRole("button", { name: "网格视图" }));
      const select = screen.getByLabelText("选择分组") as HTMLSelectElement;
      fireEvent.change(select, { target: { value: "g2" } });
      expect(screen.getByRole("region", { name: "已置顶" })).toHaveTextContent("AWS");
    });

    it("默认分组禁用删除当前分组按钮，非默认分组删除前提示账户将移入默认分组并触发回调", async () => {
      const onDeleteGroup = vi.fn().mockResolvedValue(undefined);
      render(<GroupPage {...defaultProps} onDeleteGroup={onDeleteGroup} />);

      // 默认选中 g1 (默认分组)
      const deleteGroupBtn = screen.getByRole("button", { name: "删除当前分组" });
      expect(deleteGroupBtn).toBeDisabled();

      // 切换到 g2 ("工作"，内有 1 个账户 AWS)
      fireEvent.change(screen.getByLabelText("选择分组"), { target: { value: "g2" } });
      expect(deleteGroupBtn).toBeEnabled();

      fireEvent.click(deleteGroupBtn);
      const dialog = screen.getByRole("dialog", { name: "确认删除分组" });
      expect(dialog).toHaveTextContent("工作");
      expect(dialog).toHaveTextContent("1 个账户将自动移入「默认分组」分组，不会丢失");

      fireEvent.click(screen.getByRole("button", { name: "确认删除" }));
      expect(onDeleteGroup).toHaveBeenCalledWith("g2");
    });

    it("支持切换网格视图与列表视图", () => {
      render(<GroupPage {...defaultProps} />);

      const listBtn = screen.getByRole("button", { name: "列表视图" });
      fireEvent.click(listBtn);

      expect(listBtn).toHaveAttribute("aria-pressed", "true");
      expect(localStorage.getItem("2fa-view-mode")).toBe("list");
      expect(document.querySelector('[data-slot="account-list"]')).toBeInTheDocument();
      expect(document.querySelectorAll('[data-slot="account-row"]')).toHaveLength(2);
    });
  });

  describe("分组内批量选择与工具栏操作", () => {
    it("支持网格和列表视图勾选、全选、批量置顶/取消置顶、批量移动分组与批量删除", async () => {
      const onBatchSetPinned = vi.fn().mockResolvedValue(undefined);
      const onBatchMoveToGroup = vi.fn().mockResolvedValue(undefined);
      const onBatchDelete = vi.fn().mockResolvedValue(undefined);
      const onRefresh = vi.fn().mockResolvedValue(undefined);
      const onSelectedIdsChange = vi.fn();

      const accounts: OTPAccount[] = [
        { ...mockAccounts[0], pinned: false },
        { ...mockAccounts[1], pinned: true, pinnedAt: 500 },
        { ...mockAccounts[2], pinned: false },
      ];

      render(
        <GroupPage
          {...defaultProps}
          accounts={accounts}
          onBatchSetPinned={onBatchSetPinned}
          onBatchMoveToGroup={onBatchMoveToGroup}
          onBatchDelete={onBatchDelete}
          onRefresh={onRefresh}
          onSelectedIdsChange={onSelectedIdsChange}
        />,
      );

      // 当前默认选中 g1，包含 GitHub (a1) 与 Google (a2)
      const githubCheckbox = screen.getByLabelText("选择账户 GitHub");
      fireEvent.click(githubCheckbox);
      expect(screen.getByText("已选 1")).toBeInTheDocument();

      // 批量置顶选中项
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "置顶" }));
        await Promise.resolve();
      });
      expect(onBatchSetPinned).toHaveBeenCalledWith(["a1"], true);
      expect(screen.queryByText(/已选 \d+/)).not.toBeInTheDocument();

      // 选中已置顶账户 Google 后按钮切换为取消置顶
      fireEvent.click(screen.getByLabelText("选择账户 Google"));
      expect(screen.getByText("已选 1")).toBeInTheDocument();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "取消置顶" }));
        await Promise.resolve();
      });
      expect(onBatchSetPinned).toHaveBeenLastCalledWith(["a2"], false);

      // 切换到列表视图后点击全选并批量移动到目标分组
      fireEvent.click(screen.getByRole("button", { name: "列表视图" }));
      fireEvent.click(screen.getByRole("button", { name: "全选" }));
      expect(screen.getByText("已选 2")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "移动到分组" }));
      expect(screen.getByRole("menu", { name: "选择目标分组" })).toBeInTheDocument();
      await act(async () => {
        fireEvent.click(screen.getByRole("menuitem", { name: "工作" }));
        await Promise.resolve();
      });
      expect(onBatchMoveToGroup).toHaveBeenCalledWith(expect.arrayContaining(["a1", "a2"]), "g2");
      expect(screen.queryByText(/已选 \d+/)).not.toBeInTheDocument();

      // 再次全选并批量删除
      fireEvent.click(screen.getByRole("button", { name: "全选" }));
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
      try {
        await act(async () => {
          fireEvent.click(screen.getByRole("button", { name: "删除" }));
          await Promise.resolve();
        });
      } finally {
        confirmSpy.mockRestore();
      }
      expect(onBatchDelete).toHaveBeenCalledWith(expect.arrayContaining(["a1", "a2"]));
      expect(screen.queryByText(/已选 \d+/)).not.toBeInTheDocument();

      // 刷新按钮可正常触发
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "刷新" }));
        await Promise.resolve();
      });
      expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it("切换分组或改变搜索条件清空选中，批量操作失败时保留选中", async () => {
      const onBatchMoveToGroup = vi.fn().mockRejectedValue(new Error("move failed"));

      render(
        <GroupPage
          {...defaultProps}
          onBatchMoveToGroup={onBatchMoveToGroup}
        />,
      );

      // 选中 GitHub 后尝试批量移动并失败 -> 应保留选中状态
      fireEvent.click(screen.getByLabelText("选择账户 GitHub"));
      expect(screen.getByText("已选 1")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "移动到分组" }));
      await act(async () => {
        fireEvent.click(screen.getByRole("menuitem", { name: "工作" }));
        await Promise.resolve();
      });
      expect(screen.getByText("已选 1")).toBeInTheDocument();

      // 改变搜索词会清空选中
      fireEvent.change(screen.getByRole("searchbox", { name: "搜索账户" }), {
        target: { value: "Google" },
      });
      expect(screen.queryByText(/已选 \d+/)).not.toBeInTheDocument();

      // 清空搜索并再次选中 Google，随后切换分组 -> 选中被清空
      fireEvent.change(screen.getByRole("searchbox", { name: "搜索账户" }), {
        target: { value: "" },
      });
      fireEvent.click(screen.getByLabelText("选择账户 Google"));
      expect(screen.getByText("已选 1")).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText("选择分组"), { target: { value: "g2" } });
      expect(screen.queryByText(/已选 \d+/)).not.toBeInTheDocument();
    });

    it("支持受控 selectedIds 与 onSelectedIdsChange 回调", () => {
      const onSelectedIdsChange = vi.fn();

      const { rerender } = render(
        <GroupPage
          {...defaultProps}
          selectedIds={new Set(["a1"])}
          onSelectedIdsChange={onSelectedIdsChange}
        />,
      );

      expect(screen.getByText("已选 1")).toBeInTheDocument();
      expect(screen.getByLabelText("选择账户 GitHub")).toBeChecked();

      fireEvent.click(screen.getByLabelText("选择账户 Google"));
      expect(onSelectedIdsChange).toHaveBeenCalledWith(new Set(["a1", "a2"]));

      rerender(
        <GroupPage
          {...defaultProps}
          selectedIds={new Set(["a1", "a2"])}
          onSelectedIdsChange={onSelectedIdsChange}
        />,
      );
      expect(screen.getByText("已选 2")).toBeInTheDocument();
    });

    it("支持在网格视图和列表视图中通过左键拖拽框选跨置顶区块的账户", async () => {
      const accounts: OTPAccount[] = [
        { ...mockAccounts[0], pinned: false },
        { ...mockAccounts[1], pinned: true, pinnedAt: 500 },
        mockAccounts[2],
      ];

      const { container } = render(
        <GroupPage {...defaultProps} accounts={accounts} />,
      );

      const rectHelper = (left: number, top: number, width: number, height: number) =>
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

      const cardA2 = container.querySelector('[data-selectable-id="a2"]') as HTMLElement;
      const cardA1 = container.querySelector('[data-selectable-id="a1"]') as HTMLElement;
      cardA2.getBoundingClientRect = () => rectHelper(20, 140, 260, 120);
      cardA1.getBoundingClientRect = () => rectHelper(20, 320, 260, 120);

      const pageRoot = container.firstElementChild as HTMLElement;
      fireEvent.mouseDown(pageRoot, { button: 0, clientX: 5, clientY: 130 });
      fireEvent.mouseMove(window, { clientX: 290, clientY: 450 });
      fireEvent.mouseUp(window, { clientX: 290, clientY: 450 });

      expect(screen.getByText("已选 2")).toBeInTheDocument();
      expect(screen.getByLabelText("选择账户 Google")).toBeChecked();
      expect(screen.getByLabelText("选择账户 GitHub")).toBeChecked();

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      // 切换列表视图并清空选中后，同样支持拖拽框选列表行
      fireEvent.click(screen.getByRole("button", { name: "取消选择" }));
      expect(screen.queryByText(/已选 \d+/)).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "列表视图" }));

      const rowA2 = container.querySelector('[data-selectable-id="a2"]') as HTMLElement;
      const rowA1 = container.querySelector('[data-selectable-id="a1"]') as HTMLElement;
      rowA2.getBoundingClientRect = () => rectHelper(20, 150, 700, 48);
      rowA1.getBoundingClientRect = () => rectHelper(20, 230, 700, 48);

      fireEvent.mouseDown(pageRoot, { button: 0, clientX: 10, clientY: 140 });
      fireEvent.mouseMove(window, { clientX: 300, clientY: 205 });
      fireEvent.mouseUp(window, { clientX: 300, clientY: 205 });

      expect(screen.getByText("已选 1")).toBeInTheDocument();
      expect(screen.getByLabelText("选择账户 Google")).toBeChecked();
      expect(screen.getByLabelText("选择账户 GitHub")).not.toBeChecked();
    });

    it("支持通过卡片布局设置自定义卡片大小和间距并持久化", () => {
      render(<GroupPage {...defaultProps} />);

      fireEvent.click(screen.getByRole("button", { name: "卡片布局设置" }));
      fireEvent.change(screen.getByLabelText("卡片大小"), { target: { value: "270" } });
      fireEvent.change(screen.getByLabelText("卡片间距"), { target: { value: "22" } });

      const grid = screen.getByText("GitHub").closest(".grid") as HTMLElement;
      expect(grid).toHaveAttribute("data-card-scale", "compact");
      expect(grid.style.gridTemplateColumns).toBe("repeat(auto-fill, minmax(270px, 1fr))");
      expect(grid.style.gap).toBe("22px");
      expect(JSON.parse(localStorage.getItem("2fa-card-layout") ?? "{}")).toEqual({
        cardMinWidth: 270,
        cardGap: 22,
      });

      fireEvent.click(screen.getByRole("button", { name: "恢复默认" }));
      expect(grid).toHaveAttribute("data-card-scale", "normal");
      expect(grid.style.gridTemplateColumns).toBe("repeat(auto-fill, minmax(310px, 1fr))");
      expect(grid.style.gap).toBe("14px");
    });
  });
});
