import type { OTPAccount } from "../types";

export type ExportFormat = "xlsx" | "txt" | "json";

export interface IssuerAccountSection {
  issuer: string;
  accounts: OTPAccount[];
}

const UNCATEGORIZED_ISSUER_LABEL = "未分类";

function stripXmlControlChars(value: string): string {
  let out = "";
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (
      code <= 0x08 ||
      code === 0x0b ||
      code === 0x0c ||
      (code >= 0x0e && code <= 0x1f) ||
      code === 0x7f
    ) {
      continue;
    }
    out += value[i];
  }
  return out;
}

function sanitizeSingleLineText(value: string, fallback = ""): string {
  const cleaned = stripXmlControlChars(value)
    .replace(/[\r\n]+/g, " ")
    .trim();
  return cleaned || fallback;
}

export function generateExportFilename(format: ExportFormat, now = new Date()): string {
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, "-");
  if (format === "json") {
    return `2fa-backup-${dateStr}_${timeStr}.json`;
  }
  return `2fa-export-${dateStr}_${timeStr}.${format}`;
}

export function groupAccountsByIssuer(accounts: OTPAccount[]): IssuerAccountSection[] {
  const buckets = new Map<string, IssuerAccountSection>();

  for (const account of accounts) {
    const cleanedIssuer = sanitizeSingleLineText(account.issuer);
    const key = cleanedIssuer ? cleanedIssuer.toLowerCase() : "";
    let section = buckets.get(key);
    if (!section) {
      section = {
        issuer: cleanedIssuer || UNCATEGORIZED_ISSUER_LABEL,
        accounts: [],
      };
      buckets.set(key, section);
    }
    section.accounts.push(account);
  }

  const namedSections: IssuerAccountSection[] = [];
  let uncategorized: IssuerAccountSection | null = null;

  for (const [key, section] of buckets.entries()) {
    if (key === "") {
      uncategorized = section;
    } else {
      namedSections.push(section);
    }
  }

  namedSections.sort((a, b) =>
    a.issuer.localeCompare(b.issuer, "zh-CN", { sensitivity: "base" }),
  );

  if (uncategorized) {
    namedSections.push(uncategorized);
  }

  return namedSections;
}

export function exportToTXT(accounts: OTPAccount[]): string {
  if (accounts.length === 0) {
    return "";
  }

  const sections = groupAccountsByIssuer(accounts);
  return sections
    .map((section) => {
      const lines = [
        section.issuer,
        ...section.accounts.map((account) => {
          const name = sanitizeSingleLineText(account.name, "未命名");
          const secret = sanitizeSingleLineText(account.secret, "");
          return `${name}\u2014\u2014${secret}`;
        }),
      ];
      return lines.join("\n");
    })
    .join("\n\n");
}

function escapeXml(value: string): string {
  return stripXmlControlChars(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function estimateDisplayWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    width += code > 0xff ? 2 : 1;
  }
  return width;
}

function columnCellRef(colLetter: "A" | "B", row: number): string {
  return `${colLetter}${row}`;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 1) !== 0 ? (0xedb88320 ^ (crc >>> 1)) >>> 0 : crc >>> 1;
    }
    table[i] = crc >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildZipArchive(
  files: ReadonlyArray<{ name: string; content: Uint8Array }>,
  now = new Date(),
): Uint8Array {
  const encoder = new TextEncoder();
  const year = Math.max(now.getFullYear(), 1980);
  const dosTime =
    ((now.getHours() & 0x1f) << 11) |
    ((now.getMinutes() & 0x3f) << 5) |
    ((now.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((year - 1980) & 0x7f) << 9) |
    (((now.getMonth() + 1) & 0x0f) << 5) |
    (now.getDate() & 0x1f);

  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;
  let centralSize = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const dataBytes = file.content;
    const checksum = crc32(dataBytes);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, dosTime, true);
    localView.setUint16(12, dosDate, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, dataBytes.length, true);
    localView.setUint32(22, dataBytes.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, dosTime, true);
    centralView.setUint16(14, dosDate, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, dataBytes.length, true);
    centralView.setUint32(24, dataBytes.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    localChunks.push(localHeader, dataBytes);
    centralChunks.push(centralHeader);
    offset += localHeader.length + dataBytes.length;
    centralSize += centralHeader.length;
  }

  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  const archive = new Uint8Array(offset + centralSize + endRecord.length);
  let cursor = 0;
  for (const chunk of localChunks) {
    archive.set(chunk, cursor);
    cursor += chunk.length;
  }
  for (const chunk of centralChunks) {
    archive.set(chunk, cursor);
    cursor += chunk.length;
  }
  archive.set(endRecord, cursor);
  return archive;
}

