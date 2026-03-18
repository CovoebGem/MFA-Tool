import type { OTPAccount, DedupResult } from "../types";

/** 内部重复检测的分组结果 */
export interface DuplicateGroup {
  accounts: OTPAccount[];
  matchType: "secret" | "name_issuer";
}

/**
 * 检测导入账户中的重复项
 * 优先匹配 secret 字段，其次匹配 name + issuer 组合
 */
export function checkDuplicates(
  existing: OTPAccount[],
  incoming: OTPAccount[],
): DedupResult {
  const unique: OTPAccount[] = [];
  const duplicates: DedupResult["duplicates"] = [];

  for (const inc of incoming) {
    // 优先检查 secret 匹配
    const secretMatch = existing.find((ex) => ex.secret === inc.secret);
    if (secretMatch) {
      duplicates.push({
        incoming: inc,
        existing: secretMatch,
        matchType: "secret",
      });
      continue;
    }

    // 其次检查 name + issuer 组合匹配
    const nameIssuerMatch = existing.find(
      (ex) => ex.name === inc.name && ex.issuer === inc.issuer,
    );
    if (nameIssuerMatch) {
      duplicates.push({
        incoming: inc,
        existing: nameIssuerMatch,
        matchType: "name_issuer",
      });
      continue;
    }

    unique.push(inc);
  }

  return { unique, duplicates };
}

/**
 * 应用去重决策：跳过重复项，仅返回非重复账户
 */
export function skipDuplicates(result: DedupResult): OTPAccount[] {
  return result.unique;
}

/**
 * 应用去重决策：覆盖重复项
 * 在已有列表中用 incoming 替换 existing，然后追加 unique 账户
 */
export function overrideDuplicates(
  existing: OTPAccount[],
  result: DedupResult,
): OTPAccount[] {
  const updated = existing.map((ex) => {
    const dup = result.duplicates.find((d) => d.existing.id === ex.id);
    return dup ? dup.incoming : ex;
  });

  return [...updated, ...result.unique];
}

/**
 * 检测账户列表内部的重复项
 * 按 secret 和 name+issuer 分组，返回存在重复的分组
 */
export function findInternalDuplicates(
  accounts: OTPAccount[],
): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];

  // 按 secret 分组
  const bySecret = new Map<string, OTPAccount[]>();
  for (const account of accounts) {
    const key = account.secret;
    if (!bySecret.has(key)) {
      bySecret.set(key, []);
    }
    bySecret.get(key)!.push(account);
  }
  for (const accs of bySecret.values()) {
    if (accs.length > 1) {
      groups.push({ accounts: accs, matchType: "secret" });
    }
  }

  // 按 name+issuer 分组（排除已被 secret 匹配的重复对）
  const byNameIssuer = new Map<string, OTPAccount[]>();
  for (const account of accounts) {
    const key = `${account.name}\0${account.issuer}`;
    if (!byNameIssuer.has(key)) {
      byNameIssuer.set(key, []);
    }
    byNameIssuer.get(key)!.push(account);
  }
  for (const accs of byNameIssuer.values()) {
    if (accs.length > 1) {
      // 过滤掉所有账户都已在同一个 secret 分组中的情况
      const secrets = new Set(accs.map((a) => a.secret));
      if (secrets.size === 1) {
        // 所有账户 secret 相同，已被 secret 分组覆盖，跳过
        continue;
      }
      groups.push({ accounts: accs, matchType: "name_issuer" });
    }
  }

  return groups;
}

