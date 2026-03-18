import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import type { OTPAccount } from '../types';

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

// --- Mock Tauri invoke for Property 3 ---

let storedData = '[]';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args?: any) => {
    if (cmd === 'read_accounts') return storedData;
    if (cmd === 'write_accounts') {
      storedData = args.data;
      return;
    }
  }),
}));

/**
 * Feature: mfa-tool, Property 3: 文件存储 round-trip
 * Validates: Requirements 3.1, 3.2, 3.5
 *
 * 对于任意有效的 OTPAccount 数组，调用 saveAccounts 写入后，
 * 调用 loadAccounts 读取应得到与原始数组深度相等的结果。
 */
describe('Property 3: 文件存储 round-trip', () => {
  beforeEach(() => {
    storedData = '[]';
  });

  it('should round-trip any valid OTPAccount array through save/load', async () => {
    const { saveAccounts, loadAccounts } = await import('./account-manager');

    await fc.assert(
      fc.asyncProperty(
        fc.array(otpAccountArb, { minLength: 0, maxLength: 20 }),
        async (accounts) => {
          await saveAccounts(accounts);
          const loaded = await loadAccounts();
          expect(loaded).toEqual(accounts);
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Feature: mfa-tool, Property 4: 添加账户增长列表
 * Validates: Requirements 2.1
 *
 * 对于任意现有账户列表和任意有效的新 OTPAccount 列表，
 * 调用 addAccounts 后，返回的列表长度应等于原列表长度加上新增账户数量，
 * 且新增的每个账户都应存在于返回列表中。
 */
describe('Property 4: 添加账户增长列表', () => {
  it('should grow the list by the number of new accounts and contain all new accounts', async () => {
    const { addAccounts } = await import('./account-manager');

    fc.assert(
      fc.property(
        fc.array(otpAccountArb, { minLength: 0, maxLength: 20 }),
        fc.array(otpAccountArb, { minLength: 0, maxLength: 10 }),
        (existing, newAccounts) => {
          const result = addAccounts(existing, newAccounts);

          // 长度等于原列表 + 新增数量
          expect(result).toHaveLength(existing.length + newAccounts.length);

          // 每个新增账户都存在于结果中
          for (const account of newAccounts) {
            expect(result).toContainEqual(account);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Feature: mfa-tool, Property 5: 删除账户缩减列表
 * Validates: Requirements 3.4
 *
 * 对于任意包含至少一个账户的列表和其中任意一个账户的 id，
 * 调用 removeAccount 后，返回的列表长度应等于原列表长度减一，
 * 且该 id 不再存在于返回列表中。
 */
describe('Property 5: 删除账户缩减列表', () => {
  it('should shrink the list by one and remove the specified account id', async () => {
    const { removeAccount } = await import('./account-manager');

    // 生成至少一个账户的列表，并确保 id 唯一
    const uniqueAccountsArb = fc
      .array(otpAccountArb, { minLength: 1, maxLength: 20 })
      .map((accounts) => {
        // 确保 id 唯一
        const seen = new Set<string>();
        return accounts.filter((a) => {
          if (seen.has(a.id)) return false;
          seen.add(a.id);
          return true;
        });
      })
      .filter((accounts) => accounts.length >= 1);

    fc.assert(
      fc.property(
        uniqueAccountsArb.chain((accounts) =>
          fc.tuple(
            fc.constant(accounts),
            fc.integer({ min: 0, max: accounts.length - 1 }),
          ),
        ),
        ([accounts, index]) => {
          const targetId = accounts[index].id;
          const result = removeAccount(accounts, targetId);

          // 长度减一
          expect(result).toHaveLength(accounts.length - 1);

          // 该 id 不再存在
          expect(result.every((a) => a.id !== targetId)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});


/**
 * Feature: sidebar-and-groups, Property 2: 移动账户到分组
 * Validates: Requirements 3.2
 *
 * 对于任意账户列表中的任意账户和任意有效的目标分组 ID，
 * 调用 moveAccountToGroup 后，该账户的 groupId 应等于目标分组 ID，
 * 且列表中其他账户的 groupId 不受影响。
 */
describe('Property 2: 移动账户到分组', () => {
  // 生成至少一个账户且 id 唯一的列表
  const uniqueAccountsArb = fc
    .array(otpAccountArb, { minLength: 1, maxLength: 20 })
    .map((accounts) => {
      const seen = new Set<string>();
      return accounts.filter((a) => {
        if (seen.has(a.id)) return false;
        seen.add(a.id);
        return true;
      });
    })
    .filter((accounts) => accounts.length >= 1);

  const targetGroupIdArb = fc.string({ minLength: 1, maxLength: 20 });

  it('目标账户的 groupId 应等于目标 groupId', async () => {
    const { moveAccountToGroup } = await import('./account-manager');

    fc.assert(
      fc.property(
        uniqueAccountsArb.chain((accounts) =>
          fc.tuple(
            fc.constant(accounts),
            fc.integer({ min: 0, max: accounts.length - 1 }),
            targetGroupIdArb,
          ),
        ),
        ([accounts, index, newGroupId]) => {
          const targetId = accounts[index].id;
          const result = moveAccountToGroup(accounts, targetId, newGroupId);
          const moved = result.find((a) => a.id === targetId);
          expect(moved).toBeDefined();
          expect(moved!.groupId).toBe(newGroupId);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('其他账户的 groupId 不受影响', async () => {
    const { moveAccountToGroup } = await import('./account-manager');

    fc.assert(
      fc.property(
        uniqueAccountsArb.chain((accounts) =>
          fc.tuple(
            fc.constant(accounts),
            fc.integer({ min: 0, max: accounts.length - 1 }),
            targetGroupIdArb,
          ),
        ),
        ([accounts, index, newGroupId]) => {
          const targetId = accounts[index].id;
          const result = moveAccountToGroup(accounts, targetId, newGroupId);

          for (let i = 0; i < accounts.length; i++) {
            if (accounts[i].id !== targetId) {
              expect(result[i].groupId).toBe(accounts[i].groupId);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('列表长度保持不变', async () => {
    const { moveAccountToGroup } = await import('./account-manager');

    fc.assert(
      fc.property(
        uniqueAccountsArb.chain((accounts) =>
          fc.tuple(
            fc.constant(accounts),
            fc.integer({ min: 0, max: accounts.length - 1 }),
            targetGroupIdArb,
          ),
        ),
        ([accounts, index, newGroupId]) => {
          const targetId = accounts[index].id;
          const result = moveAccountToGroup(accounts, targetId, newGroupId);
          expect(result).toHaveLength(accounts.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});
