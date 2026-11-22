import { FolderKanban, KeyRound, ShieldPlus, Sparkles } from "lucide-react";
import { computeStats } from "../lib/dashboard-utils";
import { Card, CardContent } from "./ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "./ui/empty";
import type { OTPAccount, Group } from "../types";

interface DashboardProps {
  accounts: OTPAccount[];
  groups: Group[];
}

export default function Dashboard({ accounts, groups }: DashboardProps) {
  const stats = computeStats(accounts, groups);

  if (stats.totalAccounts === 0) {
    return (
      <Empty className="py-10">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ShieldPlus aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>还没有任何账户</EmptyTitle>
          <EmptyDescription>
            通过上传二维码图片或手动输入来添加你的第一个 2FA 账户
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Card>
        <CardContent className="flex items-center justify-between pt-5">
          <div>
            <p className="text-xs font-medium text-muted-foreground">账户总数</p>
            <p className="mt-1.5 text-2xl font-bold tracking-tight text-foreground tabular-nums">
              {stats.totalAccounts}
            </p>
          </div>
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <KeyRound className="size-5" aria-hidden="true" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center justify-between pt-5">
          <div>
            <p className="text-xs font-medium text-muted-foreground">分组总数</p>
            <p className="mt-1.5 text-2xl font-bold tracking-tight text-foreground tabular-nums">
              {stats.totalGroups}
            </p>
          </div>
          <div className="flex size-10 items-center justify-center rounded-xl bg-info-surface text-info-foreground">
            <FolderKanban className="size-5" aria-hidden="true" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center justify-between pt-5">
          <div>
            <p className="text-xs font-medium text-muted-foreground">近 7 天新增</p>
            <p className="mt-1.5 text-2xl font-bold tracking-tight text-foreground tabular-nums">
              {stats.recentCount}
            </p>
          </div>
          <div className="flex size-10 items-center justify-center rounded-xl bg-success-surface text-success-foreground">
            <Sparkles className="size-5" aria-hidden="true" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
