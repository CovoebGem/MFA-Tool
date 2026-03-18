import { describe, it, expect, beforeEach } from "vitest";
import {
  isValidSortConfig,
  saveSortConfig,
  loadSortConfig,
  DEFAULT_SORT_CONFIG,
} from "./preference-store";

describe("preference-store", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("isValidSortConfig", () => {
    it("accepts valid SortConfig objects", () => {
      expect(isValidSortConfig({ field: "name", direction: "asc" })).toBe(true);
      expect(isValidSortConfig({ field: "issuer", direction: "desc" })).toBe(true);
      expect(isValidSortConfig({ field: "createdAt", direction: "asc" })).toBe(true);
    });

    it("rejects null and non-object values", () => {
      expect(isValidSortConfig(null)).toBe(false);
      expect(isValidSortConfig(undefined)).toBe(false);
      expect(isValidSortConfig("string")).toBe(false);
      expect(isValidSortConfig(42)).toBe(false);
      expect(isValidSortConfig(true)).toBe(false);
    });

    it("rejects arrays", () => {
      expect(isValidSortConfig([])).toBe(false);
      expect(isValidSortConfig([{ field: "name", direction: "asc" }])).toBe(false);
    });

    it("rejects objects with invalid field values", () => {
      expect(isValidSortConfig({ field: "invalid", direction: "asc" })).toBe(false);
      expect(isValidSortConfig({ field: "", direction: "asc" })).toBe(false);
    });

    it("rejects objects with invalid direction values", () => {
      expect(isValidSortConfig({ field: "name", direction: "up" })).toBe(false);
      expect(isValidSortConfig({ field: "name", direction: "" })).toBe(false);
    });

    it("rejects objects with missing fields", () => {
      expect(isValidSortConfig({ field: "name" })).toBe(false);
      expect(isValidSortConfig({ direction: "asc" })).toBe(false);
      expect(isValidSortConfig({})).toBe(false);
    });
  });

  describe("saveSortConfig", () => {
    it("saves config to localStorage as JSON", () => {
      const config = { field: "issuer" as const, direction: "desc" as const };
      saveSortConfig(config);
      expect(localStorage.getItem("2fa-sort-config")).toBe(
        JSON.stringify(config)
      );
    });
  });

  describe("loadSortConfig", () => {
    it("returns default config when localStorage is empty", () => {
      expect(loadSortConfig()).toEqual(DEFAULT_SORT_CONFIG);
    });

    it("returns saved config when valid data exists", () => {
      const config = { field: "createdAt" as const, direction: "desc" as const };
      localStorage.setItem("2fa-sort-config", JSON.stringify(config));
      expect(loadSortConfig()).toEqual(config);
    });

    it("returns default config for invalid JSON", () => {
      localStorage.setItem("2fa-sort-config", "not-json");
      expect(loadSortConfig()).toEqual(DEFAULT_SORT_CONFIG);
    });

    it("returns default config for valid JSON with invalid structure", () => {
      localStorage.setItem("2fa-sort-config", JSON.stringify({ foo: "bar" }));
      expect(loadSortConfig()).toEqual(DEFAULT_SORT_CONFIG);
    });

    it("returns default config for valid JSON with invalid field value", () => {
      localStorage.setItem(
        "2fa-sort-config",
        JSON.stringify({ field: "unknown", direction: "asc" })
      );
      expect(loadSortConfig()).toEqual(DEFAULT_SORT_CONFIG);
    });
  });
});
