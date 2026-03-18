import { describe, it, expect, beforeEach } from "vitest";
import * as fc from "fast-check";
import type { SortConfig, SortField, SortDirection } from "../../types";
import {
  isValidSortConfig,
  saveSortConfig,
  loadSortConfig,
  DEFAULT_SORT_CONFIG,
} from "../preference-store";

// --- Generators ---

const sortFieldArb: fc.Arbitrary<SortField> = fc.constantFrom(
  "name",
  "issuer",
  "createdAt"
);
const sortDirectionArb: fc.Arbitrary<SortDirection> = fc.constantFrom(
  "asc",
  "desc"
);

const sortConfigArb: fc.Arbitrary<SortConfig> = fc.record({
  field: sortFieldArb,
  direction: sortDirectionArb,
});

// 生成非法 localStorage 值的 generator
const invalidLocalStorageValueArb: fc.Arbitrary<string> = fc.oneof(
  // 非 JSON 字符串
  fc.string({ minLength: 1, maxLength: 50 }).filter((s) => {
    try {
      JSON.parse(s);
      return false;
    } catch {
      return true;
    }
  }),
  // 合法 JSON 但缺少必要字段
  fc.oneof(
    fc.constant("null"),
    fc.constant("true"),
    fc.constant("42"),
    fc.constant('"hello"'),
    fc.constant("[]"),
    fc.constant("{}"),
    fc.constant(JSON.stringify({ field: "name" })),
    fc.constant(JSON.stringify({ direction: "asc" }))
  ),
  // 合法 JSON 对象但字段值不在枚举范围内
  fc
    .record({
      field: fc
        .string({ minLength: 1, maxLength: 20 })
        .filter((s) => !["name", "issuer", "createdAt"].includes(s)),
      direction: fc.constantFrom("asc" as const, "desc" as const),
    })
    .map((obj) => JSON.stringify(obj)),
  fc
    .record({
      field: fc.constantFrom("name" as const, "issuer" as const, "createdAt" as const),
      direction: fc
        .string({ minLength: 1, maxLength: 20 })
        .filter((s) => !["asc", "desc"].includes(s)),
    })
    .map((obj) => JSON.stringify(obj))
);

// Feature: group-dropdown-and-preferences, Property 2: SortConfig 序列化往返一致性
// **Validates: Requirements 3.1, 3.2, 4.1, 4.2, 4.3**
describe("Property 2: SortConfig 序列化往返一致性", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("save 后 load 应返回与原始对象等价的 SortConfig", () => {
    fc.assert(
      fc.property(sortConfigArb, (config) => {
        saveSortConfig(config);
        const loaded = loadSortConfig();
        expect(loaded).toEqual(config);
      }),
      { numRuns: 100 }
    );
  });

  it("多次 save 后 load 应返回最后一次保存的值", () => {
    fc.assert(
      fc.property(
        fc.array(sortConfigArb, { minLength: 1, maxLength: 10 }),
        (configs) => {
          for (const config of configs) {
            saveSortConfig(config);
          }
          const loaded = loadSortConfig();
          expect(loaded).toEqual(configs[configs.length - 1]);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("isValidSortConfig 对所有有效 SortConfig 返回 true", () => {
    fc.assert(
      fc.property(sortConfigArb, (config) => {
        expect(isValidSortConfig(config)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: group-dropdown-and-preferences, Property 3: 无效数据回退到默认值
// **Validates: Requirements 3.4**
describe("Property 3: 无效数据回退到默认值", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("对任意无效 localStorage 值，loadSortConfig 应返回默认值", () => {
    fc.assert(
      fc.property(invalidLocalStorageValueArb, (invalidValue) => {
        localStorage.setItem("2fa-sort-config", invalidValue);
        const loaded = loadSortConfig();
        expect(loaded).toEqual(DEFAULT_SORT_CONFIG);
      }),
      { numRuns: 100 }
    );
  });
});
