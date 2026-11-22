import { LockKeyhole } from "lucide-react";
import AccountCard from "./AccountCard";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "./ui/empty";
import type { OTPAccount } from "../types";

interface AccountListProps {
  accounts: OTPAccount[];
  onDelete: (id: string) => void;
}

export default function AccountList({ accounts, onDelete }: AccountListProps) {
  if (accounts.length === 0) {
    return (
      <Empty className="py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LockKeyhole aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>暂无账户</EmptyTitle>
          <EmptyDescription>请上传二维码或手动添加</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="grid gap-3.5 grid-cols-[repeat(auto-fill,minmax(310px,1fr))]">
      {accounts.map((account) => (
        <AccountCard
          key={account.id}
          account={account}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
