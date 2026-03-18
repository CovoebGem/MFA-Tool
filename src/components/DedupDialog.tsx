import type { DedupResult } from "../types";

interface DedupDialogProps {
  result: DedupResult;
  onSkip: () => void;
  onOverride: () => void;
  onCancel: () => void;
}

function matchTypeLabel(matchType: "secret" | "name_issuer"): string {
  return matchType === "secret" ? "密钥相同" : "名称和服务商相同";
}

export default function DedupDialog({
  result,
  onSkip,
  onOverride,
  onCancel,
}: DedupDialogProps) {
  const { unique, duplicates } = result;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="导入去重检测"
    >
      <div className="mx-4 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          检测到重复账户
        </h2>

        <p className="mb-4 text-sm text-gray-600">
          共 {unique.length + duplicates.length} 个账户，其中{" "}
          <span className="font-medium text-green-600">
            {unique.length} 个新账户
          </span>
          、
          <span className="font-medium text-orange-600">
            {duplicates.length} 个重复
          </span>
          。
        </p>

        {duplicates.length > 0 && (
          <ul className="mb-5 max-h-60 space-y-2 overflow-y-auto">
            {duplicates.map((dup, idx) => (
              <li
                key={idx}
                className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-800">
                    {dup.incoming.issuer
                      ? `${dup.incoming.issuer} - ${dup.incoming.name}`
                      : dup.incoming.name}
                  </span>
                  <span className="ml-2 rounded bg-orange-200 px-1.5 py-0.5 text-xs text-orange-800">
                    {matchTypeLabel(dup.matchType)}
                  </span>
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  已有：
                  {dup.existing.issuer
                    ? `${dup.existing.issuer} - ${dup.existing.name}`
                    : dup.existing.name}
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            取消
          </button>
          <button
            onClick={onSkip}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
          >
            跳过重复项
          </button>
          <button
            onClick={onOverride}
            className="rounded-lg bg-orange-600 px-4 py-2 text-sm text-white hover:bg-orange-700"
          >
            覆盖重复项
          </button>
        </div>
      </div>
    </div>
  );
}
