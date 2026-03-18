import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import type { OTPAccount } from "../types";
import {
  checkDuplicates,
  skipDuplicates,
  overrideDuplicates,
  findInternalDuplicates,
} from "./dedup-checker";

// --- Generators ---

const base32CharArb = fc.constantFrom(
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".split(""),
);
const base32SecretArb = fc
  .array(base32CharArb, { minLength: 16, maxLength: 32 })
  .map((chars) => chars.join(""));

const otpAccountArb = (overrides?: Partial<Record<keyof OTPAccount, fc.Arbitrary<unknown>>>): fc.Arbitrary<OTPAccount> =>
  fc.record({
    id: fc.uuid(),
    issuer: overrides?.issuer ?? fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.includes("\0")),
    name: overrides?.name ?? fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.includes("\0")),
    secret: overrides?.secret ?? base32SecretArb,
    type: fc.constantFrom("totp" as const, "hotp" as const),
    counter: fc.integer({ min: 0, max: 1000000 }),
    algorithm: fc.constant("SHA1" as const),
    digits: fc.constantFrom(6, 8),
    period: fc.constantFrom(30, 60),
    createdAt: fc.integer({ min: 0, max: Date.now() }),
    groupId: fc.uuid(),
  }) as fc.Arbitrary<OTPAccount>;

/**
 * Generate a list of accounts with unique secrets AND unique name+issuer combos.
 * This avoids ambiguity in dedup matching.
 */
function uniqueAccountListArb(
  minLength: number,
  maxLength: number,
): fc.Arbitrary<OTPAccount[]> {
  return fc
    .array(otpAccountArb(), { minLength, maxLength })
    .map((accounts) => {
      const seenSecrets = new Set<string>();
      const seenNameIssuer = new Set<string>();
      const result: OTPAccount[] = [];
      for (const acc of accounts) {
        const nameIssuerKey = `${acc.name}|||${acc.issuer}`;
        if (!seenSecrets.has(acc.secret) && !seenNameIssuer.has(nameIssuerKey)) {
          seenSecrets.add(acc.secret);
          seenNameIssuer.add(nameIssuerKey);
          result.push(acc);
        }
      }
      return result;
    });
}

/**
 * Feature: sidebar-and-groups, Property 9: 去重检测完整性
 * **Validates: Requirements 8.1, 8.2**
 *
 * 对于任意已有账户列表和待导入账户列表，调用 checkDuplicates 后：
 * unique 列表和 duplicates 列表的 incoming 账户合并后应等于原始待导入列表（无遗漏无多余）。
 * duplicates 中每个条目的 matchType 为 "secret" 时，incoming.secret 应等于 existing.secret；
 * matchType 为 "name_issuer" 时，incoming.name 和 incoming.issuer 应分别等于 existing.name 和 existing.issuer。
 */
