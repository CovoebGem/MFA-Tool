import { useCallback } from "react";
import ImageUploader from "./ImageUploader";
import ManualAddForm from "./ManualAddForm";
import { findOrCreateGroupByIssuer } from "../lib/group-manager";
import { checkDuplicates } from "../lib/dedup-checker";
import type { OTPAccount, Group, DedupResult } from "../types";

interface HomePageProps {
  accounts: OTPAccount[];
  groups: Group[];
  onAccountsAdded: (accounts: OTPAccount[]) => void;
  onGroupsUpdated: (groups: Group[]) => void;
  onDedupDetected: (result: DedupResult, newGroups: Group[]) => void;
}

export default function HomePage({
  accounts,
  groups,
  onAccountsAdded,
  onGroupsUpdated,
  onDedupDetected,
}: HomePageProps) {
  /**
   * 图片导入回调：
   * 1. 为每个账户按 issuer 自动分组
   * 2. 去重检测
   * 3. 有重复 → onDedupDetected；无重复 → 直接添加
   */
  const handleImageDecoded = useCallback(
    (decoded: OTPAccount[]) => {
      let currentGroups = groups;

      // 为每个账户分配 groupId
      const grouped = decoded.map((account) => {
        const result = findOrCreateGroupByIssuer(currentGroups, account.issuer);
        currentGroups = result.groups;
        return { ...account, groupId: result.groupId };
      });

      // 去重检测
      const dedupResult = checkDuplicates(accounts, grouped);

      if (dedupResult.duplicates.length > 0) {
        // 有重复，交给父组件处理（显示 DedupDialog）
        onDedupDetected(dedupResult, currentGroups);
      } else {
        // 无重复，直接添加
        onAccountsAdded(dedupResult.unique);
        onGroupsUpdated(currentGroups);
      }
    },
    [accounts, groups, onAccountsAdded, onGroupsUpdated, onDedupDetected],
  );

  /**
   * 手动添加回调：groupId 已在 ManualAddForm 中设为 "default"，直接添加
   */
  const handleManualAdd = useCallback(
    (newAccounts: OTPAccount[]) => {
      onAccountsAdded(newAccounts);
    },
    [onAccountsAdded],
  );

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <ImageUploader onAccountsDecoded={handleImageDecoded} />
      <ManualAddForm onAccountAdded={handleManualAdd} />
    </div>
  );
}
