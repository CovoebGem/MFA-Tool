import { getRecentAccounts } from "../lib/dashboard-utils";
import type { OTPAccount } from "../types";

interface RecentAccountsProps {
  accounts: OTPAccount[];
}

/**
 * 将时间戳格式化为相对时间字符串
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  return `${days} 天前`;
}

export default function RecentAccounts({ accounts }: RecentAccountsProps) {
  const recent = getRecentAccounts(accounts);

  if (recent.length === 0) {
    return null;
  }

  return (
    <div className="mt-6">
      <h3 className="mb-3 text-sm font-medium text-gray-700">最近添加</h3>
      <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white shadow-sm">
        {recent.map((account) => (
          <li
            key={account.id}
            className="flex items-center justify-between px-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-900">
                {account.issuer}
              </p>
              <p className="truncate text-xs text-gray-500">{account.name}</p>
            </div>
            <span className="shrink-0 text-xs text-gray-400">
              {formatRelativeTime(account.createdAt)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
