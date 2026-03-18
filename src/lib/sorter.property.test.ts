import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { OTPAccount, SortConfig, SortField, SortDirection } from '../types';
import { sortAccounts } from './sorter';

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

const sortFieldArb: fc.Arbitrary<SortField> = fc.constantFrom('name', 'issuer', 'createdAt');
const sortDirectionArb: fc.Arbitrary<SortDirection> = fc.constantFrom('asc', 'desc');

const sortConfigArb: fc.Arbitrary<SortConfig> = fc.record({
  field: sortFieldArb,
  direction: sortDirectionArb,
});

/**
 * Feature: sidebar-and-groups, Property 8: 排序正确性
 * **Validates: Requirements 7.1, 7.3, 7.4**
 *
 * 对于任意账户列表和任意排序配置（field 为 name/issuer/createdAt，direction 为 asc/desc），
 * 调用 sortAccounts 后：返回的列表长度与原列表相同，包含相同的元素集合，
 * 且相邻元素按指定字段和方向有序。对同一列表分别以 asc 和 desc 排序，结果应互为逆序。
 */
describe('Property 8: 排序正确性', () => {
  it('should preserve list length after sorting', () => {
    fc.assert(
      fc.property(accountListArb, sortConfigArb, (accounts, config) => {
        const sorted = sortAccounts(accounts, config);
        expect(sorted).toHaveLength(accounts.length);
      }),
      { numRuns: 100 },
    );
  });

  it('should preserve the same set of elements (by id)', () => {
    fc.assert(
      fc.property(accountListArb, sortConfigArb, (accounts, config) => {
        const sorted = sortAccounts(accounts, config);
        const originalIds = accounts.map(a => a.id).sort();
        const sortedIds = sorted.map(a => a.id).sort();
        expect(sortedIds).toEqual(originalIds);
      }),
      { numRuns: 100 },
    );
  });

  it('should order adjacent elements correctly by the specified field and direction', () => {
    fc.assert(
      fc.property(accountListArb, sortConfigArb, (accounts, config) => {
        const sorted = sortAccounts(accounts, config);
        const { field, direction } = config;

        for (let i = 0; i < sorted.length - 1; i++) {
          if (field === 'createdAt') {
            const diff = sorted[i].createdAt - sorted[i + 1].createdAt;
            if (direction === 'asc') {
              expect(diff).toBeLessThanOrEqual(0);
            } else {
              expect(diff).toBeGreaterThanOrEqual(0);
            }
          } else {
            const cmp = sorted[i][field].localeCompare(sorted[i + 1][field]);
            if (direction === 'asc') {
              expect(cmp).toBeLessThanOrEqual(0);
            } else {
              expect(cmp).toBeGreaterThanOrEqual(0);
            }
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('should produce reversed field values when sorting asc vs desc', () => {
    fc.assert(
      fc.property(accountListArb, sortFieldArb, (accounts, field) => {
        const ascSorted = sortAccounts(accounts, { field, direction: 'asc' });
        const descSorted = sortAccounts(accounts, { field, direction: 'desc' });

        // 比较排序字段值的序列应互为逆序
        const ascValues = ascSorted.map(a => a[field]);
        const descValues = descSorted.map(a => a[field]);
        expect(descValues).toEqual([...ascValues].reverse());
      }),
      { numRuns: 100 },
    );
  });
});
