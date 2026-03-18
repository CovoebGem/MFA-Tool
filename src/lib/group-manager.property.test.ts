import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import type { Group, OTPAccount } from '../types';
import { ValidationError } from '../types';
import {
  DEFAULT_GROUP_ID,
  createDefaultGroup,
  createGroup,
  renameGroup,
  deleteGroup,
  filterByGroup,
  findOrCreateGroupByIssuer,
} from './group-manager';

// --- Generators ---

const base32CharArb = fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.split(''));
const base32SecretArb = fc.array(base32CharArb, { minLength: 16, maxLength: 32 }).map(chars => chars.join(''));

/** 生成非默认分组 */
const nonDefaultGroupArb: fc.Arbitrary<Group> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0 && !s.includes('\0')),
  isDefault: fc.constant(false),
  createdAt: fc.integer({ min: 0, max: Date.now() }),
});

/** 生成包含默认分组的分组列表（名称唯一） */
const groupListArb: fc.Arbitrary<Group[]> = fc
  .array(nonDefaultGroupArb, { minLength: 0, maxLength: 10 })
  .map((groups) => {
    const seen = new Set<string>(['默认']);
    const unique: Group[] = [];
    const seenIds = new Set<string>([DEFAULT_GROUP_ID]);
    for (const g of groups) {
      const trimmed = g.name.trim();
      if (!seen.has(trimmed) && !seenIds.has(g.id)) {
        seen.add(trimmed);
        seenIds.add(g.id);
        unique.push({ ...g, name: trimmed });
      }
    }
    return [createDefaultGroup(), ...unique];
  });

/** 生成 OTPAccount */
const otpAccountArb = (groupIds: string[]): fc.Arbitrary<OTPAccount> =>
  fc.record({
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
    groupId: groupIds.length > 0 ? fc.constantFrom(...groupIds) : fc.constant(DEFAULT_GROUP_ID),
  });


/**
 * Feature: sidebar-and-groups, Property 1: issuer 自动分组
 * **Validates: Requirements 2.2**
 *
 * 对于任意非空的 issuer 字符串和任意现有分组列表，调用 findOrCreateGroupByIssuer 后，
 * 返回的分组列表中应存在一个与 issuer 同名的分组，且返回的 groupId 应指向该分组。
 * 如果原列表中已有同名分组，则分组列表长度不变；如果没有，则长度增加 1。
 */
