import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import Toast from "../Toast";

describe("Toast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders message text correctly", () => {
    const onClose = vi.fn();
    render(<Toast message="账户添加成功" type="success" onClose={onClose} />);
    expect(screen.getByText("账户添加成功")).toBeInTheDocument();
  });

  it("auto-dismisses after 3 seconds", () => {
    const onClose = vi.fn();
    render(<Toast message="test" type="success" onClose={onClose} />);

    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not auto-dismiss before 3 seconds", () => {
    const onClose = vi.fn();
    render(<Toast message="test" type="success" onClose={onClose} />);

    act(() => {
      vi.advanceTimersByTime(2999);
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("manual close button triggers onClose", () => {
    const onClose = vi.fn();
    render(<Toast message="test" type="success" onClose={onClose} />);

    const closeButton = screen.getByRole("button", { name: "关闭通知" });
    fireEvent.click(closeButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("success type has success semantic theme classes", () => {
    const onClose = vi.fn();
    render(<Toast message="success msg" type="success" onClose={onClose} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("data-toast-type", "success");
    expect(alert.className).toContain("bg-success-surface");
    expect(alert.className).toContain("border-success/30");
    expect(alert.className).toContain("text-success-foreground");
  });

  it("error type has destructive semantic theme classes", () => {
    const onClose = vi.fn();
    render(<Toast message="error msg" type="error" onClose={onClose} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("data-toast-type", "error");
    expect(alert.className).toContain("bg-destructive-surface");
    expect(alert.className).toContain("border-destructive/30");
    expect(alert.className).toContain("text-destructive-foreground");
  });

  it('has role="alert" for accessibility', () => {
    const onClose = vi.fn();
    render(<Toast message="accessible" type="success" onClose={onClose} />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("clears timer on unmount", () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <Toast message="test" type="success" onClose={onClose} />
    );

    unmount();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // onClose should not be called after unmount since timer is cleared
    expect(onClose).not.toHaveBeenCalled();
  });
});
