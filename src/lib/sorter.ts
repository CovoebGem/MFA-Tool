import type { OTPAccount, SortConfig, SortMode } from "../types";

export type { SortMode };

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

  const compareByConfig = (a: OTPAccount, b: OTPAccount) =>
    field === "createdAt"
      ? (a.createdAt - b.createdAt) * modifier
      : a[field].localeCompare(b[field]) * modifier;

  return [...accounts].sort((a, b) => {
    const aPinned = isAccountPinned(a);
    const bPinned = isAccountPinned(b);
    if (aPinned !== bPinned) {
      return aPinned ? -1 : 1;
    }

    if (mode === "custom") {
      const orderA =
        typeof a.order === "number" && Number.isFinite(a.order)
          ? a.order
          : Number.MAX_SAFE_INTEGER;
      const orderB =
        typeof b.order === "number" && Number.isFinite(b.order)
          ? b.order
          : Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      const fallbackCmp = compareByConfig(a, b);
      if (fallbackCmp !== 0) {
        return fallbackCmp;
      }
      if (aPinned) {
        return (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0);
      }
      return 0;
    }

    const cmp = compareByConfig(a, b);
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

export function resolveSameSectionDraggedIds(
  accounts: readonly OTPAccount[],
  anchorId: string,
  selectedIds?: ReadonlySet<string>,
): Set<string> {
  if (!selectedIds || selectedIds.size === 0 || !selectedIds.has(anchorId)) {
    return new Set([anchorId]);
  }

  const anchor = accounts.find((account) => account.id === anchorId);
  if (!anchor) {
    return new Set([anchorId]);
  }

  const anchorPinned = isAccountPinned(anchor);
  const result = new Set<string>([anchorId]);
  for (const account of accounts) {
    if (selectedIds.has(account.id) && isAccountPinned(account) === anchorPinned) {
      result.add(account.id);
    }
  }
  return result;
}

export function collapseDraggedAccountGroup(
  accounts: readonly OTPAccount[],
  anchorId: string,
  draggedIds: ReadonlySet<string>,
): { collapsed: OTPAccount[]; draggedAccounts: OTPAccount[]; anchorIndex: number } {
  const draggedAccounts: OTPAccount[] = [];
  const collapsed: OTPAccount[] = [];
  let anchorIndex = -1;

  for (const account of accounts) {
    if (draggedIds.has(account.id)) {
      draggedAccounts.push(account);
      if (account.id === anchorId) {
        anchorIndex = collapsed.length;
        collapsed.push(account);
      }
    } else {
      collapsed.push(account);
    }
  }

  return { collapsed, draggedAccounts, anchorIndex };
}

export function expandDraggedAccountGroup(
  collapsedAccounts: readonly OTPAccount[],
  anchorId: string,
  draggedAccounts: readonly OTPAccount[],
): OTPAccount[] {
  if (draggedAccounts.length === 0) {
    return collapsedAccounts.map((account, index) => ({
      ...account,
      order: index,
    }));
  }

  const anchorIndex = collapsedAccounts.findIndex((account) => account.id === anchorId);
  if (anchorIndex === -1) {
    return collapsedAccounts.map((account, index) => ({
      ...account,
      order: index,
    }));
  }

  const expanded = [
    ...collapsedAccounts.slice(0, anchorIndex),
    ...draggedAccounts,
    ...collapsedAccounts.slice(anchorIndex + 1),
  ];

  return expanded.map((account, index) => ({
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
