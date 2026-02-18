import type { OTPAccount, SortConfig } from "../types";

export type SortMode = "auto" | "custom";

export function sortAccounts(
  accounts: OTPAccount[],
  config: SortConfig,
  mode: SortMode = "auto",
): OTPAccount[] {
  if (mode === "custom") {
    return [...accounts].sort((a, b) => {
      const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
      return orderA - orderB;
    });
  }

  const { field, direction } = config;
  const modifier = direction === "asc" ? 1 : -1;

  return [...accounts].sort((a, b) => {
    if (field === "createdAt") {
      return (a.createdAt - b.createdAt) * modifier;
    }
    return a[field].localeCompare(b[field]) * modifier;
  });
}

export function reorderAccounts(
  accounts: OTPAccount[],
  fromIndex: number,
  toIndex: number,
): OTPAccount[] {
  const result = [...accounts];
  const [moved] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, moved);

  return result.map((account, index) => ({
    ...account,
    order: index,
  }));
}

export function initializeAccountOrder(accounts: OTPAccount[]): OTPAccount[] {
  return accounts.map((account, index) => ({
    ...account,
    order: account.order ?? index,
  }));
}
