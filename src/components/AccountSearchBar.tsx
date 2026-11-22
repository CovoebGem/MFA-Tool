import { useRef, useCallback } from "react";
import { Search, X } from "lucide-react";
import { useOptionalI18n } from "../contexts/I18nContext";
import { Kbd } from "./ui/kbd";
import { cn } from "../lib/utils";

interface AccountSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  placeholder?: string;
  ariaLabel?: string;
  shortcutHint?: string;
  compact?: boolean;
}

export function getSearchShortcutHint(): string {
  if (typeof navigator !== "undefined") {
    const platform = (navigator.platform || navigator.userAgent || "").toLowerCase();
    if (platform.includes("mac")) {
      return "⌘K";
    }
  }
  return "Ctrl K";
}

export default function AccountSearchBar({
  value,
  onChange,
  onClear,
  inputRef,
  placeholder,
  ariaLabel,
  shortcutHint,
  compact = false,
}: AccountSearchBarProps) {
  const { t } = useOptionalI18n();
  const localInputRef = useRef<HTMLInputElement | null>(null);

  const assignRef = useCallback(
    (node: HTMLInputElement | null) => {
      localInputRef.current = node;
      if (inputRef) {
        inputRef.current = node;
      }
    },
    [inputRef],
  );

  const handleClear = () => {
    onClear();
    localInputRef.current?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) {
      return;
    }

    if (event.key === "Escape") {
      if (value.length > 0) {
        event.preventDefault();
        event.stopPropagation();
        onClear();
      } else {
        event.currentTarget.blur();
      }
    }
  };

  const resolvedAriaLabel = ariaLabel ?? t("accounts.searchAriaLabel");
  const resolvedPlaceholder = placeholder ?? t("accounts.searchPlaceholder");
  const resolvedClearLabel = t("accounts.clearSearch");

  return (
    <div className="relative w-full">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
        <Search className="size-4" aria-hidden="true" />
      </span>
      <input
        ref={assignRef}
        type="text"
        role="searchbox"
        aria-label={resolvedAriaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={resolvedPlaceholder}
        autoComplete="off"
        spellCheck={false}
        className={cn(
          "w-full rounded-lg border border-input bg-card pl-9 pr-16 text-sm text-foreground shadow-2xs transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25",
          compact ? "h-8" : "h-9",
        )}
      />
      {value.length > 0 ? (
        <button
          type="button"
          onClick={handleClear}
          aria-label={resolvedClearLabel}
          title={resolvedClearLabel}
          className="absolute inset-y-0 right-2 my-auto flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      ) : shortcutHint ? (
        <Kbd className="pointer-events-none absolute inset-y-0 right-2 my-auto">
          {shortcutHint}
        </Kbd>
      ) : null}
    </div>
  );
}
