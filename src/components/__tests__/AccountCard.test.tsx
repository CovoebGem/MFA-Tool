import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import AccountCard from "../AccountCard";
import type { OTPAccount } from "../../types";

vi.mock("../../hooks/useTOTP", () => ({
  useTOTP: () => ({ code: "123456", remaining: 25 }),
}));

const account: OTPAccount = {
  id: "acc-1",
  issuer: "GitHub",
  name: "user@example.com",
  secret: "JBSWY3DPEHPK3PXP",
  type: "totp",
  counter: 0,
  algorithm: "SHA1",
  digits: 6,
  period: 30,
  createdAt: 1,
  groupId: "default",
};

describe("AccountCard", () => {
  beforeEach(() => {
    cleanup();
  });

  it("renders the provider icon based on issuer", () => {
    render(<AccountCard account={account} onDelete={vi.fn()} />);

    expect(screen.getByRole("img", { name: "GitHub" })).toHaveAttribute(
      "src",
      "https://github.com/favicon.ico",
    );
  });

  it("does not render a per-card pin button, preserves data-pinned state, and displays remark when present", () => {
    const { container, rerender } = render(
      <AccountCard account={account} onDelete={vi.fn()} />,
    );

    const card = container.querySelector('[data-slot="card"]');
    expect(card).toHaveAttribute("data-pinned", "false");
    expect(screen.queryByRole("button", { name: /置顶/ })).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="account-remark"]')).not.toBeInTheDocument();

    rerender(
      <AccountCard
        account={{ ...account, pinned: true, pinnedAt: 100, remark: "主力研发账号" }}
        onDelete={vi.fn()}
      />,
    );

    expect(card).toHaveAttribute("data-pinned", "true");
    expect(screen.queryByRole("button", { name: /置顶/ })).not.toBeInTheDocument();
    expect(screen.getByText("主力研发账号")).toBeInTheDocument();
  });
});
