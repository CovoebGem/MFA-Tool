import protobuf from "protobufjs";
import type { OTPAccount } from "../types";
import { ParseError } from "../types";
import { isValidBase32 } from "./validators";

// Base32 字符表（RFC 4648，无填充）
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * 将 Uint8Array 字节数组转换为无填充的 base32 编码字符串
 * @param bytes - 字节数组
 * @returns base32 编码字符串（无填充）
 */
export function bytesToBase32(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";

  let bits = 0;
  let value = 0;
  let result = "";

  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;

    while (bits >= 5) {
      bits -= 5;
      result += BASE32_ALPHABET[(value >>> bits) & 0x1f];
    }
  }

  // 处理剩余不足 5 位的部分
  if (bits > 0) {
    result += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }

  return result;
}

// 使用 protobufjs 的 JSON 描述符内联定义 protobuf 结构
// 避免运行时加载 .proto 文件的兼容性问题
const protoRoot = protobuf.Root.fromJSON({
  nested: {
    googleauth: {
      nested: {
        Algorithm: {
          values: {
            ALGORITHM_UNSPECIFIED: 0,
            SHA1: 1,
          },
        },
        DigitCount: {
          values: {
            DIGIT_COUNT_UNSPECIFIED: 0,
            SIX: 1,
            EIGHT: 2,
          },
        },
        OtpType: {
          values: {
            OTP_TYPE_UNSPECIFIED: 0,
            HOTP: 1,
            TOTP: 2,
          },
        },
        OtpParameters: {
          fields: {
            secret: { type: "bytes", id: 1 },
            name: { type: "string", id: 2 },
            issuer: { type: "string", id: 3 },
            algorithm: { type: "Algorithm", id: 4 },
            digits: { type: "DigitCount", id: 5 },
            type: { type: "OtpType", id: 6 },
            counter: { type: "int64", id: 7 },
          },
        },
        MigrationPayload: {
          fields: {
            otpParameters: {
              rule: "repeated",
              type: "OtpParameters",
              id: 1,
            },
          },
        },
      },
    },
  },
});

const MigrationPayload = protoRoot.lookupType(
  "googleauth.MigrationPayload"
);

/**
 * OtpType 枚举值到 OTPAccount.type 的映射
 */
function mapOtpType(typeValue: number): "totp" | "hotp" {
  if (typeValue === 1) return "hotp";
  // 默认 totp（包括 0=UNSPECIFIED 和 2=TOTP）
  return "totp";
}

/**
 * DigitCount 枚举值到数字位数的映射
 */
function mapDigits(digitValue: number): number {
  if (digitValue === 2) return 8;
  // 默认 6（包括 0=UNSPECIFIED 和 1=SIX）
  return 6;
}

/**
 * 解析 otpauth-migration:// URL，反序列化 protobuf 数据
 * @param migrationUrl - otpauth-migration://offline?data=xxx 格式的 URL
 * @returns OTP 账户数组
 * @throws ParseError 当 protobuf 反序列化失败时
 */
export function parseMigrationUrl(migrationUrl: string): OTPAccount[] {
  let url: URL;
  try {
    url = new URL(migrationUrl);
  } catch {
    throw new ParseError("无效的 migration URL 格式");
  }

  if (!url.searchParams.has("data")) {
    throw new ParseError("migration URL 缺少 data 参数");
  }
  const dataParam = url.searchParams.get("data") || "";

  let binaryStr: string;
  try {
    binaryStr = atob(dataParam);
  } catch {
    throw new ParseError("data 参数 base64 解码失败");
  }

  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  let payload: protobuf.Message;
  try {
    payload = MigrationPayload.decode(bytes);
  } catch {
    throw new ParseError("protobuf 反序列化失败，数据格式无效");
  }

  const payloadObj = MigrationPayload.toObject(payload, {
    bytes: Uint8Array,
    longs: Number,
    defaults: true,
  }) as {
    otpParameters: Array<{
      secret: Uint8Array;
      name: string;
      issuer: string;
      algorithm: number;
      digits: number;
      type: number;
      counter: number;
    }>;
  };

  const otpParams = payloadObj.otpParameters || [];

  return otpParams.map((param) => {
    const secretBytes =
      param.secret instanceof Uint8Array
        ? param.secret
        : new Uint8Array(0);

    return {
      id: crypto.randomUUID(),
      issuer: param.issuer || "",
      name: param.name || "",
      secret: bytesToBase32(secretBytes),
      type: mapOtpType(param.type),
      counter: Number(param.counter) || 0,
      algorithm: "SHA1" as const,
      digits: mapDigits(param.digits),
      period: 30,
      createdAt: Date.now(),
      groupId: "default",
    };
  });
}