describe("Property 9: 去重检测完整性", () => {
  it("should partition incoming into unique + duplicates without loss or extras", () => {
    fc.assert(
      fc.property(
        uniqueAccountListArb(0, 15),
        fc.array(otpAccountArb(), { minLength: 0, maxLength: 15 }),
        (existing, incoming) => {
          const result = checkDuplicates(existing, incoming);

          // Merge unique + duplicates.incoming should equal incoming (same order)
          const merged = [
            ...result.unique,
            ...result.duplicates.map((d) => d.incoming),
          ];

          // Every incoming account should appear exactly once in merged
          // We check by reconstructing the original order
          const incomingIds = incoming.map((a) => a.id);
          const mergedIds = merged.map((a) => a.id);

          // Same set of ids
          expect(mergedIds.sort()).toEqual(incomingIds.sort());
          // Same count
          expect(merged).toHaveLength(incoming.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("should have correct matchType for each duplicate entry", () => {
    fc.assert(
      fc.property(
        uniqueAccountListArb(0, 15),
        fc.array(otpAccountArb(), { minLength: 0, maxLength: 15 }),
        (existing, incoming) => {
          const result = checkDuplicates(existing, incoming);

          for (const dup of result.duplicates) {
            if (dup.matchType === "secret") {
              expect(dup.incoming.secret).toBe(dup.existing.secret);
            } else if (dup.matchType === "name_issuer") {
              expect(dup.incoming.name).toBe(dup.existing.name);
              expect(dup.incoming.issuer).toBe(dup.existing.issuer);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Feature: sidebar-and-groups, Property 10: 跳过重复项
 * **Validates: Requirements 8.4**
 *
 * 对于任意去重结果，skipDuplicates 返回的列表应与 DedupResult.unique 完全相同。
 */
describe("Property 10: 跳过重复项", () => {
  it("should return exactly the unique list from DedupResult", () => {
    fc.assert(
      fc.property(
        uniqueAccountListArb(0, 15),
        fc.array(otpAccountArb(), { minLength: 0, maxLength: 15 }),
        (existing, incoming) => {
          const result = checkDuplicates(existing, incoming);
          const skipped = skipDuplicates(result);

          expect(skipped).toEqual(result.unique);
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Feature: sidebar-and-groups, Property 11: 覆盖重复项
 * **Validates: Requirements 8.5**
 *
 * 对于任意已有账户列表和去重结果，overrideDuplicates 返回的列表中：
 * 对于每个 duplicate 条目，列表中应包含 incoming 账户（替换了 existing），
 * 且所有 unique 账户也应存在于列表中。
 * 返回列表的总长度应等于已有列表长度加上 unique 列表长度。
 */
describe("Property 11: 覆盖重复项", () => {
  it("should have correct total length: existing.length + unique.length", () => {
    fc.assert(
      fc.property(
        uniqueAccountListArb(0, 15),
        fc.array(otpAccountArb(), { minLength: 0, maxLength: 15 }),
        (existing, incoming) => {
          const result = checkDuplicates(existing, incoming);
          const overridden = overrideDuplicates(existing, result);

          expect(overridden).toHaveLength(
            existing.length + result.unique.length,
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it("should contain all incoming accounts from duplicates (replacing existing)", () => {
    fc.assert(
      fc.property(
        uniqueAccountListArb(0, 15),
        fc.array(otpAccountArb(), { minLength: 0, maxLength: 15 }),
        (existing, incoming) => {
          const result = checkDuplicates(existing, incoming);
          const overridden = overrideDuplicates(existing, result);
          const overriddenIds = new Set(overridden.map((a) => a.id));

          // Each duplicate's incoming should be in the result
          for (const dup of result.duplicates) {
            expect(overriddenIds.has(dup.incoming.id)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("should contain all unique accounts", () => {
    fc.assert(
      fc.property(
        uniqueAccountListArb(0, 15),
        fc.array(otpAccountArb(), { minLength: 0, maxLength: 15 }),
        (existing, incoming) => {
          const result = checkDuplicates(existing, incoming);
          const overridden = overrideDuplicates(existing, result);
          const overriddenIds = new Set(overridden.map((a) => a.id));

          // Each unique account should be in the result
          for (const acc of result.unique) {
            expect(overriddenIds.has(acc.id)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});


/**
 * Feature: account-toolbar, Property 3: 内部重复检测正确性
 * **Validates: Requirements 2.2**
 *
 * 对于任意 OTPAccount 列表，findInternalDuplicates 返回的重复分组应满足：
 * 同一分组内的所有账户共享相同的 secret 或相同的 name+issuer 组合，
 * 且列表中所有具有相同 secret 或相同 name+issuer 的账户都被归入某个重复分组。
 */
describe("Property 3: 内部重复检测正确性", () => {
  it("should group accounts that share the same secret correctly", () => {
    fc.assert(
      fc.property(
        fc.array(otpAccountArb(), { minLength: 0, maxLength: 20 }),
        (accounts) => {
          const groups = findInternalDuplicates(accounts);
          const secretGroups = groups.filter((g) => g.matchType === "secret");

          for (const group of secretGroups) {
            // All accounts in a secret group must share the same secret
            const secrets = new Set(group.accounts.map((a) => a.secret));
            expect(secrets.size).toBe(1);
            // Group must have at least 2 accounts (otherwise it's not a duplicate)
            expect(group.accounts.length).toBeGreaterThanOrEqual(2);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("should group accounts that share the same name+issuer correctly", () => {
    fc.assert(
      fc.property(
        fc.array(otpAccountArb(), { minLength: 0, maxLength: 20 }),
        (accounts) => {
          const groups = findInternalDuplicates(accounts);
          const nameIssuerGroups = groups.filter(
            (g) => g.matchType === "name_issuer",
          );

          for (const group of nameIssuerGroups) {
            // All accounts in a name_issuer group must share the same name+issuer
            const keys = new Set(
              group.accounts.map((a) => `${a.name}\0${a.issuer}`),
            );
            expect(keys.size).toBe(1);
            expect(group.accounts.length).toBeGreaterThanOrEqual(2);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("should capture all accounts with duplicate secrets into some group", () => {
    fc.assert(
      fc.property(
        fc.array(otpAccountArb(), { minLength: 0, maxLength: 20 }),
        (accounts) => {
          const groups = findInternalDuplicates(accounts);
          const secretGroups = groups.filter((g) => g.matchType === "secret");

          // Build expected: all secrets that appear more than once
          const secretCounts = new Map<string, OTPAccount[]>();
          for (const acc of accounts) {
            if (!secretCounts.has(acc.secret)) {
              secretCounts.set(acc.secret, []);
            }
            secretCounts.get(acc.secret)!.push(acc);
          }

          for (const [secret, accs] of secretCounts) {
            if (accs.length > 1) {
              // There must be a secret group containing all these accounts
              const matchingGroup = secretGroups.find(
                (g) => g.accounts[0].secret === secret,
              );
              expect(matchingGroup).toBeDefined();
              const groupIds = new Set(matchingGroup!.accounts.map((a) => a.id));
              for (const acc of accs) {
                expect(groupIds.has(acc.id)).toBe(true);
              }
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("should capture all accounts with duplicate name+issuer into some group", () => {
    fc.assert(
      fc.property(
        fc.array(otpAccountArb(), { minLength: 0, maxLength: 20 }),
        (accounts) => {
          const groups = findInternalDuplicates(accounts);

          // Build expected: all name+issuer combos that appear more than once
          const niCounts = new Map<string, OTPAccount[]>();
          for (const acc of accounts) {
            const key = `${acc.name}\0${acc.issuer}`;
            if (!niCounts.has(key)) {
              niCounts.set(key, []);
            }
            niCounts.get(key)!.push(acc);
          }

          for (const [, accs] of niCounts) {
            if (accs.length > 1) {
              // These accounts should appear in either a secret group or a name_issuer group
              // (if all share the same secret, they'll be in a secret group only)
              const allInSecretGroup = new Set(accs.map((a) => a.secret)).size === 1;
              if (allInSecretGroup) {
                // Should be covered by a secret group
                const secretGroups = groups.filter((g) => g.matchType === "secret");
                const matchingGroup = secretGroups.find(
                  (g) => g.accounts[0].secret === accs[0].secret,
                );
                expect(matchingGroup).toBeDefined();
                const groupIds = new Set(matchingGroup!.accounts.map((a) => a.id));
                for (const acc of accs) {
                  expect(groupIds.has(acc.id)).toBe(true);
                }
              } else {
                // Should be covered by a name_issuer group
                const niGroups = groups.filter((g) => g.matchType === "name_issuer");
                const niKey = `${accs[0].name}\0${accs[0].issuer}`;
                const matchingGroup = niGroups.find(
                  (g) =>
                    `${g.accounts[0].name}\0${g.accounts[0].issuer}` === niKey,
                );
                expect(matchingGroup).toBeDefined();
                const groupIds = new Set(matchingGroup!.accounts.map((a) => a.id));
                for (const acc of accs) {
                  expect(groupIds.has(acc.id)).toBe(true);
                }
              }
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
