import jsQR from "jsqr";
import { QRDecodeError } from "../types";

const SUPPORTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/bmp",
  "image/webp",
];

/**
 * 将图片 File 或 Blob 加载为 ImageData
 */
function loadImageData(blob: Blob): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new QRDecodeError("无法创建 Canvas 上下文"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(imageData);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new QRDecodeError("图片加载失败"));
    };
    img.src = url;
  });
}

/**
 * 从图片文件解码二维码
 * @param file - 用户上传的图片文件
 * @returns 二维码内容字符串
 * @throws QRDecodeError 当文件不是图片或无法识别二维码时
 */
export async function decodeQRFromFile(file: File): Promise<string> {
  if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
    throw new QRDecodeError(
      "请上传有效的图片文件（PNG、JPG、GIF）",
    );
  }

  const imageData = await loadImageData(file);
  return decodeQRFromImageData(imageData);
}

/**
 * 从 ImageData 解码二维码
 * @param imageData - Canvas ImageData 对象
 * @returns 二维码内容字符串
 * @throws QRDecodeError 当无法识别二维码时
 */
export function decodeQRFromImageData(imageData: ImageData): string {
  const result = jsQR(imageData.data, imageData.width, imageData.height);
  if (!result) {
    throw new QRDecodeError(
      "未检测到二维码，请确认图片包含有效的二维码",
    );
  }
  return result.data;
}

/**
 * 从剪贴板数据中读取图片并解码二维码
 * @param clipboardItems - 剪贴板数据
 * @returns 二维码内容字符串
 * @throws QRDecodeError 当剪贴板中无图片或无法识别二维码时
 */
export async function decodeQRFromClipboard(
  clipboardItems: ClipboardItems,
): Promise<string> {
  for (const item of clipboardItems) {
    const imageType = item.types.find((t) => t.startsWith("image/"));
    if (imageType) {
      const blob = await item.getType(imageType);
      const imageData = await loadImageData(blob);
      return decodeQRFromImageData(imageData);
    }
  }
  throw new QRDecodeError("剪贴板中未找到图片数据");
}
