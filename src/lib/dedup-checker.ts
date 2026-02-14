import type { OTPAccount, DedupResult } from "../types";

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
