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
  onDedupDetected: (result: DedupResult, newGroups: Group[]) => void;
  onToast: (message: string, type: "success" | "error") => void;
}

export default function HomePage({
  accounts,
  groups,
  onAccountsAdded,
  onGroupsUpdated,
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
   * 3. 有重复 → onDedupDetected；无重复 → 直接添加
   */
  const handleImageDecoded = useCallback(
    async (decoded: OTPAccount[]) => {
      const { groupedAccounts, nextGroups } = assignGroupsByIssuer(decoded);

      // 去重检测
      const dedupResult = checkDuplicates(accounts, groupedAccounts);

      if (dedupResult.duplicates.length > 0) {
        // 有重复，交给父组件处理（显示 DedupDialog）
        onDedupDetected(dedupResult, nextGroups);
      } else {
        const tasks = [onAccountsAdded(dedupResult.unique)];
        if (nextGroups !== groups) {
          tasks.push(onGroupsUpdated(nextGroups));
        }

        await Promise.all(tasks);
        onToast(`成功添加 ${dedupResult.unique.length} 个账户`, "success");
      }
    },
    [accounts, assignGroupsByIssuer, groups, onAccountsAdded, onGroupsUpdated, onDedupDetected, onToast],
  );

  /**
   * 手动添加回调：按 issuer 自动分组，必要时创建新分组
   */
  const handleManualAdd = useCallback(
    async (newAccounts: OTPAccount[]) => {
      const { groupedAccounts, nextGroups } = assignGroupsByIssuer(newAccounts);
      const tasks = [onAccountsAdded(groupedAccounts)];

      if (nextGroups !== groups) {
        tasks.push(onGroupsUpdated(nextGroups));
      }

      await Promise.all(tasks);
      const name = groupedAccounts[0]?.name ?? "未知";
      onToast(`成功添加账户: ${name}`, "success");
    },
    [assignGroupsByIssuer, groups, onAccountsAdded, onGroupsUpdated, onToast],
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
