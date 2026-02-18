import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import RecentAccounts from "../RecentAccounts";
import type { OTPAccount } from "../../types";

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

describe("RecentAccounts", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2025-01-15T12:00:00Z") });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null when accounts list is empty", () => {
    const { container } = render(<RecentAccounts accounts={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders issuer, name, and relative time for each account", () => {
    const now = Date.now();
    const accounts = [
      makeAccount({ issuer: "Google", name: "alice@gmail.com", createdAt: now - 30 * 1000 }),
      makeAccount({ issuer: "GitHub", name: "bob@github.com", createdAt: now - 5 * 60 * 1000 }),
    ];

    render(<RecentAccounts accounts={accounts} />);

    expect(screen.getByText("Google")).toBeInTheDocument();
    expect(screen.getByText("alice@gmail.com")).toBeInTheDocument();
    expect(screen.getByText("刚刚")).toBeInTheDocument();

    expect(screen.getByText("GitHub")).toBeInTheDocument();
    expect(screen.getByText("bob@github.com")).toBeInTheDocument();
    expect(screen.getByText("5 分钟前")).toBeInTheDocument();
  });

  it("shows at most 5 accounts", () => {
    const now = Date.now();
    const accounts = Array.from({ length: 8 }, (_, i) =>
      makeAccount({ issuer: `Service${i}`, name: `user${i}@test.com`, createdAt: now - i * 60000 })
    );

    render(<RecentAccounts accounts={accounts} />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(5);
  });

  it("displays hours relative time correctly", () => {
    const now = Date.now();
    const accounts = [
      makeAccount({ issuer: "Slack", name: "dev@slack.com", createdAt: now - 2 * 60 * 60 * 1000 }),
    ];

    render(<RecentAccounts accounts={accounts} />);
    expect(screen.getByText("2 小时前")).toBeInTheDocument();
  });

  it("displays days relative time correctly", () => {
    const now = Date.now();
    const accounts = [
      makeAccount({ issuer: "AWS", name: "admin@aws.com", createdAt: now - 3 * 24 * 60 * 60 * 1000 }),
    ];

    render(<RecentAccounts accounts={accounts} />);
    expect(screen.getByText("3 天前")).toBeInTheDocument();
  });

  it("renders section heading", () => {
    const accounts = [makeAccount()];
    render(<RecentAccounts accounts={accounts} />);
    expect(screen.getByText("最近添加")).toBeInTheDocument();
  });
});
