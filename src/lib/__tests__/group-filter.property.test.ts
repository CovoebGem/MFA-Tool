import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { OTPAccount } from '../../types';
import { filterByGroup, DEFAULT_GROUP_ID } from '../group-manager';

// --- Generators ---

const base32CharArb = fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.split(''));
const base32SecretArb = fc.array(base32CharArb, { minLength: 16, maxLength: 32 }).map(chars => chars.join(''));

/** 生成随机分组 ID 列表（至少包含 default） */
const groupIdsArb: fc.Arbitrary<string[]> = fc
  .array(fc.uuid(), { minLength: 0, maxLength: 5 })
  .map(ids => [DEFAULT_GROUP_ID, ...ids]);

/** 生成 OTPAccount，groupId 从给定列表中随机选取 */
const otpAccountArb = (groupIds: string[]): fc.Arbitrary<OTPAccount> =>
  fc.record({
    id: fc.uuid(),
    issuer: fc.string({ minLength: 0, maxLength: 20 }),
    name: fc.string({ minLength: 0, maxLength: 20 }),
    secret: base32SecretArb,
    type: fc.constantFrom('totp' as const, 'hotp' as const),
    counter: fc.integer({ min: 0, max: 1000000 }),
    algorithm: fc.constant('SHA1' as const),
    digits: fc.constantFrom(6, 8),
    period: fc.constantFrom(30, 60),
    createdAt: fc.integer({ min: 0, max: Date.now() }),
    groupId: groupIds.length > 0 ? fc.constantFrom(...groupIds) : fc.constant(DEFAULT_GROUP_ID),
  });

// Feature: group-dropdown-and-preferences, Property 1: 分组过滤正确性

/**
 * Feature: group-dropdown-and-preferences, Property 1: 分组过滤正确性
 * **Validates: Requirements 1.2**
 *
 * 对于任意分组 ID 和任意账户集合，通过 filterByGroup 过滤后返回的账户列表中，
 * 每个账户的 groupId 都应等于所选分组 ID，且不遗漏任何属于该分组的账户。
 */
describe('Property 1: 分组过滤正确性', () => {
  it('过滤结果中每个账户的 groupId 都等于所选分组 ID，且不遗漏匹配账户', () => {
    fc.assert(
      fc.property(
        groupIdsArb.chain(groupIds =>
          fc.tuple(
            fc.array(otpAccountArb(groupIds), { minLength: 0, maxLength: 20 }),
            fc.constantFrom(...groupIds),
          ),
        ),
        ([accounts, selectedGroupId]) => {
          const result = filterByGroup(accounts, selectedGroupId);

          // 1. 每个返回账户的 groupId 都等于所选分组 ID（无误选）
          for (const account of result) {
            expect(account.groupId).toBe(selectedGroupId);
          }

          // 2. 不遗漏任何属于该分组的账户（无遗漏）
          const expectedCount = accounts.filter(a => a.groupId === selectedGroupId).length;
          expect(result).toHaveLength(expectedCount);

          // 3. 返回的账户都来自原始列表（无凭空创造）
          const originalIds = new Set(accounts.map(a => a.id));
          for (const account of result) {
            expect(originalIds.has(account.id)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('当没有账户属于指定分组时，返回空数组', () => {
    fc.assert(
      fc.property(
        groupIdsArb.chain(groupIds =>
          fc.tuple(
            fc.array(otpAccountArb(groupIds), { minLength: 0, maxLength: 20 }),
            fc.uuid().filter(id => !groupIds.includes(id)),
          ),
        ),
        ([accounts, nonExistentGroupId]) => {
          const result = filterByGroup(accounts, nonExistentGroupId);
          expect(result).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
