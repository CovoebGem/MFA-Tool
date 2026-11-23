import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

  describe("content-visibility 与屏外 IntersectionObserver 控制", () => {
    const originalIntersectionObserver = globalThis.IntersectionObserver;

    afterEach(() => {
      cleanup();
      if (originalIntersectionObserver) {
        globalThis.IntersectionObserver = originalIntersectionObserver;
      } else {
        // @ts-expect-error restore missing IntersectionObserver in jsdom
        delete globalThis.IntersectionObserver;
      }
      vi.resetModules();
    });

    it("showDragHandle 开启且非拖拽中时仍保留 content-visibility 与 IntersectionObserver 观测，拖拽/浮层态则关闭", async () => {
      const observeMock = vi.fn();
      const unobserveMock = vi.fn();

      class MockIntersectionObserver {
        observe = observeMock;
        unobserve = unobserveMock;
        disconnect = vi.fn();
        takeRecords = vi.fn(() => []);
      }

      vi.resetModules();
      globalThis.IntersectionObserver =
        MockIntersectionObserver as unknown as typeof IntersectionObserver;

      const { default: FreshAccountCard } = await import("../AccountCard");
      const { default: FreshAccountListRow } = await import("../AccountListRow");

      // 1. 常规可拖拽卡片（showDragHandle=true）：必须保留 account-card-cv 并观测可见性
      const cardView = render(
        <FreshAccountCard account={account} onDelete={vi.fn()} showDragHandle />,
      );
      const cardEl = cardView.container.querySelector('[data-slot="card"]') as HTMLElement;
      expect(cardEl).toHaveClass("account-card-cv");
      expect(observeMock).toHaveBeenCalledTimes(1);
      expect(observeMock).toHaveBeenLastCalledWith(cardEl);

      // 2. 卡片拖拽占位态（isDragging=true）：移除 account-card-cv
      cardView.rerender(
        <FreshAccountCard account={account} onDelete={vi.fn()} showDragHandle isDragging />,
      );
      expect(cardEl).not.toHaveClass("account-card-cv");

      // 3. 卡片浮起克隆层（isDragOverlay=true）：移除 account-card-cv 且不走 IntersectionObserver
      observeMock.mockClear();
      const cardOverlayView = render(
        <FreshAccountCard
          account={account}
          onDelete={vi.fn()}
          showDragHandle
          isDragOverlay
        />,
      );
      const overlayCardEl = cardOverlayView.container.querySelector('[data-slot="card"]') as HTMLElement;
      expect(overlayCardEl).not.toHaveClass("account-card-cv");
      expect(observeMock).not.toHaveBeenCalled();

      // 4. 列表行在 showDragHandle=true 时同样保留 account-row-cv 并观测可见性
      observeMock.mockClear();
      const rowView = render(
        <FreshAccountListRow account={account} onDelete={vi.fn()} showDragHandle />,
      );
      const rowEl = rowView.container.querySelector('[data-slot="account-row"]') as HTMLElement;
      expect(rowEl).toHaveClass("account-row-cv");
      expect(observeMock).toHaveBeenCalledTimes(1);
      expect(observeMock).toHaveBeenLastCalledWith(rowEl);

      // 5. 列表行拖拽占位 / 浮层态移除 account-row-cv，且浮层不走 IntersectionObserver
      rowView.rerender(
        <FreshAccountListRow account={account} onDelete={vi.fn()} showDragHandle isDragging />,
      );
      expect(rowEl).not.toHaveClass("account-row-cv");

      observeMock.mockClear();
      const rowOverlayView = render(
        <FreshAccountListRow
          account={account}
          onDelete={vi.fn()}
          showDragHandle
          isDragOverlay
        />,
      );
      const overlayRowEl = rowOverlayView.container.querySelector('[data-slot="account-row"]') as HTMLElement;
      expect(overlayRowEl).not.toHaveClass("account-row-cv");
      expect(observeMock).not.toHaveBeenCalled();
    });
  });
});
