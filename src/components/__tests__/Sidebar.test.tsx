import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Sidebar from "../Sidebar";

vi.mock("../../contexts/I18nContext", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock("../ThemeToggle", () => ({
  default: () => <div data-testid="theme-toggle">theme</div>,
}));

vi.mock("../LocaleToggle", () => ({
  default: () => <div data-testid="locale-toggle">locale</div>,
}));

describe("Sidebar", () => {
  it("renders cloud sync as a sidebar navigation item", () => {
    render(
      <Sidebar
        currentPage="sync"
        onNavigate={vi.fn()}
        collapsed={false}
        onToggleCollapse={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /nav\.sync/ })).toBeInTheDocument();
  });

  it("stacks footer controls vertically when expanded to avoid overflow", () => {
    render(
      <Sidebar
        currentPage="home"
        onNavigate={vi.fn()}
        collapsed={false}
        onToggleCollapse={vi.fn()}
      />,
    );

    const themeToggle = screen.getByTestId("theme-toggle");
    const controlsContainer = themeToggle.parentElement;

    expect(controlsContainer).toBeTruthy();
    expect(controlsContainer?.className).toContain("flex-col");
  });

  it("renders footerSlot in both expanded and collapsed states without unmounting", () => {
    const { rerender } = render(
      <Sidebar
        currentPage="home"
        onNavigate={vi.fn()}
        collapsed={false}
        onToggleCollapse={vi.fn()}
        footerSlot={<button type="button">检查更新</button>}
      />,
    );

    const footerBtnExpanded = screen.getByRole("button", { name: "检查更新" });
    expect(footerBtnExpanded).toBeInTheDocument();

    rerender(
      <Sidebar
        currentPage="home"
        onNavigate={vi.fn()}
        collapsed
        onToggleCollapse={vi.fn()}
        footerSlot={<button type="button">检查更新</button>}
      />,
    );

    const footerBtnCollapsed = screen.getByRole("button", { name: "检查更新" });
    expect(footerBtnCollapsed).toBeInTheDocument();
  });
});
