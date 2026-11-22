import { useRef, useState } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import {
  normalizeRect,
  rectsIntersect,
  shouldIgnoreMarqueeTarget,
  useMarqueeSelection,
} from "./useMarqueeSelection";

function makeDOMRect(
  left: number,
  top: number,
  width: number,
  height: number,
): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect;
}

interface HarnessProps {
  enabled?: boolean;
  initialSelected?: string[];
  visibleIds?: string[];
  onSelectionChangeSpy?: (next: Set<string>) => void;
  onButtonClick?: () => void;
}

function MarqueeHarness({
  enabled = true,
  initialSelected = [],
  visibleIds = ["a1", "a2", "a3"],
  onSelectionChangeSpy,
  onButtonClick,
}: HarnessProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(initialSelected),
  );
  const visibleIdSet = new Set(visibleIds);

  const handleChange = (next: Set<string>) => {
    setSelectedIds(next);
    onSelectionChangeSpy?.(next);
  };

  const { overlayRef, handleMouseDown } = useMarqueeSelection({
    containerRef,
    enabled,
    selectedIds,
    visibleIdSet,
    onSelectionChange: handleChange,
  });

  return (
    <div>
      <div
        ref={containerRef}
        data-testid="marquee-container"
        onMouseDown={handleMouseDown}
      >
        <div data-no-marquee="true" data-testid="no-marquee-bar">
          <button type="button" onClick={onButtonClick}>
            工具按钮
          </button>
          <input aria-label="输入框" />
        </div>
        {visibleIds.map((id) => (
          <div key={id} data-selectable-id={id} data-testid={`item-${id}`}>
            <span>{id}</span>
            <button type="button" onClick={onButtonClick}>
              卡片按钮 {id}
            </button>
          </div>
        ))}
        <div ref={overlayRef} data-testid="overlay-proxy" />
      </div>
      <div data-testid="selected-output">{Array.from(selectedIds).join(",")}</div>
    </div>
  );
}

describe("useMarqueeSelection helpers", () => {
  beforeEach(() => {
    cleanup();
  });

  it("normalizeRect handles reverse drag coordinates", () => {
    expect(normalizeRect(100, 200, 40, 80)).toEqual({
      left: 40,
      top: 80,
      right: 100,
      bottom: 200,
    });
  });

  it("rectsIntersect detects overlap and excludes touching edges", () => {
    const base = { left: 10, top: 10, right: 50, bottom: 50 };
    expect(rectsIntersect(base, { left: 20, top: 20, right: 60, bottom: 60 })).toBe(true);
    expect(rectsIntersect(base, { left: 50, top: 10, right: 90, bottom: 50 })).toBe(false);
    expect(rectsIntersect(base, { left: 60, top: 60, right: 90, bottom: 90 })).toBe(false);
  });

  it("shouldIgnoreMarqueeTarget rejects interactive controls, data-no-marquee, and active dialogs", () => {
    render(
      <div>
        <div data-testid="plain-area">
          <span data-testid="plain-child">text</span>
        </div>
        <div data-no-marquee="true">
          <span data-testid="no-marquee-child">toolbar</span>
        </div>
        <button type="button" data-testid="btn">
          btn
        </button>
        <input data-testid="input" />
      </div>,
    );

    expect(shouldIgnoreMarqueeTarget(null)).toBe(true);
    expect(shouldIgnoreMarqueeTarget(screen.getByTestId("plain-area"))).toBe(false);
    expect(shouldIgnoreMarqueeTarget(screen.getByTestId("plain-child"))).toBe(false);
    expect(shouldIgnoreMarqueeTarget(screen.getByTestId("no-marquee-child"))).toBe(true);
    expect(shouldIgnoreMarqueeTarget(screen.getByTestId("btn"))).toBe(true);
    expect(shouldIgnoreMarqueeTarget(screen.getByTestId("input"))).toBe(true);

    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.appendChild(dialog);
    try {
      expect(shouldIgnoreMarqueeTarget(screen.getByTestId("plain-area"))).toBe(true);
    } finally {
      document.body.removeChild(dialog);
    }
  });
});

