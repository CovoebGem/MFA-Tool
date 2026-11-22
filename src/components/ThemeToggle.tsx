import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "../hooks/useTheme";
import { cn } from "../lib/utils";
import type { Theme } from "../lib/theme-store";

const themeOptions: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "浅色", icon: Sun },
  { value: "dark", label: "深色", icon: Moon },
  { value: "system", label: "跟随系统", icon: Monitor },
];

interface ThemeToggleProps {
  theme?: Theme;
  onThemeChange?: (theme: Theme) => void;
}

function ThemeToggleView({
  theme,
  setTheme,
}: {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-1 rounded-lg border border-border/70 bg-muted/80 p-1">
      {themeOptions.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => setTheme(value)}
          aria-label={label}
          title={label}
          className={cn(
            "flex items-center justify-center rounded-md py-1.5 transition-[color,background-color,box-shadow] duration-150 cursor-pointer",
            theme === value
              ? "bg-card text-primary shadow-2xs"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-3.5" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

function UncontrolledThemeToggle() {
  const { theme, setTheme } = useTheme();
  return <ThemeToggleView theme={theme} setTheme={setTheme} />;
}

export default function ThemeToggle({ theme: controlledTheme, onThemeChange }: ThemeToggleProps = {}) {
  if (controlledTheme !== undefined && onThemeChange !== undefined) {
    return <ThemeToggleView theme={controlledTheme} setTheme={onThemeChange} />;
  }

  return <UncontrolledThemeToggle />;
}
