import type { Page } from "../types";
import type { ReactNode } from "react";
import type { Theme } from "../lib/theme-store";
import {
  ChevronLeft,
  ChevronRight,
  Cloud,
  FolderKanban,
  Home,
  KeyRound,
  ShieldCheck,
  Timer,
} from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import LocaleToggle from "./LocaleToggle";
import { Separator } from "./ui/separator";
import { cn } from "../lib/utils";
import { useI18n } from "../contexts/I18nContext";

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  viewportHeight?: string;
  theme?: Theme;
  onThemeChange?: (theme: Theme) => void;
  footerSlot?: ReactNode;
}

export default function Sidebar({
  currentPage,
  onNavigate,
  collapsed,
  onToggleCollapse,
  viewportHeight = "100vh",
  theme,
  onThemeChange,
  footerSlot,
}: SidebarProps) {
  const { t } = useI18n();

  const navItems: { page: Page; icon: (props: { className?: string }) => ReactNode; labelKey: string }[] = [
    { page: "home", icon: (p) => <Home {...p} />, labelKey: "nav.home" },
    { page: "accounts", icon: (p) => <KeyRound {...p} />, labelKey: "nav.accounts" },
    { page: "groups", icon: (p) => <FolderKanban {...p} />, labelKey: "nav.groups" },
    { page: "sync", icon: (p) => <Cloud {...p} />, labelKey: "nav.sync" },
    { page: "temp", icon: (p) => <Timer {...p} />, labelKey: "nav.temp" },
  ];

  return (
    <nav
      className={cn(
        "fixed left-0 top-0 z-30 flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground py-4",
        collapsed ? "w-16 items-center px-2" : "w-56 px-3",
      )}
      style={{ height: viewportHeight }}
      aria-label="主导航"
    >
      <div
        className={cn(
          "flex items-center gap-2.5 px-1.5 pb-1",
          collapsed && "justify-center px-0",
        )}
      >
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs">
          <ShieldCheck className="size-4.5" aria-hidden="true" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight text-foreground">
              MFA Tool
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              2FA Vault
            </p>
          </div>
        )}
      </div>

      <Separator className="my-3" />

      <div className={cn("flex flex-1 flex-col gap-1", collapsed && "items-center w-full")}>
        {navItems.map(({ page, icon: renderIcon, labelKey }) => {
          const isActive = currentPage === page;
          const label = t(labelKey);
          return (
            <button
              key={page}
              type="button"
              onClick={() => onNavigate(page)}
              className={cn(
                "flex items-center rounded-lg text-sm transition-[color,background-color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.98] cursor-pointer",
                collapsed
                  ? "size-10 justify-center"
                  : "w-full gap-2.5 px-3 py-2",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-2xs"
                  : "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
              )}
              aria-current={isActive ? "page" : undefined}
              title={label}
            >
              {renderIcon({ className: "size-4.5 shrink-0" })}
              {!collapsed && <span className="truncate">{label}</span>}
            </button>
          );
        })}
      </div>

      <div className={cn("mt-auto w-full", collapsed ? "flex flex-col items-center gap-2" : "flex flex-col gap-2.5")}>
        <Separator />
        {!collapsed && (
          <div className="flex w-full flex-col gap-2">
            <ThemeToggle theme={theme} onThemeChange={onThemeChange} />
            <LocaleToggle />
          </div>
        )}
        {footerSlot}
        <button
          type="button"
          onClick={onToggleCollapse}
          className={cn(
            "flex items-center justify-center rounded-lg py-2 text-muted-foreground transition-[color,background-color,transform] duration-150 hover:bg-accent/70 hover:text-foreground active:scale-[0.98] cursor-pointer",
            collapsed ? "size-10" : "w-full gap-2 px-2 text-xs",
          )}
          aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
          title={collapsed ? "展开侧边栏" : "收起侧边栏"}
        >
          {collapsed ? (
            <ChevronRight className="size-4.5" aria-hidden="true" />
          ) : (
            <>
              <ChevronLeft className="size-4" aria-hidden="true" />
              <span>收起侧边栏</span>
            </>
          )}
        </button>
      </div>
    </nav>
  );
}