export function exportToXLSX(accounts: OTPAccount[]): Uint8Array {
  const sections = groupAccountsByIssuer(accounts);
  const sharedStrings: string[] = [];
  const sharedStringIndex = new Map<string, number>();
  let totalStringRefs = 0;

  const internString = (raw: string): number => {
    totalStringRefs += 1;
    const existing = sharedStringIndex.get(raw);
    if (existing !== undefined) {
      return existing;
    }
    const idx = sharedStrings.length;
    sharedStrings.push(raw);
    sharedStringIndex.set(raw, idx);
    return idx;
  };

  const rowsXml: string[] = [];
  const merges: string[] = [];
  let rowNumber = 1;
  let maxColAWidth = 14;
  let maxColBWidth = 14;

  const pushStringRow = (
    row: number,
    height: number,
    cellA: { value: string; style: number },
    cellB: { value?: string; style: number },
  ) => {
    const aIdx = internString(cellA.value);
    const cellAXml = `<c r="${columnCellRef("A", row)}" t="s" s="${cellA.style}"><v>${aIdx}</v></c>`;
    const cellBXml =
      cellB.value !== undefined
        ? `<c r="${columnCellRef("B", row)}" t="s" s="${cellB.style}"><v>${internString(cellB.value)}</v></c>`
        : `<c r="${columnCellRef("B", row)}" s="${cellB.style}"/>`;
    rowsXml.push(`<row r="${row}" ht="${height}" customHeight="1">${cellAXml}${cellBXml}</row>`);
  };

  if (sections.length === 0) {
    pushStringRow(
      rowNumber,
      20,
      { value: "邮箱/账户", style: 2 },
      { value: "2FA密钥", style: 2 },
    );
  } else {
    sections.forEach((section, index) => {
      if (index > 0) {
        rowNumber += 1;
      }

      const titleWidth = Math.ceil(estimateDisplayWidth(section.issuer) * 0.6);
      maxColAWidth = Math.max(maxColAWidth, titleWidth);

      pushStringRow(
        rowNumber,
        24,
        { value: section.issuer, style: 1 },
        { style: 1 },
      );
      merges.push(`${columnCellRef("A", rowNumber)}:${columnCellRef("B", rowNumber)}`);
      rowNumber += 1;

      pushStringRow(
        rowNumber,
        20,
        { value: "邮箱/账户", style: 2 },
        { value: "2FA密钥", style: 2 },
      );
      rowNumber += 1;

      for (const account of section.accounts) {
        const name = sanitizeSingleLineText(account.name, "未命名");
        const secret = sanitizeSingleLineText(account.secret, "");
        maxColAWidth = Math.max(maxColAWidth, estimateDisplayWidth(name) + 4);
        maxColBWidth = Math.max(maxColBWidth, estimateDisplayWidth(secret) + 4);

        pushStringRow(
          rowNumber,
          20,
          { value: name, style: 3 },
          { value: secret, style: 4 },
        );
        rowNumber += 1;
      }
    });
  }

  const lastRow = Math.max(1, rowNumber - 1);
  const colAWidth = Math.min(60, Math.max(24, maxColAWidth));
  const colBWidth = Math.min(56, Math.max(26, maxColBWidth));
  const mergeXml =
    merges.length > 0
      ? `<mergeCells count="${merges.length}">${merges
          .map((ref) => `<mergeCell ref="${ref}"/>`)
          .join("")}</mergeCells>`
      : "";

  const contentTypesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
    "</Types>";

  const rootRelsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    "</Relationships>";

  const workbookXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets><sheet name="2FA密钥" sheetId="1" r:id="rId1"/></sheets>' +
    "</workbook>";

  const workbookRelsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>' +
    "</Relationships>";

  const stylesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="4">' +
    '<font><sz val="11"/><color rgb="FF111827"/><name val="Microsoft YaHei"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FF1E3A8A"/><name val="Microsoft YaHei"/></font>' +
    '<font><b/><sz val="10"/><color rgb="FF374151"/><name val="Microsoft YaHei"/></font>' +
    '<font><sz val="11"/><color rgb="FF111827"/><name val="Consolas"/></font>' +
    "</fonts>" +
    '<fills count="4">' +
    '<fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFEFF6FF"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF3F4F6"/><bgColor indexed="64"/></patternFill></fill>' +
    "</fills>" +
    '<borders count="2">' +
    "<border><left/><right/><top/><bottom/><diagonal/></border>" +
    '<border>' +
    '<left style="thin"><color rgb="FFCBD5E1"/></left>' +
    '<right style="thin"><color rgb="FFCBD5E1"/></right>' +
    '<top style="thin"><color rgb="FFCBD5E1"/></top>' +
    '<bottom style="thin"><color rgb="FFCBD5E1"/></bottom>' +
    "<diagonal/>" +
    "</border>" +
    "</borders>" +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="5">' +
    '<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="49" fontId="1" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>' +
    '<xf numFmtId="49" fontId="2" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>' +
    '<xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>' +
    '<xf numFmtId="49" fontId="3" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>' +
    "</cellXfs>" +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '<dxfs count="0"/>' +
    '<tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>' +
    "</styleSheet>";

  const sharedStringsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${totalStringRefs}" uniqueCount="${sharedStrings.length}">` +
    sharedStrings.map((str) => `<si><t xml:space="preserve">${escapeXml(str)}</t></si>`).join("") +
    "</sst>";

  const sheetXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<dimension ref="A1:B${lastRow}"/>` +
    '<sheetViews><sheetView workbookViewId="0"/></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="20"/>' +
    `<cols><col min="1" max="1" width="${colAWidth}" customWidth="1"/><col min="2" max="2" width="${colBWidth}" customWidth="1"/></cols>` +
    `<sheetData>${rowsXml.join("")}</sheetData>` +
    mergeXml +
    "</worksheet>";

  const encoder = new TextEncoder();
  return buildZipArchive([
    { name: "[Content_Types].xml", content: encoder.encode(contentTypesXml) },
    { name: "_rels/.rels", content: encoder.encode(rootRelsXml) },
    { name: "xl/workbook.xml", content: encoder.encode(workbookXml) },
    { name: "xl/_rels/workbook.xml.rels", content: encoder.encode(workbookRelsXml) },
    { name: "xl/styles.xml", content: encoder.encode(stylesXml) },
    { name: "xl/sharedStrings.xml", content: encoder.encode(sharedStringsXml) },
    { name: "xl/worksheets/sheet1.xml", content: encoder.encode(sheetXml) },
  ]);
}