/**
 * 解析标准 otpauth:// URL
 * @param otpauthUrl - otpauth://totp/name?secret=xxx&issuer=xxx 格式的 URL
 * @returns 单个 OTP 账户
 * @throws ParseError 当 URL 格式无效或缺少必要参数时
 */
export function parseOtpauthUrl(otpauthUrl: string): OTPAccount {
  let url: URL;
  try {
    url = new URL(otpauthUrl);
  } catch {
    throw new ParseError("无效的 otpauth URL 格式");
  }

  if (url.protocol !== "otpauth:") {
    throw new ParseError("URL 必须以 otpauth:// 开头");
  }

  const type = url.hostname;
  if (type !== "totp" && type !== "hotp") {
    throw new ParseError(`不支持的类型 "${type}"，仅支持 totp 或 hotp`);
  }

  const secret = url.searchParams.get("secret");
  if (!secret) {
    throw new ParseError("缺少必要参数 secret");
  }

  if (!isValidBase32(secret)) {
    throw new ParseError("secret 参数不是有效的 base32 编码");
  }

  // 解析路径中的 name，可能包含 issuer 前缀（如 issuer:name）
  let pathName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  let issuer = url.searchParams.get("issuer") || "";
  let name = pathName;

  // 如果 name 包含 ":" 分隔符，提取 issuer 和 name
  if (pathName.includes(":")) {
    const colonIndex = pathName.indexOf(":");
    const pathIssuer = pathName.substring(0, colonIndex).trim();
    name = pathName.substring(colonIndex + 1).trim();
    // 如果 URL 参数中没有 issuer，使用路径中的
    if (!issuer) {
      issuer = pathIssuer;
    }
  }

  const counter = parseInt(url.searchParams.get("counter") || "0", 10);
  const digits = parseInt(url.searchParams.get("digits") || "6", 10);
  const period = parseInt(url.searchParams.get("period") || "30", 10);

  return {
    id: crypto.randomUUID(),
    issuer,
    name,
    secret: secret.toUpperCase(),
    type: type as "totp" | "hotp",
    counter: isNaN(counter) ? 0 : counter,
    algorithm: "SHA1",
    digits: isNaN(digits) ? 6 : digits,
    period: isNaN(period) ? 30 : period,
    createdAt: Date.now(),
    groupId: "default",
  };
}

/**
 * 解析二维码内容字符串，自动识别 URL 类型并返回 OTP 账户列表
 * @param qrContent - 二维码解码后的字符串
 * @returns OTP 账户数组
 * @throws ParseError 当格式无效时
 */
export function parseQRContent(qrContent: string): OTPAccount[] {
  if (!qrContent || qrContent.trim().length === 0) {
    throw new ParseError("二维码内容为空");
  }

  const trimmed = qrContent.trim();

  if (trimmed.startsWith("otpauth-migration://")) {
    return parseMigrationUrl(trimmed);
  }

  if (trimmed.startsWith("otpauth://")) {
    return [parseOtpauthUrl(trimmed)];
  }

  throw new ParseError(
    "不支持的二维码格式，仅支持 otpauth:// 和 otpauth-migration:// URL"
  );
}
