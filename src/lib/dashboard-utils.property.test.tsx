import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { OTPAccount, Group } from '../types';
import { computeStats, getRecentAccounts } from './dashboard-utils';

// --- Generators ---

const base32CharArb = fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.split(''));
const base32SecretArb = fc.array(base32CharArb, { minLength: 16, maxLength: 32 }).map(chars => chars.join(''));

const otpAccountArb: fc.Arbitrary<OTPAccount> = fc.record({
  id: fc.uuid(),
  issuer: fc.string({ minLength: 0, maxLength: 30 }).filter(s => !s.includes('\0')),
  name: fc.string({ minLength: 0, maxLength: 30 }).filter(s => !s.includes('\0')),
  secret: base32SecretArb,
  type: fc.constantFrom('totp' as const, 'hotp' as const),
  counter: fc.integer({ min: 0, max: 1000000 }),
  algorithm: fc.constant('SHA1' as const),
  digits: fc.constantFrom(6, 8),
  period: fc.constantFrom(30, 60),
  createdAt: fc.integer({ min: 0, max: Date.now() }),
  groupId: fc.uuid(),
});

const accountListArb = fc.array(otpAccountArb, { minLength: 0, maxLength: 20 });

const groupArb: fc.Arbitrary<Group> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.includes('\0')),
  isDefault: fc.boolean(),
  createdAt: fc.integer({ min: 0, max: Date.now() }),
});

const groupListArb = fc.array(groupArb, { minLength: 0, maxLength: 10 });

/**
 * Property 1: Dashboard 统计数据正确性
 * **Validates: Requirements 4.1, 4.2, 4.3**
 *
 * 对于任意 OTPAccount[] 和 Group[]，computeStats 返回的：
 * - totalAccounts 等于 accounts.length
 * - totalGroups 等于 groups.length
 * - recentCount 等于 accounts 中 createdAt 在最近 7 天内的账户数量
 */
