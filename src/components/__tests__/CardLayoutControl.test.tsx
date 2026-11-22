import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import CardLayoutControl from "../CardLayoutControl";
import {
  CARD_LAYOUT_PRESETS,
  DEFAULT_CARD_LAYOUT_CONFIG,
} from "../../lib/preference-store";

describe("CardLayoutControl", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("opens and closes popover via trigger, outside mousedown, and Escape (restoring focus)", () => {
    render(
      <div>
        <div data-testid="outside">outside</div>
        <CardLayoutControl config={DEFAULT_CARD_LAYOUT_CONFIG} onChange={vi.fn()} />
      </div>,
    );

    const trigger = screen.getByRole("button", { name: "卡片布局设置" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("group", { name: "卡片布局设置" })).toBeInTheDocument();

    // Escape closes and returns focus to trigger
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("group", { name: "卡片布局设置" })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);

    // Reopen and outside mousedown closes
    fireEvent.click(trigger);
    expect(screen.getByRole("group", { name: "卡片布局设置" })).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(screen.queryByRole("group", { name: "卡片布局设置" })).not.toBeInTheDocument();
  });

  it("applies presets, updates sliders, and handles 恢复默认 button", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <CardLayoutControl config={DEFAULT_CARD_LAYOUT_CONFIG} onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "卡片布局设置" }));

    const resetBtn = screen.getByRole("button", { name: "恢复默认" });
    expect(resetBtn).toBeDisabled();
    expect(screen.getByRole("button", { name: "标准" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // Preset click
    fireEvent.click(screen.getByRole("button", { name: "紧凑" }));
    expect(onChange).toHaveBeenLastCalledWith(CARD_LAYOUT_PRESETS.compact);

    // Rerender with compact config
    rerender(
      <CardLayoutControl
        config={CARD_LAYOUT_PRESETS.compact}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("button", { name: "恢复默认" })).toBeEnabled();
    expect(screen.getByText("260px")).toBeInTheDocument();
    expect(screen.getByText("10px")).toBeInTheDocument();

    // Slider changes
    fireEvent.change(screen.getByLabelText("卡片大小"), { target: { value: "400" } });
    expect(onChange).toHaveBeenLastCalledWith({ cardMinWidth: 400, cardGap: 10 });

    fireEvent.change(screen.getByLabelText("卡片间距"), { target: { value: "24" } });
    expect(onChange).toHaveBeenLastCalledWith({ cardMinWidth: 260, cardGap: 24 });

    // Reset back to default
    fireEvent.click(screen.getByRole("button", { name: "恢复默认" }));
    expect(onChange).toHaveBeenLastCalledWith(DEFAULT_CARD_LAYOUT_CONFIG);
  });

  it("shows list view notice when viewMode is list and renders zero select elements", () => {
    const { container } = render(
      <CardLayoutControl
        config={DEFAULT_CARD_LAYOUT_CONFIG}
        onChange={vi.fn()}
        viewMode="list"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "卡片布局设置" }));
    expect(
      screen.getByText("当前为列表视图，切换到网格视图后生效"),
    ).toBeInTheDocument();
    expect(container.querySelectorAll("select")).toHaveLength(0);
  });
});
