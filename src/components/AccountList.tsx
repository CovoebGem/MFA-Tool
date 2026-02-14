import AccountCard from "./AccountCard";
import type { OTPAccount } from "../types";

interface AccountListProps {
  accounts: OTPAccount[];
  onDelete: (id: string) => void;
}

export default function AccountList({ accounts, onDelete }: AccountListProps) {
  if (accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <svg
          className="w-16 h-16 mb-4"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
          />
        </svg>
        <p className="text-base font-medium mb-1">暂无账户</p>
        <p className="text-sm">请上传二维码或手动添加</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {accounts.map((account) => (
        <AccountCard key={account.id} account={account} onDelete={onDelete} />
      ))}
    </div>
  );
}
