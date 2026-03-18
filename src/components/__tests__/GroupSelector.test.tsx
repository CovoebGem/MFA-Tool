import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import GroupSelector from "../GroupSelector";
import type { Group, OTPAccount } from "../../types";

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

describe("GroupSelector", () => {
  beforeEach(() => {
    cleanup();
  });

  it("渲染所有分组选项", () => {
    render(
      <GroupSelector groups={mockGroups} selectedGroupId={null} onSelect={vi.fn()} />
    );

    const select = screen.getByLabelText("选择分组") as HTMLSelectElement;
    // 3 个分组 + 1 个 placeholder
    expect(select.options.length).toBe(4);
    expect(select.options[1].textContent).toBe("默认分组");
    expect(select.options[2].textContent).toBe("工作");
    expect(select.options[3].textContent).toBe("个人");
  });

  it("传入 accounts 时显示账户数量", () => {
    render(
      <GroupSelector
        groups={mockGroups}
        selectedGroupId="g1"
        onSelect={vi.fn()}
        accounts={mockAccounts}
      />
    );

    const select = screen.getByLabelText("选择分组") as HTMLSelectElement;
    expect(select.options[1].textContent).toBe("默认分组 (2)");
    expect(select.options[2].textContent).toBe("工作 (1)");
    expect(select.options[3].textContent).toBe("个人 (0)");
  });

  it("不传 accounts 时仅显示分组名称", () => {
    render(
      <GroupSelector groups={mockGroups} selectedGroupId="g1" onSelect={vi.fn()} />
    );

    const select = screen.getByLabelText("选择分组") as HTMLSelectElement;
    expect(select.options[1].textContent).toBe("默认分组");
    expect(select.options[2].textContent).toBe("工作");
  });

  it("正确选中指定的分组", () => {
    render(
      <GroupSelector groups={mockGroups} selectedGroupId="g2" onSelect={vi.fn()} />
    );

    const select = screen.getByLabelText("选择分组") as HTMLSelectElement;
    expect(select.value).toBe("g2");
  });

  it("选择分组时调用 onSelect 回调", () => {
    const onSelect = vi.fn();
    render(
      <GroupSelector groups={mockGroups} selectedGroupId="g1" onSelect={onSelect} />
    );

    const select = screen.getByLabelText("选择分组") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "g3" } });
    expect(onSelect).toHaveBeenCalledWith("g3");
  });

  it("selectedGroupId 为 null 时显示 placeholder", () => {
    render(
      <GroupSelector groups={mockGroups} selectedGroupId={null} onSelect={vi.fn()} />
    );

    const select = screen.getByLabelText("选择分组") as HTMLSelectElement;
    expect(select.value).toBe("");
  });

  it("空分组列表时仅显示 placeholder", () => {
    render(
      <GroupSelector groups={[]} selectedGroupId={null} onSelect={vi.fn()} />
    );

    const select = screen.getByLabelText("选择分组") as HTMLSelectElement;
    expect(select.options.length).toBe(1);
    expect(select.options[0].textContent).toBe("选择分组");
  });
});
