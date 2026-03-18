import type { SortConfig, SortField, SortDirection } from "../types";

const SORT_CONFIG_KEY = "2fa-sort-config";

const VALID_FIELDS: readonly SortField[] = ["name", "issuer", "createdAt"];
const VALID_DIRECTIONS: readonly SortDirection[] = ["asc", "desc"];

export const DEFAULT_SORT_CONFIG: SortConfig = {
  field: "name",
  direction: "asc",
};

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