describe('Property 1: Dashboard 统计数据正确性', () => {
  // **Validates: Requirements 4.1, 4.2, 4.3**

  it('totalAccounts 应等于 accounts.length', () => {
    fc.assert(
      fc.property(accountListArb, groupListArb, (accounts, groups) => {
        const stats = computeStats(accounts, groups);
        expect(stats.totalAccounts).toBe(accounts.length);
      }),
      { numRuns: 100 },
    );
  });

  it('totalGroups 应等于 groups.length', () => {
    fc.assert(
      fc.property(accountListArb, groupListArb, (accounts, groups) => {
        const stats = computeStats(accounts, groups);
        expect(stats.totalGroups).toBe(groups.length);
      }),
      { numRuns: 100 },
    );
  });

  it('recentCount 应等于最近 7 天内创建的账户数', () => {
    fc.assert(
      fc.property(accountListArb, groupListArb, (accounts, groups) => {
        const now = Date.now();
        const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
        const expectedRecent = accounts.filter(a => a.createdAt >= sevenDaysAgo).length;

        const stats = computeStats(accounts, groups);
        expect(stats.recentCount).toBe(expectedRecent);
      }),
      { numRuns: 100 },
    );
  });

  it('所有统计值应为非负整数', () => {
    fc.assert(
      fc.property(accountListArb, groupListArb, (accounts, groups) => {
        const stats = computeStats(accounts, groups);
        expect(stats.totalAccounts).toBeGreaterThanOrEqual(0);
        expect(stats.totalGroups).toBeGreaterThanOrEqual(0);
        expect(stats.recentCount).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(stats.totalAccounts)).toBe(true);
        expect(Number.isInteger(stats.totalGroups)).toBe(true);
        expect(Number.isInteger(stats.recentCount)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('recentCount 不应超过 totalAccounts', () => {
    fc.assert(
      fc.property(accountListArb, groupListArb, (accounts, groups) => {
        const stats = computeStats(accounts, groups);
        expect(stats.recentCount).toBeLessThanOrEqual(stats.totalAccounts);
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * Property 2: 最近账户列表排序与截断
 * **Validates: Requirements 3.3, 3.5**
 *
 * 对于任意 OTPAccount[]，getRecentAccounts 返回的列表：
 * - 长度不超过 5
 * - 按 createdAt 严格降序排列
 */
describe('Property 2: 最近账户列表排序与截断', () => {
  // **Validates: Requirements 3.3, 3.5**

  it('返回列表长度不超过 5', () => {
    fc.assert(
      fc.property(accountListArb, (accounts) => {
        const recent = getRecentAccounts(accounts);
        expect(recent.length).toBeLessThanOrEqual(5);
      }),
      { numRuns: 100 },
    );
  });

  it('返回列表长度不超过原列表长度', () => {
    fc.assert(
      fc.property(accountListArb, (accounts) => {
        const recent = getRecentAccounts(accounts);
        expect(recent.length).toBeLessThanOrEqual(accounts.length);
      }),
      { numRuns: 100 },
    );
  });

  it('返回列表按 createdAt 降序排列', () => {
    fc.assert(
      fc.property(accountListArb, (accounts) => {
        const recent = getRecentAccounts(accounts);
        for (let i = 0; i < recent.length - 1; i++) {
          expect(recent[i].createdAt).toBeGreaterThanOrEqual(recent[i + 1].createdAt);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('返回的账户应是原列表中 createdAt 最大的那些', () => {
    fc.assert(
      fc.property(accountListArb, (accounts) => {
        const recent = getRecentAccounts(accounts);
        if (recent.length === 0) return;

        // 原列表中所有不在结果中的账户，其 createdAt 不应大于结果中最小的 createdAt
        const minRecentCreatedAt = recent[recent.length - 1].createdAt;
        const recentIds = new Set(recent.map(a => a.id));
        for (const account of accounts) {
          if (!recentIds.has(account.id)) {
            expect(account.createdAt).toBeLessThanOrEqual(minRecentCreatedAt);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('自定义 limit 参数应正确截断', () => {
    const limitArb = fc.integer({ min: 0, max: 25 });
    fc.assert(
      fc.property(accountListArb, limitArb, (accounts, limit) => {
        const recent = getRecentAccounts(accounts, limit);
        expect(recent.length).toBeLessThanOrEqual(limit);
        expect(recent.length).toBeLessThanOrEqual(accounts.length);
        // 仍然保持降序
        for (let i = 0; i < recent.length - 1; i++) {
          expect(recent[i].createdAt).toBeGreaterThanOrEqual(recent[i + 1].createdAt);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// --- Property 3 imports ---
import { render } from '@testing-library/react';
import { vi, beforeEach, afterEach } from 'vitest';
import RecentAccounts from '../components/RecentAccounts';

/**
 * Property 3: 最近账户渲染包含必要信息
 * **Validates: Requirements 3.2**
 *
 * 对于任意 OTPAccount，RecentAccounts 组件渲染的每一行
 * 应包含该账户的 issuer、name 和格式化后的添加时间。
 */
describe('Property 3: 最近账户渲染包含必要信息', () => {
  // **Validates: Requirements 3.2**

  const NOW = 1750000000000; // 固定时间点，避免测试不稳定

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // 生成唯一 issuer 和 name 的账户生成器，避免文本重复导致查询歧义
  const visibleAccountArb: fc.Arbitrary<OTPAccount> = fc.record({
    id: fc.uuid(),
    issuer: fc.string({ minLength: 1, maxLength: 20 }).filter(s => /\S/.test(s) && !s.includes('\0')),
    name: fc.string({ minLength: 1, maxLength: 20 }).filter(s => /\S/.test(s) && !s.includes('\0')),
    secret: base32SecretArb,
    type: fc.constantFrom('totp' as const, 'hotp' as const),
    counter: fc.integer({ min: 0, max: 1000000 }),
    algorithm: fc.constant('SHA1' as const),
    digits: fc.constantFrom(6, 8),
    period: fc.constantFrom(30, 60),
    createdAt: fc.integer({ min: NOW - 3 * 24 * 60 * 60 * 1000, max: NOW }),
    groupId: fc.uuid(),
  });

  /**
   * 复现 RecentAccounts 内部的 formatRelativeTime 逻辑，
   * 用于验证渲染输出是否包含正确的时间文本。
   */
  function expectedRelativeTime(timestamp: number): string {
    const diff = NOW - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return '刚刚';
    if (minutes < 60) return `${minutes} 分钟前`;
    if (hours < 24) return `${hours} 小时前`;
    return `${days} 天前`;
  }

  it('每个渲染行应包含账户的 issuer、name 和格式化时间', () => {
    fc.assert(
      fc.property(
        fc.array(visibleAccountArb, { minLength: 1, maxLength: 5 }),
        (accounts) => {
          // 给每个账户分配唯一 id，避免 key 冲突
          const uniqueAccounts = accounts.map((a, i) => ({
            ...a,
            id: `${a.id}-${i}`,
          }));

          const { container, unmount } = render(<RecentAccounts accounts={uniqueAccounts} />);

          const recentAccounts = getRecentAccounts(uniqueAccounts);

          // 获取所有渲染的列表项（<li>），逐行验证
          const listItems = container.querySelectorAll('li');
          expect(listItems.length).toBe(recentAccounts.length);

          recentAccounts.forEach((account, index) => {
            const row = listItems[index] as HTMLElement;

            // 组件结构：<li> > <div> > <p>issuer</p><p>name</p> + <span>time</span>
            const paragraphs = row.querySelectorAll('p');
            const timeSpan = row.querySelector('span');

            // 验证 issuer 出现在第一个 <p> 中
            expect(paragraphs[0]?.textContent).toBe(account.issuer);
            // 验证 name 出现在第二个 <p> 中
            expect(paragraphs[1]?.textContent).toBe(account.name);
            // 验证格式化时间出现在 <span> 中
            const timeText = expectedRelativeTime(account.createdAt);
            expect(timeSpan?.textContent).toBe(timeText);
          });

          unmount(); // 清理 DOM，避免影响下一次迭代
        },
      ),
      { numRuns: 100 },
    );
  });

  it('空账户列表不应渲染任何内容', () => {
    fc.assert(
      fc.property(fc.constant([] as OTPAccount[]), (accounts) => {
        const { container, unmount } = render(<RecentAccounts accounts={accounts} />);
        expect(container.innerHTML).toBe('');
        unmount();
      }),
      { numRuns: 100 },
    );
  });
});
