export interface OTPAccount {
  /** 唯一标识符，使用 crypto.randomUUID() 生成 */
  id: string;
  /** 服务提供商名称，如 "Google"、"GitHub" */
  issuer: string;
  /** 账户名称，如邮箱地址 */
  name: string;
  /** base32 编码的密钥（无填充） */
  secret: string;
  /** OTP 类型 */
  type: "totp" | "hotp";
  /** HOTP 计数器值，仅 type 为 hotp 时有意义 */
  counter: number;
  /** 算法，默认 SHA-1 */
  algorithm: "SHA1";
  /** 验证码位数，默认 6 */
  digits: number;
  /** 时间步长（秒），默认 30，仅 TOTP 有意义 */
  period: number;
  /** 创建时间戳 */
  createdAt: number;
  /** 所属分组 ID，默认为 Default_Group 的 ID */
  groupId: string;
}

/** 分组 */
export interface Group {
  /** 唯一标识符 */
  id: string;
  /** 分组名称 */
  name: string;
  /** 是否为默认分组，默认分组不可删除 */
  isDefault: boolean;
  /** 创建时间戳 */
  createdAt: number;
}

/** 页面路由类型 */
export type Page = "home" | "accounts" | "groups" | "temp";

/** 排序字段 */
export type SortField = "name" | "issuer" | "createdAt";

/** 排序方向 */
export type SortDirection = "asc" | "desc";

/** 排序配置 */
export interface SortConfig {
  field: SortField;
  direction: SortDirection;
}

/** 去重检测结果 */
export interface DedupResult {
  /** 非重复的新账户 */
  unique: OTPAccount[];
  /** 重复的账户及其匹配的已有账户 */
  duplicates: Array<{
    incoming: OTPAccount;
    existing: OTPAccount;
    matchType: "secret" | "name_issuer";
  }>;
}

export class QRDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QRDecodeError";
  }
}

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseError";
  }
}

export class ValidationError extends Error {
  field: string;
  constructor(message: string, field: string) {
    super(message);
    this.name = "ValidationError";
    this.field = field;
  }
}
