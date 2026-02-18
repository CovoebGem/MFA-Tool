export type Theme = "light" | "dark" | "system";

const THEME_KEY = "2fa-theme";

export const VALID_THEMES: readonly Theme[] = ["light", "dark", "system"];

export function isValidTheme(value: unknown): value is Theme {
  return VALID_THEMES.includes(value as Theme);
}

export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // localStorage 不可用时静默失败
  }
}

export function loadTheme(): Theme {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (!raw) return "system";
    return isValidTheme(raw) ? raw : "system";
  } catch {
    return "system";
  }
}

export function getSystemTheme(): "light" | "dark" {
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return "light";
}

export function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme === "system") {
    return getSystemTheme();
  }
  return theme;
}