describe("useMarqueeSelection hook", () => {
  let prevScrollX: number;
  let prevScrollY: number;

  beforeEach(() => {
    cleanup();
    prevScrollX = window.scrollX;
    prevScrollY = window.scrollY;
    Object.defineProperty(window, "scrollX", { value: 0, configurable: true, writable: true });
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true, writable: true });
    document.body.style.userSelect = "";
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    Object.defineProperty(window, "scrollX", {
      value: prevScrollX,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(window, "scrollY", {
      value: prevScrollY,
      configurable: true,
      writable: true,
    });
    document.body.style.userSelect = "";
  });

  function mockItemRects() {
    screen.getByTestId("item-a1").getBoundingClientRect = () => makeDOMRect(20, 100, 100, 80);
    screen.getByTestId("item-a2").getBoundingClientRect = () => makeDOMRect(150, 100, 100, 80);
    screen.getByTestId("item-a3").getBoundingClientRect = () => makeDOMRect(20, 210, 100, 80);
  }

  it("ignores movements below threshold and does not change selection or activate overlay", () => {
    const spy = vi.fn();
    render(
      <MarqueeHarness initialSelected={["a2"]} onSelectionChangeSpy={spy} />,
    );
    mockItemRects();

    const container = screen.getByTestId("marquee-container");
    const overlay = screen.getByTestId("overlay-proxy");

    fireEvent.mouseDown(container, { button: 0, clientX: 10, clientY: 90 });
    fireEvent.mouseMove(window, { clientX: 12, clientY: 92 });
    fireEvent.mouseUp(window, { clientX: 12, clientY: 92 });

    expect(overlay.dataset.active).toBe("false");
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByTestId("selected-output")).toHaveTextContent("a2");
  });

  it("selects intersecting items live and updates when box shrinks", () => {
    render(<MarqueeHarness initialSelected={["a3"]} />);
    mockItemRects();

    const container = screen.getByTestId("marquee-container");
    const overlay = screen.getByTestId("overlay-proxy");

    fireEvent.mouseDown(container, { button: 0, clientX: 10, clientY: 90 });
    fireEvent.mouseMove(window, { clientX: 200, clientY: 160 });

    expect(overlay.dataset.active).toBe("true");
    expect(overlay.style.display).toBe("block");
    expect(document.body.style.userSelect).toBe("none");
    expect(screen.getByTestId("selected-output")).toHaveTextContent("a1,a2");

    // Shrink box back so only a1 intersects
    fireEvent.mouseMove(window, { clientX: 90, clientY: 160 });
    expect(screen.getByTestId("selected-output")).toHaveTextContent("a1");

    fireEvent.mouseUp(window, { clientX: 90, clientY: 160 });
    expect(overlay.style.display).toBe("none");
    expect(overlay.dataset.active).toBe("false");
    expect(document.body.style.userSelect).toBe("");
    expect(screen.getByTestId("selected-output")).toHaveTextContent("a1");
  });

  it("supports Ctrl/Shift additive selection and Escape cancellation", () => {
    render(<MarqueeHarness initialSelected={["a3"]} />);
    mockItemRects();

    const container = screen.getByTestId("marquee-container");
    const overlay = screen.getByTestId("overlay-proxy");

    // Ctrl additive drag retains a3 and adds a1
    fireEvent.mouseDown(container, {
      button: 0,
      clientX: 10,
      clientY: 90,
      ctrlKey: true,
    });
    fireEvent.mouseMove(window, { clientX: 90, clientY: 160 });
    expect(screen.getByTestId("selected-output").textContent?.split(",").sort()).toEqual([
      "a1",
      "a3",
    ]);

    // Escape cancels drag and restores initialSelected
    fireEvent.keyDown(window, { key: "Escape" });
    expect(overlay.style.display).toBe("none");
    expect(document.body.style.userSelect).toBe("");
    expect(screen.getByTestId("selected-output")).toHaveTextContent("a3");
  });

  it("ignores drag starts on interactive controls and no-marquee containers", () => {
    const spy = vi.fn();
    render(<MarqueeHarness onSelectionChangeSpy={spy} />);
    mockItemRects();

    fireEvent.mouseDown(screen.getByRole("button", { name: "工具按钮" }), {
      button: 0,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.mouseMove(window, { clientX: 200, clientY: 200 });
    fireEvent.mouseUp(window);
    expect(spy).not.toHaveBeenCalled();

    fireEvent.mouseDown(screen.getByTestId("no-marquee-bar"), {
      button: 0,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.mouseMove(window, { clientX: 200, clientY: 200 });
    fireEvent.mouseUp(window);
    expect(spy).not.toHaveBeenCalled();
  });

  it("suppresses trailing click event emitted right after completing a marquee drag", () => {
    const onButtonClick = vi.fn();
    render(<MarqueeHarness onButtonClick={onButtonClick} />);
    mockItemRects();

    const container = screen.getByTestId("marquee-container");
    const cardBtn = screen.getByRole("button", { name: "卡片按钮 a1" });

    fireEvent.mouseDown(container, { button: 0, clientX: 10, clientY: 90 });
    fireEvent.mouseMove(window, { clientX: 90, clientY: 160 });
    fireEvent.mouseUp(window, { clientX: 90, clientY: 160 });

    // Simulated trailing click right after drag end should be swallowed
    fireEvent.click(cardBtn);
    expect(onButtonClick).not.toHaveBeenCalled();

    // After tick cleanup, subsequent normal clicks work
    act(() => {
      vi.runAllTimers();
    });
    fireEvent.click(cardBtn);
    expect(onButtonClick).toHaveBeenCalledTimes(1);
  });

  it("calculates intersections accurately when window is scrolled and aborts cleanly when disabled", () => {
    Object.defineProperty(window, "scrollY", { value: 300, configurable: true, writable: true });

    const { rerender } = render(<MarqueeHarness enabled />);
    // In viewport, item-a1 sits at y = 100..180 while scrollY = 300 -> doc y = 400..480
    mockItemRects();

    const container = screen.getByTestId("marquee-container");
    const overlay = screen.getByTestId("overlay-proxy");

    fireEvent.mouseDown(container, { button: 0, clientX: 10, clientY: 90 });
    fireEvent.mouseMove(window, { clientX: 110, clientY: 160 });

    expect(screen.getByTestId("selected-output")).toHaveTextContent("a1");
    expect(overlay.style.top).toBe("90px");
    expect(overlay.style.height).toBe("70px");
    expect(document.body.style.userSelect).toBe("none");

    // Switching enabled -> false aborts active drag and restores userSelect
    rerender(<MarqueeHarness enabled={false} />);
    expect(overlay.style.display).toBe("none");
    expect(document.body.style.userSelect).toBe("");
  });
});
