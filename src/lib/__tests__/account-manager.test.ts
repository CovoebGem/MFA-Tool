import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { OTPAccount } from '../../types';
import { moveAccountsToGroup } from '../account-manager';

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
  groupId: fc.string({ minLength: 1, maxLength: 20 }),
});

// 生成唯一 ID 的账户列表
const uniqueAccountsArb = fc
  .array(otpAccountArb, { minLength: 0, maxLength: 20 })
  .map((accounts) => {
    const seen = new Set<string>();
    return accounts.filter((a) => {
      if (seen.has(a.id)) return false;
      seen.add(a.id);
      return true;
    });
  });

const targetGroupIdArb = fc.string({ minLength: 1, maxLength: 20 });

/**
 * Feature: batch-move-group, Property 1: 批量移动纯函数正确性
 * Validates: Requirements 4.1, 4.6
 *
 * For any 账户列表、任意账户 ID 子集和任意目标分组 ID，调用 moveAccountsToGroup 后：
 * - 所有 ID 在子集中的账户的 groupId 应等于目标分组 ID
 * - 所有 ID 不在子集中的账户应保持原有 groupId 不变
 * - 返回的账户列表长度应与原列表相同
 */
describe('Feature: batch-move-group, Property 1: 批量移动纯函数正确性', () => {
  it('所有选中账户的 groupId 应等于目标分组 ID', () => {
    fc.assert(
      fc.property(
        uniqueAccountsArb.chain((accounts) =>
          fc.tuple(
            fc.constant(accounts),
            fc.subarray(accounts.map((a) => a.id)),
            targetGroupIdArb,
          ),
        ),
        ([accounts, selectedIds, targetGroupId]) => {
          const result = moveAccountsToGroup(accounts, selectedIds, targetGroupId);
          const selectedSet = new Set(selectedIds);

          for (const account of result) {
            if (selectedSet.has(account.id)) {
              expect(account.groupId).toBe(targetGroupId);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('所有未选中账户的 groupId 应保持不变', () => {
    fc.assert(
      fc.property(
        uniqueAccountsArb.chain((accounts) =>
          fc.tuple(
            fc.constant(accounts),
            fc.subarray(accounts.map((a) => a.id)),
            targetGroupIdArb,
          ),
        ),
        ([accounts, selectedIds, targetGroupId]) => {
          const result = moveAccountsToGroup(accounts, selectedIds, targetGroupId);
          const selectedSet = new Set(selectedIds);

          for (let i = 0; i < accounts.length; i++) {
            if (!selectedSet.has(accounts[i].id)) {
              expect(result[i].groupId).toBe(accounts[i].groupId);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('返回的账户列表长度应与原列表相同', () => {
    fc.assert(
      fc.property(
        uniqueAccountsArb.chain((accounts) =>
          fc.tuple(
            fc.constant(accounts),
            fc.subarray(accounts.map((a) => a.id)),
            targetGroupIdArb,
          ),
        ),
        ([accounts, selectedIds, targetGroupId]) => {
          const result = moveAccountsToGroup(accounts, selectedIds, targetGroupId);
          expect(result).toHaveLength(accounts.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});
