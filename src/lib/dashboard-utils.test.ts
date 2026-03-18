import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { computeStats, getRecentAccounts } from "./dashboard-utils";
import type { OTPAccount, Group } from "../types";

function makeAccount(overrides: Partial<OTPAccount> = {}): OTPAccount {
  return {
    id: crypto.randomUUID(),
    issuer: "Default",
    name: "user@example.com",
    secret: "JBSWY3DPEHPK3PXP",
    type: "totp",
    counter: 0,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    createdAt: Date.now(),
    groupId: "default",
    ...overrides,
  };
}

function makeGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: crypto.randomUUID(),
    name: "Test Group",
    isDefault: false,
    createdAt: Date.now(),
    ...overrides,
  };
}

const ONE_DAY = 24 * 60 * 60 * 1000;

describe("computeStats", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("空数组输入返回全零统计", () => {
    const stats = computeStats([], []);
    expect(stats).toEqual({
      totalAccounts: 0,
      totalGroups: 0,
      recentCount: 0,
    });
  });

  it("正确计算账户总数和分组总数", () => {
    const accounts = [makeAccount(), makeAccount(), makeAccount()];
    const groups = [makeGroup(), makeGroup()];
    const stats = computeStats(accounts, groups);
    expect(stats.totalAccounts).toBe(3);
    expect(stats.totalGroups).toBe(2);
  });

  it("单个账户和单个分组", () => {
    const stats = computeStats([makeAccount()], [makeGroup()]);
    expect(stats.totalAccounts).toBe(1);
    expect(stats.totalGroups).toBe(1);
  });

  it("所有账户在 7 天内创建时 recentCount 等于总数", () => {
    const now = Date.now();
    const accounts = [
      makeAccount({ createdAt: now }),
      makeAccount({ createdAt: now - ONE_DAY }),
      makeAccount({ createdAt: now - 3 * ONE_DAY }),
    ];
    const stats = computeStats(accounts, []);
    expect(stats.recentCount).toBe(3);
  });

  it("所有账户超过 7 天时 recentCount 为 0", () => {
    const now = Date.now();
    const accounts = [
      makeAccount({ createdAt: now - 8 * ONE_DAY }),
      makeAccount({ createdAt: now - 10 * ONE_DAY }),
    ];
    const stats = computeStats(accounts, []);
    expect(stats.recentCount).toBe(0);
  });

  it("恰好 7 天前的边界时间戳应被计入 recentCount", () => {
    const now = 1000000000000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const exactlySevenDaysAgo = now - 7 * ONE_DAY;
    const accounts = [makeAccount({ createdAt: exactlySevenDaysAgo })];
    const stats = computeStats(accounts, []);
    expect(stats.recentCount).toBe(1);
  });

  it("恰好超过 7 天的账户不计入 recentCount", () => {
    const now = 1000000000000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const justOverSevenDays = now - 7 * ONE_DAY - 1;
    const accounts = [makeAccount({ createdAt: justOverSevenDays })];
    const stats = computeStats(accounts, []);
    expect(stats.recentCount).toBe(0);
  });

  it("混合新旧账户正确计算 recentCount", () => {
    const now = Date.now();
    const accounts = [
      makeAccount({ createdAt: now }),
      makeAccount({ createdAt: now - 2 * ONE_DAY }),
      makeAccount({ createdAt: now - 8 * ONE_DAY }),
      makeAccount({ createdAt: now - 30 * ONE_DAY }),
    ];
    const stats = computeStats(accounts, []);
    expect(stats.totalAccounts).toBe(4);
    expect(stats.recentCount).toBe(2);
  });

  it("有分组无账户时统计正确", () => {
    const groups = [makeGroup(), makeGroup(), makeGroup()];
    const stats = computeStats([], groups);
    expect(stats.totalAccounts).toBe(0);
    expect(stats.totalGroups).toBe(3);
    expect(stats.recentCount).toBe(0);
  });
});

describe("getRecentAccounts", () => {
  const NOW = 1_000_000_000_000;

  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("空数组输入返回空数组", () => {
    const result = getRecentAccounts([]);
    expect(result).toEqual([]);
  });

  it("单个账户返回该账户", () => {
    const account = makeAccount();
    const result = getRecentAccounts([account]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(account);
  });

  it("按 createdAt 降序排列", () => {
    const old = makeAccount({ createdAt: NOW - 3000 });
    const mid = makeAccount({ createdAt: NOW - 2000 });
    const recent = makeAccount({ createdAt: NOW - 1000 });
    const result = getRecentAccounts([old, recent, mid]);
    expect(result.map((a) => a.createdAt)).toEqual([NOW - 1000, NOW - 2000, NOW - 3000]);
  });

  it("超过 5 条记录时截断为 5 条", () => {
    const accounts = Array.from({ length: 8 }, (_, i) =>
      makeAccount({ createdAt: NOW - i * 1000 })
    );
    const result = getRecentAccounts(accounts);
    expect(result).toHaveLength(5);
  });

  it("截断后保留最新的 5 条", () => {
    const accounts = Array.from({ length: 8 }, (_, i) =>
      makeAccount({ createdAt: NOW - i * 1000 })
    );
    const result = getRecentAccounts(accounts);
    expect(result.map((a) => a.createdAt)).toEqual([
      NOW,
      NOW - 1000,
      NOW - 2000,
      NOW - 3000,
      NOW - 4000,
    ]);
  });

  it("只返回 3 天内的账户", () => {
    const now = 1_000_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const accounts = [
      makeAccount({ createdAt: now - ONE_DAY }),
      makeAccount({ createdAt: now - 3 * ONE_DAY }),
      makeAccount({ createdAt: now - 3 * ONE_DAY - 1 }),
      makeAccount({ createdAt: now - 10 * ONE_DAY }),
    ];

    const result = getRecentAccounts(accounts);

    expect(result).toHaveLength(2);
    expect(result.map((a) => a.createdAt)).toEqual([
      now - ONE_DAY,
      now - 3 * ONE_DAY,
    ]);
  });

  it("新增账户后会挤掉最近列表里时间最早的一条", () => {
    const now = 1_000_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const accounts = Array.from({ length: 5 }, (_, i) =>
      makeAccount({
        issuer: `Service${i + 1}`,
        createdAt: now - (5 - i) * 1000,
      })
    );

    const result = getRecentAccounts([
      ...accounts,
      makeAccount({ issuer: "Newest", createdAt: now }),
    ]);

    expect(result).toHaveLength(5);
    expect(result.map((a) => a.issuer)).toEqual([
      "Newest",
      "Service5",
      "Service4",
      "Service3",
      "Service2",
    ]);
  });

  it("恰好 5 条记录时全部返回", () => {
    const accounts = Array.from({ length: 5 }, (_, i) =>
      makeAccount({ createdAt: NOW - i * 1000 })
    );
    const result = getRecentAccounts(accounts);
    expect(result).toHaveLength(5);
  });

  it("自定义 limit 参数", () => {
    const accounts = Array.from({ length: 10 }, (_, i) =>
      makeAccount({ createdAt: NOW - i * 1000 })
    );
    const result = getRecentAccounts(accounts, 3);
    expect(result).toHaveLength(3);
    expect(result.map((a) => a.createdAt)).toEqual([NOW, NOW - 1000, NOW - 2000]);
  });

  it("不修改原数组", () => {
    const accounts = [
      makeAccount({ createdAt: 1000 }),
      makeAccount({ createdAt: 3000 }),
      makeAccount({ createdAt: 2000 }),
    ];
    const original = [...accounts];
    getRecentAccounts(accounts);
    expect(accounts).toEqual(original);
  });
});
