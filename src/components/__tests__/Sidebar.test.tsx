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
});