describe('Property 1: issuer 自动分组', () => {
  it('should find or create a group matching the issuer name', () => {
    fc.assert(
      fc.property(
        groupListArb,
        fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0 && !s.includes('\0')),
        (groups, issuer) => {
          const trimmedIssuer = issuer.trim();
          const hadExisting = groups.some(g => g.name === trimmedIssuer);
          const originalLength = groups.length;

          const result = findOrCreateGroupByIssuer(groups, issuer);

          // 返回的分组列表中应存在一个与 issuer 同名的分组
          const matchingGroup = result.groups.find(g => g.name === trimmedIssuer);
          expect(matchingGroup).toBeDefined();

          // 返回的 groupId 应指向该分组
          expect(result.groupId).toBe(matchingGroup!.id);

          // 长度检查
          if (hadExisting) {
            expect(result.groups).toHaveLength(originalLength);
          } else {
            expect(result.groups).toHaveLength(originalLength + 1);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Feature: sidebar-and-groups, Property 3: 创建分组验证与添加
 * **Validates: Requirements 4.2, 4.3**
 *
 * 对于任意现有分组列表和任意非空且不与已有分组重名的名称，调用 createGroup 后，
 * 返回的列表长度应增加 1，且新分组的 name 应等于输入名称。
 * 对于空名称或已存在的名称，createGroup 应抛出 ValidationError。
 */
describe('Property 3: 创建分组验证与添加', () => {
  it('should add a new group with the given name when valid', () => {
    fc.assert(
      fc.property(
        groupListArb,
        fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0 && !s.includes('\0')),
        (groups, rawName) => {
          const trimmedName = rawName.trim();
          const nameExists = groups.some(g => g.name === trimmedName);

          if (nameExists) {
            // 已存在的名称应抛出 ValidationError
            expect(() => createGroup(groups, rawName)).toThrow(ValidationError);
          } else {
            const result = createGroup(groups, rawName);
            // 长度增加 1
            expect(result).toHaveLength(groups.length + 1);
            // 新分组的 name 应等于 trimmed 输入名称
            const newGroup = result.find(g => !groups.some(og => og.id === g.id));
            expect(newGroup).toBeDefined();
            expect(newGroup!.name).toBe(trimmedName);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should throw ValidationError for empty names', () => {
    fc.assert(
      fc.property(
        groupListArb,
        fc.constantFrom('', '   ', '\t', '\n'),
        (groups, emptyName) => {
          expect(() => createGroup(groups, emptyName)).toThrow(ValidationError);
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Feature: sidebar-and-groups, Property 4: 按分组筛选
 * **Validates: Requirements 4.4**
 *
 * 对于任意账户列表和任意分组 ID，调用 filterByGroup 返回的每个账户的 groupId
 * 都应等于指定的分组 ID，且返回数量应等于原列表中 groupId 匹配的账户数量。
 */
describe('Property 4: 按分组筛选', () => {
  it('should return only accounts matching the groupId with correct count', () => {
    fc.assert(
      fc.property(
        groupListArb.chain(groups => {
          const groupIds = groups.map(g => g.id);
          return fc.tuple(
            fc.array(otpAccountArb(groupIds), { minLength: 0, maxLength: 20 }),
            fc.constantFrom(...groupIds),
          );
        }),
        ([accounts, groupId]) => {
          const result = filterByGroup(accounts, groupId);
          const expectedCount = accounts.filter(a => a.groupId === groupId).length;

          // 每个返回账户的 groupId 都等于指定的分组 ID
          for (const account of result) {
            expect(account.groupId).toBe(groupId);
          }

          // 返回数量等于原列表中匹配的数量
          expect(result).toHaveLength(expectedCount);
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Feature: sidebar-and-groups, Property 5: 删除分组迁移账户
 * **Validates: Requirements 4.5**
 *
 * 对于任意包含至少一个非默认分组的分组列表和任意账户列表，删除某个非默认分组后：
 * 返回的分组列表中不再包含该分组，原属于该分组的所有账户的 groupId 应变为 Default_Group 的 ID，
 * 其他账户的 groupId 不受影响。
 */
describe('Property 5: 删除分组迁移账户', () => {
  it('should remove the group and migrate its accounts to default group', () => {
    // 生成至少包含一个非默认分组的列表
    const groupsWithNonDefaultArb = groupListArb.filter(
      groups => groups.some(g => !g.isDefault),
    );

    fc.assert(
      fc.property(
        groupsWithNonDefaultArb.chain(groups => {
          const nonDefaultGroups = groups.filter(g => !g.isDefault);
          const groupIds = groups.map(g => g.id);
          const targetIdx = fc.integer({ min: 0, max: nonDefaultGroups.length - 1 });
          return fc.tuple(
            fc.constant(groups),
            targetIdx.map(i => nonDefaultGroups[i].id),
            fc.array(otpAccountArb(groupIds), { minLength: 0, maxLength: 20 }),
          );
        }),
        ([groups, targetGroupId, accounts]) => {
          const result = deleteGroup(groups, accounts, targetGroupId);

          // 返回的分组列表中不再包含该分组
          expect(result.groups.find(g => g.id === targetGroupId)).toBeUndefined();

          // 原属于该分组的账户 groupId 应变为 Default_Group 的 ID
          for (const account of result.accounts) {
            const original = accounts.find(a => a.id === account.id);
            if (original && original.groupId === targetGroupId) {
              expect(account.groupId).toBe(DEFAULT_GROUP_ID);
            }
          }

          // 其他账户的 groupId 不受影响
          for (const account of result.accounts) {
            const original = accounts.find(a => a.id === account.id);
            if (original && original.groupId !== targetGroupId) {
              expect(account.groupId).toBe(original.groupId);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});


/**
 * Feature: sidebar-and-groups, Property 6: 编辑分组名称
 * **Validates: Requirements 4.7**
 *
 * 对于任意现有分组列表中的非默认分组和任意非空且不与其他分组重名的新名称，
 * 调用 renameGroup 后，该分组的 name 应等于新名称，分组列表长度不变。
 * 对于空名称或已存在的名称，应抛出 ValidationError。
 */
describe('Property 6: 编辑分组名称', () => {
  it('should rename a non-default group when the new name is valid', () => {
    const groupsWithNonDefaultArb = groupListArb.filter(
      groups => groups.some(g => !g.isDefault),
    );

    fc.assert(
      fc.property(
        groupsWithNonDefaultArb.chain(groups => {
          const nonDefaultGroups = groups.filter(g => !g.isDefault);
          const targetIdx = fc.integer({ min: 0, max: nonDefaultGroups.length - 1 });
          const existingNames = new Set(groups.map(g => g.name));
          const newNameArb = fc.string({ minLength: 1, maxLength: 30 })
            .filter(s => s.trim().length > 0 && !s.includes('\0'))
            .map(s => s.trim())
            .filter(s => !existingNames.has(s));
          return fc.tuple(
            fc.constant(groups),
            targetIdx.map(i => nonDefaultGroups[i].id),
            newNameArb,
          );
        }),
        ([groups, targetGroupId, newName]) => {
          const result = renameGroup(groups, targetGroupId, newName);

          // 分组列表长度不变
          expect(result).toHaveLength(groups.length);

          // 该分组的 name 应等于新名称
          const renamed = result.find(g => g.id === targetGroupId);
          expect(renamed).toBeDefined();
          expect(renamed!.name).toBe(newName);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should throw ValidationError for empty new names', () => {
    const groupsWithNonDefaultArb = groupListArb.filter(
      groups => groups.some(g => !g.isDefault),
    );

    fc.assert(
      fc.property(
        groupsWithNonDefaultArb.chain(groups => {
          const nonDefaultGroups = groups.filter(g => !g.isDefault);
          const targetIdx = fc.integer({ min: 0, max: nonDefaultGroups.length - 1 });
          return fc.tuple(
            fc.constant(groups),
            targetIdx.map(i => nonDefaultGroups[i].id),
            fc.constantFrom('', '   ', '\t'),
          );
        }),
        ([groups, targetGroupId, emptyName]) => {
          expect(() => renameGroup(groups, targetGroupId, emptyName)).toThrow(ValidationError);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should throw ValidationError for duplicate names', () => {
    // 需要至少 2 个非默认分组才能测试重名
    const groupsWithMultipleArb = groupListArb.filter(
      groups => groups.filter(g => !g.isDefault).length >= 2,
    );

    fc.assert(
      fc.property(
        groupsWithMultipleArb.chain(groups => {
          const nonDefaultGroups = groups.filter(g => !g.isDefault);
          // 选一个分组来重命名，用另一个分组的名字
          return fc.tuple(
            fc.constant(groups),
            fc.integer({ min: 0, max: nonDefaultGroups.length - 1 }),
          ).chain(([grps, idx]) => {
            const target = nonDefaultGroups[idx];
            const otherNames = grps.filter(g => g.id !== target.id).map(g => g.name);
            if (otherNames.length === 0) return fc.constant(null);
            return fc.tuple(
              fc.constant(grps),
              fc.constant(target.id),
              fc.constantFrom(...otherNames),
            );
          }).filter((v): v is [Group[], string, string] => v !== null);
        }),
        ([groups, targetGroupId, duplicateName]) => {
          expect(() => renameGroup(groups, targetGroupId, duplicateName)).toThrow(ValidationError);
        },
      ),
      { numRuns: 100 },
    );
  });
});


// --- Mock Tauri invoke for Property 7 ---

let storedGroupsData = '[]';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args?: any) => {
    if (cmd === 'read_groups') return storedGroupsData;
    if (cmd === 'write_groups') {
      storedGroupsData = args.data;
      return;
    }
  }),
}));

/**
 * Feature: sidebar-and-groups, Property 7: 分组数据 round-trip
 * **Validates: Requirements 6.2**
 *
 * 对于任意有效的 Group 数组，调用 saveGroups 写入后，
 * 调用 loadGroups 读取应得到与原始数组深度相等的结果。
 */
describe('Property 7: 分组数据 round-trip', () => {
  beforeEach(() => {
    storedGroupsData = '[]';
  });

  /** 生成至少包含一个元素的 Group 数组（避免 loadGroups 对空数组返回 [defaultGroup] 的行为） */
  const nonEmptyGroupArrayArb: fc.Arbitrary<Group[]> = fc
    .array(nonDefaultGroupArb, { minLength: 1, maxLength: 10 })
    .map((groups) => {
      const seen = new Set<string>();
      const seenIds = new Set<string>();
      const unique: Group[] = [];
      for (const g of groups) {
        const trimmed = g.name.trim();
        if (trimmed && !seen.has(trimmed) && !seenIds.has(g.id)) {
          seen.add(trimmed);
          seenIds.add(g.id);
          unique.push({ ...g, name: trimmed });
        }
      }
      return unique.length > 0 ? unique : [{ id: 'test-id', name: 'Test', isDefault: false, createdAt: 1000 }];
    });

  it('should round-trip any valid non-empty Group array through save/load', async () => {
    const { saveGroups, loadGroups } = await import('./group-manager');

    await fc.assert(
      fc.asyncProperty(
        nonEmptyGroupArrayArb,
        async (groups) => {
          await saveGroups(groups);
          const loaded = await loadGroups();
          expect(loaded).toEqual(groups);
        },
      ),
      { numRuns: 100 },
    );
  });
});
