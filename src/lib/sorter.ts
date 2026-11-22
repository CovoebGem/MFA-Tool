import type { OTPAccount, SortConfig } from "../types";

export type SortMode = "auto" | "custom";

export function isAccountPinned(account: Pick<OTPAccount, "pinned">): boolean {
  return account.pinned === true;
}

export function sortAccounts(
  accounts: OTPAccount[],
  config: SortConfig,
  mode: SortMode = "auto",
): OTPAccount[] {
  const { field, direction } = config;
  const modifier = direction === "asc" ? 1 : -1;

  return [...accounts].sort((a, b) => {
    const aPinned = isAccountPinned(a);
    const bPinned = isAccountPinned(b);
    if (aPinned !== bPinned) {
      return aPinned ? -1 : 1;
    }

    if (mode === "custom") {
      const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      if (aPinned) {
        return (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0);
      }
      return 0;
    }

    const cmp =
      field === "createdAt"
        ? (a.createdAt - b.createdAt) * modifier
        : a[field].localeCompare(b[field]) * modifier;

    if (cmp !== 0) {
      return cmp;
    }

    if (aPinned) {
      return (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0);
    }

    return 0;
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
