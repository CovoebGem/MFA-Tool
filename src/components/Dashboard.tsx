import { computeStats } from "../lib/dashboard-utils";
import type { OTPAccount, Group } from "../types";

interface DashboardProps {
  accounts: OTPAccount[];
  groups: Group[];
}

export default function Dashboard({ accounts, groups }: DashboardProps) {
  const stats = computeStats(accounts, groups);

  if (stats.totalAccounts === 0) {
    return (
      <div className="mb-6 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 p-6 text-center">
        <svg
          className="mx-auto mb-3 h-10 w-10 text-gray-400 dark:text-gray-500"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 4.5v15m7.5-7.5h-15"
          />
        </svg>
        <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
          还没有任何账户
        </p>
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
          通过上传二维码图片或手动输入来添加你的第一个 2FA 账户
        </p>
      </div>
    );
  }

  return (
    <div className="mb-6 grid grid-cols-3 gap-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">账户总数</p>
        <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">
          {stats.totalAccounts}
        </p>
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">分组总数</p>
        <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">
          {stats.totalGroups}
        </p>
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">近 7 天新增</p>
        <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">
          {stats.recentCount}
        </p>
      </div>
    </div>
  );
}
