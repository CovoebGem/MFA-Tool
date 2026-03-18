import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
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
});
