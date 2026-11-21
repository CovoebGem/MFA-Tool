import { useCallback } from "react";
import ImageUploader from "./ImageUploader";
import ManualAddForm from "./ManualAddForm";
import Dashboard from "./Dashboard";
import RecentAccounts from "./RecentAccounts";
import { findOrCreateGroupByIssuer } from "../lib/group-manager";
import { checkDuplicates } from "../lib/dedup-checker";
import type { OTPAccount, Group, DedupResult } from "../types";

interface HomePageProps {
  accounts: OTPAccount[];
  groups: Group[];
  onAccountsAdded: (accounts: OTPAccount[]) => Promise<void>;
  onGroupsUpdated: (groups: Group[]) => Promise<void>;
  onCommitAutoGroupedAccounts?: (incomingAccounts: OTPAccount[]) => Promise<OTPAccount[]>;
  onDedupDetected: (result: DedupResult, newGroups: Group[], rawIncoming?: OTPAccount[]) => void;
  onToast: (message: string, type: "success" | "error") => void;
}

export default function HomePage({
  accounts,
  groups,
  onAccountsAdded,
  onGroupsUpdated,
  onCommitAutoGroupedAccounts,
  onDedupDetected,
  onToast,
}: HomePageProps) {
  const assignGroupsByIssuer = useCallback(
    (incomingAccounts: OTPAccount[]) => {
      let currentGroups = groups;

      const groupedAccounts = incomingAccounts.map((account) => {
        const result = findOrCreateGroupByIssuer(currentGroups, account.issuer);
        currentGroups = result.groups;
        return { ...account, groupId: result.groupId };
      });

      return { groupedAccounts, nextGroups: currentGroups };
    },
    [groups],
  );

  /**
   * 图片导入回调：
   * 1. 为每个账户按 issuer 自动分组
   * 2. 去重检测
   * 3. 有重复 → onDedupDetected；无重复 → 同一事务写入分组和账户
   */
  const handleImageDecoded = useCallback(
    async (decoded: OTPAccount[]) => {
      const { groupedAccounts, nextGroups } = assignGroupsByIssuer(decoded);

      // 去重检测
      const dedupResult = checkDuplicates(accounts, groupedAccounts);

      if (dedupResult.duplicates.length > 0) {
        onDedupDetected(dedupResult, nextGroups, decoded);
        return;
      }

      try {
        const added = onCommitAutoGroupedAccounts
          ? await onCommitAutoGroupedAccounts(dedupResult.unique)
          : await (async () => {
              if (nextGroups !== groups) {
                await onGroupsUpdated(nextGroups);
              }
              await onAccountsAdded(dedupResult.unique);
              return dedupResult.unique;
            })();
        onToast(`成功添加 ${added.length} 个账户`, "success");
      } catch (err) {
        onToast(err instanceof Error ? err.message : "添加账户失败", "error");
      }
    },
    [
      accounts,
      assignGroupsByIssuer,
      groups,
      onAccountsAdded,
      onCommitAutoGroupedAccounts,
      onDedupDetected,
      onGroupsUpdated,
      onToast,
    ],
  );

  /**
   * 手动添加回调：按 issuer 自动分组，并在持久化成功后提示，失败保留表单输入
   */
  const handleManualAdd = useCallback(
    async (newAccounts: OTPAccount[]) => {
      try {
        const added = onCommitAutoGroupedAccounts
          ? await onCommitAutoGroupedAccounts(newAccounts)
          : await (async () => {
              const { groupedAccounts, nextGroups } = assignGroupsByIssuer(newAccounts);
              if (nextGroups !== groups) {
                await onGroupsUpdated(nextGroups);
              }
              await onAccountsAdded(groupedAccounts);
              return groupedAccounts;
            })();
        const name = added[0]?.name ?? "未知";
        onToast(`成功添加账户: ${name}`, "success");
      } catch (err) {
        onToast(err instanceof Error ? err.message : "添加账户失败", "error");
        throw err;
      }
    },
    [
      assignGroupsByIssuer,
      groups,
      onAccountsAdded,
      onCommitAutoGroupedAccounts,
      onGroupsUpdated,
      onToast,
    ],
  );

  return (
    <div className="pt-6 px-4">
      <Dashboard accounts={accounts} groups={groups} />
      <div className="grid gap-6 md:grid-cols-2">
        <ImageUploader onAccountsDecoded={handleImageDecoded} />
        <ManualAddForm onAccountAdded={handleManualAdd} />
      </div>
      <RecentAccounts accounts={accounts} />
    </div>
  );
}