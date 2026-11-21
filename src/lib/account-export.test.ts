import { describe, it, expect } from "vitest";
import {
  exportToTXT,
  exportToXLSX,
  generateExportFilename,
  groupAccountsByIssuer,
} from "./account-export";
import type { OTPAccount } from "../types";

function makeAccount(overrides: Partial<OTPAccount> = {}): OTPAccount {
  return {
    id: crypto.randomUUID(),
    issuer: "GitHub",
    name: "alice@example.com",
    secret: "JBSWY3DPEHPK3PXP",
    type: "totp",
    counter: 0,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    createdAt: 1,
    groupId: "default",
    ...overrides,
  };
}

function parseZipEntries(zipBytes: Uint8Array): Map<string, string> {
  const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
  const decoder = new TextDecoder("utf-8");

  // Validate End of Central Directory signature at tail
  const eocdOffset = zipBytes.length - 22;
  expect(view.getUint32(eocdOffset, true)).toBe(0x06054b50);
  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);

  const entries = new Map<string, string>();
  let cursor = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    expect(view.getUint32(cursor, true)).toBe(0x02014b50);
    const compressionMethod = view.getUint16(cursor + 10, true);
    expect(compressionMethod).toBe(0);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLen = view.getUint16(cursor + 28, true);
    const extraLen = view.getUint16(cursor + 30, true);
    const commentLen = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);

    expect(view.getUint32(localHeaderOffset, true)).toBe(0x04034b50);
    const localNameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const filename = decoder.decode(zipBytes.slice(cursor + 46, cursor + 46 + nameLen));
    const content = decoder.decode(zipBytes.slice(dataStart, dataStart + compressedSize));
    entries.set(filename, content);

    cursor += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}

describe("account-export", () => {
  it("generateExportFilename uses format-specific prefix and extension", () => {
    const fixed = new Date("2026-11-21T12:34:56.000Z");
    expect(generateExportFilename("txt", fixed)).toMatch(/^2fa-export-2026-11-21_.*\.txt$/);
    expect(generateExportFilename("xlsx", fixed)).toMatch(/^2fa-export-2026-11-21_.*\.xlsx$/);
    expect(generateExportFilename("json", fixed)).toMatch(/^2fa-backup-2026-11-21_.*\.json$/);
  });

  it("groupAccountsByIssuer trims, folds issuer case, sorts named sections, and puts empty issuer last", () => {
    const accounts = [
      makeAccount({ id: "1", issuer: "", name: "none@example.com", secret: "SEC0" }),
      makeAccount({ id: "2", issuer: " Google ", name: "g1@example.com", secret: "SEC1" }),
      makeAccount({ id: "3", issuer: "Cloudflare", name: "cf@example.com", secret: "SEC2" }),
      makeAccount({ id: "4", issuer: "google", name: "g2@example.com", secret: "SEC3" }),
      makeAccount({ id: "5", issuer: "   ", name: "blank@example.com", secret: "SEC4" }),
    ];

    const grouped = groupAccountsByIssuer(accounts);
    expect(grouped.map((g) => g.issuer)).toEqual(["Cloudflare", "Google", "未分类"]);
    expect(grouped[1].accounts.map((a) => a.id)).toEqual(["2", "4"]);
    expect(grouped[2].accounts.map((a) => a.id)).toEqual(["1", "5"]);
  });

  it("exportToTXT formats sections by issuer with 邮箱——2FA密钥 lines and blank line separators", () => {
    expect(exportToTXT([])).toBe("");

    const txt = exportToTXT([
      makeAccount({ issuer: "", name: "un@example.com", secret: "SECRET0" }),
      makeAccount({ issuer: "Google", name: "bob@gmail.com\nwork", secret: "SECRETG" }),
      makeAccount({ issuer: "GitHub", name: "alice@example.com", secret: "SECRETA" }),
      makeAccount({ issuer: "GitHub", name: "  ", secret: "SECRETB" }),
    ]);

    expect(txt).toBe(
      [
        "GitHub",
        "alice@example.com——SECRETA",
        "未命名——SECRETB",
        "",
        "Google",
        "bob@gmail.com work——SECRETG",
        "",
        "未分类",
        "un@example.com——SECRET0",
      ].join("\n"),
    );
  });

  it("exportToXLSX produces valid PKZIP OOXML archive with issuer sections, two columns, mergeCells, and escaped XML", () => {
    const xlsxBytes = exportToXLSX([
      makeAccount({ issuer: "", name: "plain@example.com", secret: "PLAINSEC" }),
      makeAccount({ issuer: "A&B <Corp>", name: "=cmd('calc')&\"me\"", secret: "JBSWY3DPEHPK3PXP" }),
      makeAccount({ issuer: "GitHub", name: "alice@example.com", secret: "SECRETA" }),
    ]);

    expect(xlsxBytes[0]).toBe(0x50); // P
    expect(xlsxBytes[1]).toBe(0x4b); // K
    expect(xlsxBytes[2]).toBe(0x03);
    expect(xlsxBytes[3]).toBe(0x04);

    const files = parseZipEntries(xlsxBytes);
    expect(Array.from(files.keys())).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/sharedStrings.xml",
      "xl/worksheets/sheet1.xml",
    ]);

    const workbookXml = files.get("xl/workbook.xml")!;
    expect(workbookXml).toContain('name="2FA密钥"');

    const sharedStringsXml = files.get("xl/sharedStrings.xml")!;
    expect(sharedStringsXml).toContain("A&amp;B &lt;Corp&gt;");
    expect(sharedStringsXml).toContain("=cmd(&apos;calc&apos;)&amp;&quot;me&quot;");
    expect(sharedStringsXml).toContain("邮箱/账户");
    expect(sharedStringsXml).toContain("2FA密钥");
    expect(sharedStringsXml).toContain("未分类");

    const sheetXml = files.get("xl/worksheets/sheet1.xml")!;
    // 3 sections:
    // Section 1 ("A&B <Corp>"): row 1 title (merged A1:B1), row 2 headers, row 3 data; row 4 blank
    // Section 2 ("GitHub"): row 5 title (merged A5:B5), row 6 headers, row 7 data; row 8 blank
    // Section 3 ("未分类"): row 9 title (merged A9:B9), row 10 headers, row 11 data
    expect(sheetXml).toContain('<dimension ref="A1:B11"/>');
    expect(sheetXml).toContain('<mergeCells count="3">');
    expect(sheetXml).toContain('<mergeCell ref="A1:B1"/>');
    expect(sheetXml).toContain('<mergeCell ref="A5:B5"/>');
    expect(sheetXml).toContain('<mergeCell ref="A9:B9"/>');
    // Uses shared string refs t="s" rather than inline formula evaluation
    expect(sheetXml).toContain('r="A3" t="s" s="3"');
    expect(sheetXml).toContain('r="B3" t="s" s="4"');
  });

  it("exportToXLSX produces valid minimal worksheet when accounts list is empty", () => {
    const files = parseZipEntries(exportToXLSX([]));
    expect(files.get("xl/worksheets/sheet1.xml")).toContain('<dimension ref="A1:B1"/>');
    expect(files.get("xl/sharedStrings.xml")).toContain("邮箱/账户");
    expect(files.get("xl/sharedStrings.xml")).toContain("2FA密钥");
  });
});
