import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import ThemeToggle from "../ThemeToggle";
import { useTheme } from "../../hooks/useTheme";

function createStorageMock() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, String(value));
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => {
      map.clear();
    },
  };
}

function ControlledHarness() {
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="current-theme">{theme}</span>
      <ThemeToggle theme={theme} onThemeChange={setTheme} />
    </div>
  );
}

describe("ThemeToggle controlled mode", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    document.documentElement.classList.remove("dark");
    Object.defineProperty(window, "localStorage", {
      value: createStorageMock(),
      configurable: true,
    });
  });

  it("受控模式下切换到浅色后，系统暗色模式切换事件不会覆写为 dark", () => {
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    const mediaQueryList = {
      matches: false,
      media: "(prefers-color-scheme: dark)",
      onchange: null,
      addEventListener: vi.fn((_event: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.add(listener);
      }),
      removeEventListener: vi.fn((_event: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.delete(listener);
      }),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList;

    Object.defineProperty(window, "matchMedia", {
      value: vi.fn(() => mediaQueryList),
      configurable: true,
    });

    render(<ControlledHarness />);

    // 初始为 system，只有一个 useTheme 注册监听器，受控 ThemeToggle 不应额外注册监听器
    expect(listeners.size).toBe(1);

    // 切换到浅色主题，应移除 system 监听器并保持浅色
    fireEvent.click(screen.getByRole("button", { name: "浅色" }));
    expect(screen.getByTestId("current-theme")).toHaveTextContent("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(listeners.size).toBe(0);

    // 即使模拟系统切换为深色并广播给任何残留监听器，也不会污染当前浅色状态
    (mediaQueryList as { matches: boolean }).matches = true;
    for (const listener of listeners) {
      listener({ matches: true } as MediaQueryListEvent);
    }

    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(screen.getByTestId("current-theme")).toHaveTextContent("light");
  });
});
