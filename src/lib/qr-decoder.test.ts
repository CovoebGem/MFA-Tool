import { describe, it, expect, vi } from "vitest";
import { QRDecodeError } from "../types";

// Mock jsQR module
vi.mock("jsqr", () => ({
  default: vi.fn(),
}));

import jsQR from "jsqr";
import { decodeQRFromFile, decodeQRFromImageData, decodeQRFromClipboard } from "./qr-decoder";

const mockedJsQR = vi.mocked(jsQR);

/** jsdom 不提供 ImageData，手动构造兼容对象 */
function createFakeImageData(width: number, height: number): ImageData {
  return {
    data: new Uint8ClampedArray(width * height * 4),
    width,
    height,
    colorSpace: "srgb",
  } as ImageData;
}

describe("QR_Decoder", () => {
  describe("decodeQRFromFile", () => {
    it("应拒绝非图片文件类型并抛出 QRDecodeError", async () => {
      const textFile = new File(["hello"], "test.txt", { type: "text/plain" });
      await expect(decodeQRFromFile(textFile)).rejects.toThrow(QRDecodeError);
      await expect(decodeQRFromFile(textFile)).rejects.toThrow(
        "请上传有效的图片文件（PNG、JPG、GIF）"
      );
    });

    it("应拒绝 PDF 文件类型", async () => {
      const pdfFile = new File(["pdf content"], "doc.pdf", { type: "application/pdf" });
      await expect(decodeQRFromFile(pdfFile)).rejects.toThrow(QRDecodeError);
    });

    it("应拒绝无 MIME 类型的文件", async () => {
      const noTypeFile = new File(["data"], "unknown", { type: "" });
      await expect(decodeQRFromFile(noTypeFile)).rejects.toThrow(QRDecodeError);
    });
  });

  describe("decodeQRFromImageData", () => {
    it("jsQR 返回 null 时应抛出 QRDecodeError", () => {
      mockedJsQR.mockReturnValue(null);
      const imageData = createFakeImageData(10, 10);

      expect(() => decodeQRFromImageData(imageData)).toThrow(QRDecodeError);
      expect(() => decodeQRFromImageData(imageData)).toThrow(
        "未检测到二维码，请确认图片包含有效的二维码"
      );
    });

    it("jsQR 返回有效结果时应返回 data 字符串", () => {
      const expectedData = "otpauth://totp/Test?secret=JBSWY3DPEHPK3PXP";
      mockedJsQR.mockReturnValue({
        data: expectedData,
        binaryData: [0],
        chunks: [],
        version: 1,
        location: {
          topRightCorner: { x: 0, y: 0 },
          topLeftCorner: { x: 0, y: 0 },
          bottomRightCorner: { x: 0, y: 0 },
          bottomLeftCorner: { x: 0, y: 0 },
          topRightFinderPattern: { x: 0, y: 0 },
          topLeftFinderPattern: { x: 0, y: 0 },
          bottomLeftFinderPattern: { x: 0, y: 0 },
          bottomRightAlignmentPattern: undefined,
        },
      } as any);

      const imageData = createFakeImageData(10, 10);
      const result = decodeQRFromImageData(imageData);
      expect(result).toBe(expectedData);
    });

    it("应将正确的参数传递给 jsQR", () => {
      mockedJsQR.mockReturnValue(null);
      const imageData = createFakeImageData(100, 200);

      try {
        decodeQRFromImageData(imageData);
      } catch {
        // expected
      }

      expect(mockedJsQR).toHaveBeenCalledWith(imageData.data, 100, 200);
    });
  });

  describe("decodeQRFromClipboard", () => {
    it("剪贴板无图片数据时应抛出 QRDecodeError", async () => {
      const clipboardItems: ClipboardItems = [
        {
          types: ["text/plain"],
          getType: vi.fn(),
        } as unknown as ClipboardItem,
      ];

      await expect(decodeQRFromClipboard(clipboardItems)).rejects.toThrow(QRDecodeError);
      await expect(decodeQRFromClipboard(clipboardItems)).rejects.toThrow(
        "剪贴板中未找到图片数据"
      );
    });

    it("剪贴板为空时应抛出 QRDecodeError", async () => {
      const emptyClipboard: ClipboardItems = [];

      await expect(decodeQRFromClipboard(emptyClipboard)).rejects.toThrow(QRDecodeError);
      await expect(decodeQRFromClipboard(emptyClipboard)).rejects.toThrow(
        "剪贴板中未找到图片数据"
      );
    });
  });
});
