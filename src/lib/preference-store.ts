import type {
  AccountViewMode,
  CardLayoutConfig,
  CardScale,
  SortConfig,
  SortField,
  SortDirection,
} from "../types";

const SORT_CONFIG_KEY = "2fa-sort-config";
const VIEW_MODE_KEY = "2fa-view-mode";
const CARD_LAYOUT_KEY = "2fa-card-layout";

const VALID_FIELDS: readonly SortField[] = ["name", "issuer", "createdAt"];
const VALID_DIRECTIONS: readonly SortDirection[] = ["asc", "desc"];
const VALID_VIEW_MODES: readonly AccountViewMode[] = ["grid", "list"];

export const CARD_MIN_WIDTH_BOUNDS = { min: 260, max: 440, step: 10 } as const;
export const CARD_GAP_BOUNDS = { min: 8, max: 32, step: 2 } as const;

export const DEFAULT_SORT_CONFIG: SortConfig = {
  field: "name",
  direction: "asc",
};

export const DEFAULT_VIEW_MODE: AccountViewMode = "grid";

export const DEFAULT_CARD_LAYOUT_CONFIG: CardLayoutConfig = {
  cardMinWidth: 310,
  cardGap: 14,
};

export const CARD_LAYOUT_PRESETS = {
  compact: { cardMinWidth: 260, cardGap: 10 },
  default: DEFAULT_CARD_LAYOUT_CONFIG,
  spacious: { cardMinWidth: 380, cardGap: 20 },
} as const;

export function isValidSortConfig(value: unknown): value is SortConfig {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    VALID_FIELDS.includes(obj.field as SortField) &&
    VALID_DIRECTIONS.includes(obj.direction as SortDirection)
  );
}

export function saveSortConfig(config: SortConfig): void {
  try {
    localStorage.setItem(SORT_CONFIG_KEY, JSON.stringify(config));
  } catch {
    // localStorage 不可用时静默失败
  }
}

export function loadSortConfig(): SortConfig {
  try {
    const raw = localStorage.getItem(SORT_CONFIG_KEY);
    if (!raw) return DEFAULT_SORT_CONFIG;
    const parsed = JSON.parse(raw);
    return isValidSortConfig(parsed) ? parsed : DEFAULT_SORT_CONFIG;
  } catch {
    return DEFAULT_SORT_CONFIG;
  }
}

export function isValidViewMode(value: unknown): value is AccountViewMode {
  return typeof value === "string" && VALID_VIEW_MODES.includes(value as AccountViewMode);
}

export function saveViewMode(mode: AccountViewMode): void {
  try {
    localStorage.setItem(VIEW_MODE_KEY, mode);
  } catch {
    // localStorage 不可用时静默失败
  }
}

export function loadViewMode(): AccountViewMode {
  try {
    const raw = localStorage.getItem(VIEW_MODE_KEY);
    if (!raw) return DEFAULT_VIEW_MODE;
    return isValidViewMode(raw) ? raw : DEFAULT_VIEW_MODE;
  } catch {
    return DEFAULT_VIEW_MODE;
  }
}

function snapAndClamp(
  value: unknown,
  fallback: number,
  bounds: { min: number; max: number; step: number },
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  const clamped = Math.min(bounds.max, Math.max(bounds.min, value));
  const snapped =
    Math.round((clamped - bounds.min) / bounds.step) * bounds.step +
    bounds.min;
  return Math.min(bounds.max, Math.max(bounds.min, snapped));
}

export function getCardScale(cardMinWidth: number): CardScale {
  if (cardMinWidth <= 280) {
    return "compact";
  }
  if (cardMinWidth >= 360) {
    return "large";
  }
  return "normal";
}

export function isValidCardLayoutConfig(value: unknown): value is CardLayoutConfig {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.cardMinWidth === "number" &&
    Number.isInteger(obj.cardMinWidth) &&
    obj.cardMinWidth >= CARD_MIN_WIDTH_BOUNDS.min &&
    obj.cardMinWidth <= CARD_MIN_WIDTH_BOUNDS.max &&
    typeof obj.cardGap === "number" &&
    Number.isInteger(obj.cardGap) &&
    obj.cardGap >= CARD_GAP_BOUNDS.min &&
    obj.cardGap <= CARD_GAP_BOUNDS.max
  );
}

export function normalizeCardLayoutConfig(
  config: Partial<CardLayoutConfig>,
): CardLayoutConfig {
  return {
    cardMinWidth: snapAndClamp(
      config.cardMinWidth,
      DEFAULT_CARD_LAYOUT_CONFIG.cardMinWidth,
      CARD_MIN_WIDTH_BOUNDS,
    ),
    cardGap: snapAndClamp(
      config.cardGap,
      DEFAULT_CARD_LAYOUT_CONFIG.cardGap,
      CARD_GAP_BOUNDS,
    ),
  };
}

export function saveCardLayoutConfig(config: CardLayoutConfig): void {
  try {
    localStorage.setItem(
      CARD_LAYOUT_KEY,
      JSON.stringify(normalizeCardLayoutConfig(config)),
    );
  } catch {
    // localStorage 不可用时静默失败
  }
}

export function loadCardLayoutConfig(): CardLayoutConfig {
  try {
    const raw = localStorage.getItem(CARD_LAYOUT_KEY);
    if (!raw) return DEFAULT_CARD_LAYOUT_CONFIG;
    const parsed = JSON.parse(raw);
    return isValidCardLayoutConfig(parsed)
      ? normalizeCardLayoutConfig(parsed)
      : DEFAULT_CARD_LAYOUT_CONFIG;
  } catch {
    return DEFAULT_CARD_LAYOUT_CONFIG;
  }
}
