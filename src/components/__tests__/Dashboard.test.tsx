import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Dashboard from "../Dashboard";
import type { OTPAccount, Group } from "../../types";

function makeAccount(overrides: Partial<OTPAccount> = {}): OTPAccount {
  return {
    id: crypto.randomUUID(),
    issuer: "GitHub",
    name: "user@example.com",
    secret: "JBSWY3DPEHPK3PXP",
    type: "totp",
    counter: 0,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    createdAt: Date.now(),
    groupId: "default",
    ...overrides,
  };
}

function makeGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: crypto.randomUUID(),
    name: "Default",
    isDefault: true,
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("Dashboard", () => {
  it("shows empty guidance when no accounts", () => {
    render(<Dashboard accounts={[]} groups={[]} />);
    expect(screen.getByText("还没有任何账户")).toBeInTheDocument();
    expect(screen.getByText(/添加你的第一个/)).toBeInTheDocument();
  });

  it("renders three stat cards when accounts exist", () => {
    const accounts = [makeAccount()];
    const groups = [makeGroup()];
    render(<Dashboard accounts={accounts} groups={groups} />);

    expect(screen.getByText("账户总数")).toBeInTheDocument();
    expect(screen.getByText("分组总数")).toBeInTheDocument();
    expect(screen.getByText("近 7 天新增")).toBeInTheDocument();
  });

  it("displays correct stat values", () => {
    const accounts = [makeAccount(), makeAccount()];
    const groups = [makeGroup(), makeGroup({ isDefault: false, name: "Work" })];
    render(<Dashboard accounts={accounts} groups={groups} />);

    // 账户总数 = 2, 分组总数 = 2, 近 7 天新增 = 2 (both created now)
    const values = screen.getAllByText("2");
    expect(values.length).toBe(3);
  });

  it("shows 0 for recent count when accounts are old", () => {
    const oldDate = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days ago
    const accounts = [makeAccount({ createdAt: oldDate })];
    const groups = [makeGroup()];
    render(<Dashboard accounts={accounts} groups={groups} />);

    expect(screen.getByText("账户总数")).toBeInTheDocument();
    // totalAccounts = 1, totalGroups = 1, recentCount = 0
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("does not show stat cards when totalAccounts is 0", () => {
    render(<Dashboard accounts={[]} groups={[makeGroup()]} />);
    expect(screen.queryByText("账户总数")).not.toBeInTheDocument();
    expect(screen.getByText("还没有任何账户")).toBeInTheDocument();
  });
});
