import type { OTPAccount } from "../types";

/** 检查结果数据 */
export interface CheckResult {
  /** 密钥无效的账户列表 */
  invalidAccounts: Array<{
    account: OTPAccount;
    reason: string;
  }>;
  /** 重复账户分组列表 */
  duplicateGroups: Array<{
    accounts: OTPAccount[];
    matchType: "secret" | "name_issuer";
  }>;
}

interface CheckResultDialogProps {
  result: CheckResult;
  onClose: () => void;
}

function matchTypeLabel(matchType: "secret" | "name_issuer"): string {
  return matchType === "secret" ? "密钥相同" : "名称和服务商相同";
}

function accountLabel(account: OTPAccount): string {
  return account.issuer
    ? `${account.issuer} - ${account.name}`
    : account.name;
}

export default function CheckResultDialog({
  result,
  onClose,
}: CheckResultDialogProps) {
  const { invalidAccounts, duplicateGroups } = result;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="账户检查结果"
    >
      <div className="mx-4 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          检查结果
        </h2>

        <p className="mb-4 text-sm text-gray-600">
          发现{" "}
          <span className="font-medium text-red-600">
            {invalidAccounts.length} 个无效密钥
          </span>
          、
          <span className="font-medium text-orange-600">
            {duplicateGroups.length} 组重复账户
          </span>
          。
        </p>

        <div className="mb-5 max-h-72 space-y-4 overflow-y-auto">
          {invalidAccounts.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-gray-700">
                无效密钥
              </h3>
              <ul className="space-y-2">
                {invalidAccounts.map((item, idx) => (
                  <li
                    key={idx}
                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm"
                  >
                    <div className="font-medium text-gray-800">
                      {accountLabel(item.account)}
                    </div>
                    <div className="mt-1 text-xs text-red-600">
                      {item.reason}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {duplicateGroups.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-gray-700">
                重复账户
              </h3>
              <ul className="space-y-2">
                {duplicateGroups.map((group, idx) => (
                  <li
                    key={idx}
                    className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm"
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-medium text-gray-800">
                        {group.accounts.length} 个账户重复
                      </span>
                      <span className="ml-2 rounded bg-orange-200 px-1.5 py-0.5 text-xs text-orange-800">
                        {matchTypeLabel(group.matchType)}
                      </span>
                    </div>
                    <ul className="space-y-0.5">
                      {group.accounts.map((account) => (
                        <li key={account.id} className="text-xs text-gray-600">
                          {accountLabel(account)}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
