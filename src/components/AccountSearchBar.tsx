import { useRef, useCallback } from "react";
import { useOptionalI18n } from "../contexts/I18nContext";

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
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400 dark:text-gray-500">
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.75}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
          />
        </svg>
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
        className={`w-full rounded-lg border border-gray-300 bg-white pl-9 pr-16 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-blue-400 ${
          compact ? "py-1.5" : "py-2"
        }`}
      />
      {value.length > 0 ? (
        <button
          type="button"
          onClick={handleClear}
          aria-label={resolvedClearLabel}
          title={resolvedClearLabel}
          className="absolute inset-y-0 right-2 my-auto flex h-6 w-6 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      ) : shortcutHint ? (
        <kbd className="pointer-events-none absolute inset-y-0 right-2.5 my-auto inline-flex h-5 items-center rounded border border-gray-200 bg-gray-100 px-1.5 font-sans text-[11px] font-medium text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300">
          {shortcutHint}
        </kbd>
      ) : null}
    </div>
  );
}
