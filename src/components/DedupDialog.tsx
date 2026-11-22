import { Alert, AlertDescription } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import type { DedupResult } from "../types";

interface DedupDialogProps {
  result: DedupResult;
  submitting?: boolean;
  error?: string | null;
  onSkip: () => void;
  onOverride: () => void;
  onCancel: () => void;
}

function matchTypeLabel(matchType: "secret" | "name_issuer"): string {
  return matchType === "secret" ? "密钥相同" : "名称和服务商相同";
}

export default function DedupDialog({
  result,
  submitting = false,
  error = null,
  onSkip,
  onOverride,
  onCancel,
}: DedupDialogProps) {
  const { unique, duplicates } = result;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="导入去重检测"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-2xl">
        <h2 className="mb-2 text-lg font-semibold text-card-foreground">
          检测到重复账户
        </h2>

        <p className="mb-4 text-sm text-muted-foreground">
          共 {unique.length + duplicates.length} 个账户，其中{" "}
          <span className="font-medium text-success-foreground">
            {unique.length} 个新账户
          </span>
          、
          <span className="font-medium text-warning-foreground">
            {duplicates.length} 个重复
          </span>
          。
        </p>

        {duplicates.length > 0 && (
          <ul className="mb-5 flex max-h-60 flex-col gap-2 overflow-y-auto">
            {duplicates.map((dup, idx) => (
              <li
                key={idx}
                className="rounded-xl border border-warning/30 bg-warning-surface px-3.5 py-2.5 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">
                    {dup.incoming.issuer
                      ? `${dup.incoming.issuer} - ${dup.incoming.name}`
                      : dup.incoming.name}
                  </span>
                  <Badge variant="warning">
                    {matchTypeLabel(dup.matchType)}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  已有：
                  {dup.existing.issuer
                    ? `${dup.existing.issuer} - ${dup.existing.name}`
                    : dup.existing.name}
                </div>
              </li>
            ))}
          </ul>
        )}

        {error && (
          <Alert variant="destructive" role="alert" className="mb-4">
            <AlertDescription className="opacity-100">{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            disabled={submitting}
            onClick={onCancel}
          >
            取消
          </Button>
          <Button
            disabled={submitting}
            onClick={onSkip}
          >
            {submitting ? "处理中..." : "跳过重复项"}
          </Button>
          <Button
            variant="pin"
            disabled={submitting}
            onClick={onOverride}
          >
            {submitting ? "处理中..." : "覆盖重复项"}
          </Button>
        </div>
      </div>
    </div>
  );
}
