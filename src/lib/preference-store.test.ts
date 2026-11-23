import { describe, it, expect, beforeEach } from "vitest";
import {
  isValidSortConfig,
  saveSortConfig,
  loadSortConfig,
  DEFAULT_SORT_CONFIG,
  isValidSortMode,
  saveSortMode,
  loadSortMode,
  DEFAULT_SORT_MODE,
  isValidViewMode,
  saveViewMode,
  loadViewMode,
  DEFAULT_VIEW_MODE,
  isValidCardLayoutConfig,
  normalizeCardLayoutConfig,
  getCardScale,
  saveCardLayoutConfig,
  loadCardLayoutConfig,
  DEFAULT_CARD_LAYOUT_CONFIG,
  saveSidebarCollapsed,
  loadSidebarCollapsed,
  DEFAULT_SIDEBAR_COLLAPSED,
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

  describe("sortMode preference", () => {
    it("validates supported sort modes only", () => {
      expect(isValidSortMode("auto")).toBe(true);
      expect(isValidSortMode("custom")).toBe(true);
      expect(isValidSortMode("manual")).toBe(false);
      expect(isValidSortMode("")).toBe(false);
      expect(isValidSortMode(null)).toBe(false);
      expect(isValidSortMode(123)).toBe(false);
    });

    it("saves and loads sort mode with auto default fallback", () => {
      expect(DEFAULT_SORT_MODE).toBe("auto");
      expect(loadSortMode()).toBe(DEFAULT_SORT_MODE);

      saveSortMode("custom");
      expect(localStorage.getItem("2fa-sort-mode")).toBe("custom");
      expect(loadSortMode()).toBe("custom");

      saveSortMode("auto");
      expect(loadSortMode()).toBe("auto");

      localStorage.setItem("2fa-sort-mode", "invalid-mode");
      expect(loadSortMode()).toBe(DEFAULT_SORT_MODE);
    });
  });

  describe("viewMode preference", () => {
    it("validates supported view modes only", () => {
      expect(isValidViewMode("grid")).toBe(true);
      expect(isValidViewMode("list")).toBe(true);
      expect(isValidViewMode("table")).toBe(false);
      expect(isValidViewMode("")).toBe(false);
      expect(isValidViewMode(null)).toBe(false);
      expect(isValidViewMode(123)).toBe(false);
    });

    it("saves and loads view mode with grid default fallback", () => {
      expect(loadViewMode()).toBe(DEFAULT_VIEW_MODE);

      saveViewMode("list");
      expect(localStorage.getItem("2fa-view-mode")).toBe("list");
      expect(loadViewMode()).toBe("list");

      saveViewMode("grid");
      expect(loadViewMode()).toBe("grid");

      localStorage.setItem("2fa-view-mode", "invalid-mode");
      expect(loadViewMode()).toBe(DEFAULT_VIEW_MODE);
    });
  });

  describe("cardLayout preference", () => {
    it("getCardScale maps card widths to compact, normal, and large scales", () => {
      expect(getCardScale(260)).toBe("compact");
      expect(getCardScale(280)).toBe("compact");
      expect(getCardScale(290)).toBe("normal");
      expect(getCardScale(350)).toBe("normal");
      expect(getCardScale(360)).toBe("large");
      expect(getCardScale(440)).toBe("large");
    });

    it("isValidCardLayoutConfig validates integer bounds and shape", () => {
      expect(isValidCardLayoutConfig({ cardMinWidth: 310, cardGap: 14 })).toBe(true);
      expect(isValidCardLayoutConfig({ cardMinWidth: 260, cardGap: 8 })).toBe(true);
      expect(isValidCardLayoutConfig({ cardMinWidth: 440, cardGap: 32 })).toBe(true);

      expect(isValidCardLayoutConfig({ cardMinWidth: 259, cardGap: 14 })).toBe(false);
      expect(isValidCardLayoutConfig({ cardMinWidth: 441, cardGap: 14 })).toBe(false);
      expect(isValidCardLayoutConfig({ cardMinWidth: 310, cardGap: 7 })).toBe(false);
      expect(isValidCardLayoutConfig({ cardMinWidth: 310, cardGap: 33 })).toBe(false);
      expect(isValidCardLayoutConfig({ cardMinWidth: 310.5, cardGap: 14 })).toBe(false);
      expect(isValidCardLayoutConfig(null)).toBe(false);
      expect(isValidCardLayoutConfig([])).toBe(false);
    });

    it("normalizeCardLayoutConfig clamps out-of-range values, snaps to steps, and handles non-finite", () => {
      expect(normalizeCardLayoutConfig({ cardMinWidth: 100, cardGap: 50 })).toEqual({
        cardMinWidth: 260,
        cardGap: 32,
      });
      expect(normalizeCardLayoutConfig({ cardMinWidth: 314, cardGap: 15 })).toEqual({
        cardMinWidth: 310,
        cardGap: 16,
      });
      expect(normalizeCardLayoutConfig({ cardMinWidth: Number.NaN })).toEqual(
        DEFAULT_CARD_LAYOUT_CONFIG,
      );
    });

    it("saveCardLayoutConfig and loadCardLayoutConfig persist and recover safely", () => {
      expect(loadCardLayoutConfig()).toEqual(DEFAULT_CARD_LAYOUT_CONFIG);

      saveCardLayoutConfig({ cardMinWidth: 380, cardGap: 20 });
      expect(localStorage.getItem("2fa-card-layout")).toBe(
        JSON.stringify({ cardMinWidth: 380, cardGap: 20 }),
      );
      expect(loadCardLayoutConfig()).toEqual({ cardMinWidth: 380, cardGap: 20 });

      localStorage.setItem("2fa-card-layout", "not-json");
      expect(loadCardLayoutConfig()).toEqual(DEFAULT_CARD_LAYOUT_CONFIG);

      localStorage.setItem("2fa-card-layout", JSON.stringify({ cardMinWidth: 999, cardGap: 14 }));
      expect(loadCardLayoutConfig()).toEqual(DEFAULT_CARD_LAYOUT_CONFIG);
    });
  });

  describe("sidebarCollapsed preference", () => {
    it("saves and loads sidebar collapsed state with false default fallback", () => {
      expect(DEFAULT_SIDEBAR_COLLAPSED).toBe(false);
      expect(loadSidebarCollapsed()).toBe(false);

      saveSidebarCollapsed(true);
      expect(localStorage.getItem("2fa-sidebar-collapsed")).toBe("true");
      expect(loadSidebarCollapsed()).toBe(true);

      saveSidebarCollapsed(false);
      expect(localStorage.getItem("2fa-sidebar-collapsed")).toBe("false");
      expect(loadSidebarCollapsed()).toBe(false);

      localStorage.setItem("2fa-sidebar-collapsed", "yes");
      expect(loadSidebarCollapsed()).toBe(false);

      localStorage.setItem("2fa-sidebar-collapsed", "1");
      expect(loadSidebarCollapsed()).toBe(false);
    });
  });
});
