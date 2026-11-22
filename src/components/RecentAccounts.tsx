import { Clock, KeyRound } from "lucide-react";
import { getRecentAccounts } from "../lib/dashboard-utils";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "./ui/frame";
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
    <Frame>
      <FrameHeader>
        <div className="flex items-center gap-2">
          <Clock className="size-4 text-muted-foreground" aria-hidden="true" />
          <FrameTitle>最近添加</FrameTitle>
        </div>
      </FrameHeader>
      <FramePanel className="overflow-hidden p-0">
        <ul className="divide-y divide-border/70">
          {recent.map((account) => (
            <li
              key={account.id}
              className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/35"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <KeyRound className="size-4" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {account.issuer}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {account.name}
                  </p>
                </div>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {formatRelativeTime(account.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      </FramePanel>
    </Frame>
  );
}
