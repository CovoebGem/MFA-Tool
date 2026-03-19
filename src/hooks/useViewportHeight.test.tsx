import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useViewportHeight } from "./useViewportHeight";

function ViewportProbe() {
  const viewportHeight = useViewportHeight();

  return <div data-testid="viewport-height">{viewportHeight}</div>;
}

describe("useViewportHeight", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      return window.setTimeout(() => callback(performance.now()), 16);
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      window.clearTimeout(id);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("updates when the window height changes", () => {
    const originalHeight = window.innerHeight;

    render(<ViewportProbe />);
    expect(screen.getByTestId("viewport-height")).toHaveTextContent(`${originalHeight}px`);

    act(() => {
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        writable: true,
        value: 900,
      });
      window.dispatchEvent(new Event("resize"));
      vi.advanceTimersByTime(16);
    });

    expect(screen.getByTestId("viewport-height")).toHaveTextContent("900px");

    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: originalHeight,
    });
  });
});
