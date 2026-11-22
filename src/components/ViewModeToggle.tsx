import { LayoutGrid, List } from "lucide-react";
import { cn } from "../lib/utils";
import type { AccountViewMode } from "../types";

interface ViewModeToggleProps {
  value: AccountViewMode;
  onChange: (mode: AccountViewMode) => void;
}

/** 网格 / 列表展示切换控件 */
export default function ViewModeToggle({ value, onChange }: ViewModeToggleProps) {
  const itemClass = (active: boolean) =>
    cn(
      "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-[color,background-color,box-shadow] duration-150 cursor-pointer",
      active
        ? "bg-card text-primary shadow-2xs"
        : "text-muted-foreground hover:text-foreground",
    );

  return (
    <div
      role="group"
      aria-label="视图切换"
      className="flex items-center gap-1 rounded-lg border border-border/70 bg-muted/80 p-1"
    >
      <button
        type="button"
        onClick={() => onChange("grid")}
        aria-label="网格视图"
        aria-pressed={value === "grid"}
        title="网格视图"
        className={itemClass(value === "grid")}
      >
        <LayoutGrid className="size-3.5" aria-hidden="true" />
        <span>网格</span>
      </button>
      <button
        type="button"
        onClick={() => onChange("list")}
        aria-label="列表视图"
        aria-pressed={value === "list"}
        title="列表视图"
        className={itemClass(value === "list")}
      >
        <List className="size-3.5" aria-hidden="true" />
        <span>列表</span>
      </button>
    </div>
  );
}
