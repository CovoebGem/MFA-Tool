import { useEffect, useRef, useState } from "react";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";
import {
  CARD_GAP_BOUNDS,
  CARD_LAYOUT_PRESETS,
  CARD_MIN_WIDTH_BOUNDS,
  DEFAULT_CARD_LAYOUT_CONFIG,
  getCardScale,
} from "../lib/preference-store";
import type { AccountViewMode, CardLayoutConfig, CardScale } from "../types";

interface CardLayoutControlProps {
  config: CardLayoutConfig;
  onChange: (config: CardLayoutConfig) => void;
  viewMode?: AccountViewMode;
}

const PRESETS: ReadonlyArray<{
  key: keyof typeof CARD_LAYOUT_PRESETS;
  label: string;
  config: CardLayoutConfig;
}> = [
  { key: "compact", label: "紧凑", config: CARD_LAYOUT_PRESETS.compact },
  { key: "default", label: "标准", config: CARD_LAYOUT_PRESETS.default },
  { key: "spacious", label: "宽松", config: CARD_LAYOUT_PRESETS.spacious },
];

function getScaleLabel(scale: CardScale): string {
  switch (scale) {
    case "compact":
      return "紧凑";
    case "large":
      return "宽大";
    default:
      return "标准";
  }
}

export default function CardLayoutControl({
  config,
  onChange,
  viewMode,
}: CardLayoutControlProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const isDefault =
    config.cardMinWidth === DEFAULT_CARD_LAYOUT_CONFIG.cardMinWidth &&
    config.cardGap === DEFAULT_CARD_LAYOUT_CONFIG.cardGap;
  const scaleLabel = getScaleLabel(getCardScale(config.cardMinWidth));

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleMouseDown = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.isComposing && event.keyCode !== 229 && event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef} data-no-marquee="true">
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="卡片布局设置"
        aria-expanded={open}
        title="自定义卡片大小和间距"
        className="h-[34px] gap-1.5 px-2.5 text-xs"
      >
        <SlidersHorizontal className="size-3.5 shrink-0" aria-hidden="true" />
        <span>卡片布局</span>
        {!isDefault && (
          <span
            className="size-1.5 rounded-full bg-primary"
            aria-hidden="true"
          />
        )}
      </Button>

      {open && (
        <div
          role="group"
          aria-label="卡片布局设置"
          data-no-marquee="true"
          className="absolute right-0 z-40 mt-2 w-72 origin-top-right rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-lg"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-foreground">卡片布局</span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={isDefault}
              onClick={() => onChange(DEFAULT_CARD_LAYOUT_CONFIG)}
              className="gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="size-3" aria-hidden="true" />
              <span>恢复默认</span>
            </Button>
          </div>

          <div
            role="group"
            aria-label="布局预设"
            className="mt-3 grid grid-cols-3 gap-1 rounded-lg border border-border/70 bg-muted/80 p-1"
          >
            {PRESETS.map((preset) => {
              const active =
                config.cardMinWidth === preset.config.cardMinWidth &&
                config.cardGap === preset.config.cardGap;
              return (
                <button
                  key={preset.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onChange({ ...preset.config })}
                  className={cn(
                    "rounded-md py-1 text-xs font-medium transition-[color,background-color,box-shadow] duration-150 cursor-pointer",
                    active
                      ? "bg-card text-primary shadow-2xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex flex-col gap-3.5">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">卡片大小</span>
                <div className="flex items-center gap-1.5">
                  <Badge variant="secondary" className="px-1.5 py-0 text-[11px]">
                    {scaleLabel}
                  </Badge>
                  <span className="font-mono text-muted-foreground tabular-nums">
                    {config.cardMinWidth}px
                  </span>
                </div>
              </div>
              <input
                type="range"
                aria-label="卡片大小"
                min={CARD_MIN_WIDTH_BOUNDS.min}
                max={CARD_MIN_WIDTH_BOUNDS.max}
                step={CARD_MIN_WIDTH_BOUNDS.step}
                value={config.cardMinWidth}
                onChange={(e) =>
                  onChange({ ...config, cardMinWidth: Number(e.target.value) })
                }
                className="h-1.5 w-full cursor-pointer accent-primary"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">卡片间距</span>
                <span className="font-mono text-muted-foreground tabular-nums">
                  {config.cardGap}px
                </span>
              </div>
              <input
                type="range"
                aria-label="卡片间距"
                min={CARD_GAP_BOUNDS.min}
                max={CARD_GAP_BOUNDS.max}
                step={CARD_GAP_BOUNDS.step}
                value={config.cardGap}
                onChange={(e) =>
                  onChange({ ...config, cardGap: Number(e.target.value) })
                }
                className="h-1.5 w-full cursor-pointer accent-primary"
              />
            </div>
          </div>

          {viewMode === "list" && (
            <p className="mt-3 border-t border-border/60 pt-2.5 text-[11px] text-muted-foreground">
              当前为列表视图，切换到网格视图后生效
            </p>
          )}
        </div>
      )}
    </div>
  );
}
