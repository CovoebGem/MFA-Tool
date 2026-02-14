import { describe, it, expect } from 'vitest';
import { ValidationError } from '../types';
import type { Group, OTPAccount } from '../types';
import {
  DEFAULT_GROUP_ID,
  createDefaultGroup,
  getDefaultGroup,
  createGroup,
  renameGroup,
  deleteGroup,
  filterByGroup,
  findOrCreateGroupByIssuer,
} from './group-manager';

// --- 辅助函数 ---

function makeGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    name: overrides.name ?? 'TestGroup',
    isDefault: overrides.isDefault ?? false,
    createdAt: overrides.createdAt ?? Date.now(),
  };
}

const defaultGroup = createDefaultGroup();

// --- Tests ---

/**
 * Validates: Requirements 4.6
 */
describe('deleteGroup - 默认分组不可删除', () => {
  it('应在尝试删除默认分组时抛出 ValidationError', () => {
    const groups = [defaultGroup];
    const accounts: OTPAccount[] = [];

    expect(() => deleteGroup(groups, accounts, DEFAULT_GROUP_ID)).toThrow(ValidationError);
  });

  it('抛出的 ValidationError 应包含正确的 field', () => {
    const groups = [defaultGroup];
    try {
      deleteGroup(groups, [], DEFAULT_GROUP_ID);
      expect.fail('应抛出 ValidationError');
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as ValidationError).field).toBe('groupId');
    }
  });
});

/**
 * Validates: Requirements 2.4
 */
describe('findOrCreateGroupByIssuer - 空 issuer 归入默认分组', () => {
  it('空字符串 issuer 应返回默认分组 ID', () => {
    const groups = [defaultGroup];
    const result = findOrCreateGroupByIssuer(groups, '');

    expect(result.groupId).toBe(DEFAULT_GROUP_ID);
    expect(result.groups).toHaveLength(groups.length);
  });

  it('仅包含空格的 issuer 应返回默认分组 ID', () => {
    const groups = [defaultGroup];
    const result = findOrCreateGroupByIssuer(groups, '   ');

    expect(result.groupId).toBe(DEFAULT_GROUP_ID);
    expect(result.groups).toHaveLength(groups.length);
  });
});

describe('createGroup - 名称验证', () => {
  it('空名称应抛出 ValidationError', () => {
    const groups = [defaultGroup];
    expect(() => createGroup(groups, '')).toThrow(ValidationError);
  });

  it('仅空格的名称应抛出 ValidationError', () => {
    const groups = [defaultGroup];
    expect(() => createGroup(groups, '   ')).toThrow(ValidationError);
  });

  it('重复名称应抛出 ValidationError', () => {
    const existing = makeGroup({ name: 'GitHub' });
    const groups = [defaultGroup, existing];

    expect(() => createGroup(groups, 'GitHub')).toThrow(ValidationError);
  });
});

describe('renameGroup - 名称验证', () => {
  it('空名称应抛出 ValidationError', () => {
    const group = makeGroup({ name: 'OldName' });
    const groups = [defaultGroup, group];

    expect(() => renameGroup(groups, group.id, '')).toThrow(ValidationError);
  });

  it('不存在的分组 ID 应抛出 ValidationError', () => {
    const groups = [defaultGroup];

    expect(() => renameGroup(groups, 'non-existent-id', 'NewName')).toThrow(ValidationError);
  });
});

describe('deleteGroup - 不存在的分组', () => {
  it('不存在的分组 ID 应抛出 ValidationError', () => {
    const groups = [defaultGroup];

    expect(() => deleteGroup(groups, [], 'non-existent-id')).toThrow(ValidationError);
  });
});

describe('filterByGroup - 空列表', () => {
  it('空账户列表应返回空数组', () => {
    const result = filterByGroup([], 'any-group-id');
    expect(result).toEqual([]);
  });
});

describe('getDefaultGroup - 无默认分组', () => {
  it('分组列表中无默认分组时应返回新的默认分组', () => {
    const groups = [makeGroup({ isDefault: false })];
    const result = getDefaultGroup(groups);

    expect(result.id).toBe(DEFAULT_GROUP_ID);
    expect(result.isDefault).toBe(true);
    expect(result.name).toBe('默认');
  });
});
