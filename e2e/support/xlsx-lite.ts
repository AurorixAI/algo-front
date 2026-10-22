import { deflateRawSync, inflateRawSync } from "node:zlib";

/**
 * A tiny reader / patcher of .xlsx for the specs (no dependency): an .xlsx is a zip of XML parts.  It reads the cells of one sheet and
 * writes a text into a cell of it - enough for «скачать файл остатков → поправить ячейки → загрузить» (ROADMAP #125).  A written text is an
 * inline string, which the server reads like any other text cell.
 */

export type Zip = Map<string, Buffer>;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function readZip(buffer: Buffer): Zip {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("not a zip file");
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const parts: Zip = new Map();
  for (let n = 0; n < count; n++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("broken zip directory");
    const method = buffer.readUInt16LE(offset + 10);
    const compressed = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const local = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    const dataStart = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const raw = buffer.subarray(dataStart, dataStart + compressed);
    parts.set(name, method === 0 ? Buffer.from(raw) : inflateRawSync(raw));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return parts;
}

export function writeZip(parts: Zip): Buffer {
  const chunks: Buffer[] = [];
  const directory: Buffer[] = [];
  let position = 0;
  for (const [name, data] of parts) {
    const nameBytes = Buffer.from(name, "utf8");
    const packed = deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    chunks.push(local, nameBytes, packed);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(packed.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(position, 42);
    directory.push(entry, nameBytes);
    position += local.length + nameBytes.length + packed.length;
  }
  const central = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(parts.size, 8);
  end.writeUInt16LE(parts.size, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(position, 16);
  return Buffer.concat([...chunks, central, end]);
}

const unescapeXml = (text: string): string => text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const escapeXml = (text: string): string => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function sharedStrings(parts: Zip): string[] {
  const xml = parts.get("xl/sharedStrings.xml")?.toString("utf8") ?? "";
  return Array.from(xml.matchAll(/<si>([\s\S]*?)<\/si>/g)).map((match) => unescapeXml(Array.from(match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)).map((part) => part[1]).join("")));
}

/** The part of the sheet with this name («Остатки»). */
export function sheetPart(parts: Zip, sheetName: string): string {
  const workbook = parts.get("xl/workbook.xml")?.toString("utf8") ?? "";
  const sheet = Array.from(workbook.matchAll(/<sheet\b[^>]*>/g)).map((m) => m[0]).find((tag) => unescapeXml(/name="([^"]*)"/.exec(tag)?.[1] ?? "") === sheetName);
  const id = sheet && /r:id="([^"]*)"/.exec(sheet)?.[1];
  if (!id) throw new Error(`no sheet «${sheetName}» in the file`);
  const rels = parts.get("xl/_rels/workbook.xml.rels")?.toString("utf8") ?? "";
  const rel = Array.from(rels.matchAll(/<Relationship\b[^>]*>/g)).map((m) => m[0]).find((tag) => new RegExp(`Id="${id}"`).test(tag));
  const target = rel && /Target="([^"]*)"/.exec(rel)?.[1];
  if (!target) throw new Error(`no part for the sheet «${sheetName}»`);
  return target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
}

export interface SheetRow {
  /** The number of the row in the file (1 = the header): the number the report of the page names. */
  row: number;
  cells: Record<string, string>;
}

/** The text of every non-empty cell of the sheet, by row and column letter. */
export function readSheet(parts: Zip, sheetName: string): SheetRow[] {
  const xml = parts.get(sheetPart(parts, sheetName))?.toString("utf8") ?? "";
  const strings = sharedStrings(parts);
  const rows: SheetRow[] = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*\br="(\d+)"[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const cells: Record<string, string> = {};
    for (const cell of (rowMatch[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /\br="([A-Z]+)\d+"/.exec(cell[1])?.[1];
      if (!ref) continue;
      const type = /\bt="([^"]*)"/.exec(cell[1])?.[1];
      const body = cell[2] ?? "";
      let value = "";
      if (type === "s") value = strings[Number(/<v>(\d+)<\/v>/.exec(body)?.[1])] ?? "";
      else if (type === "inlineStr") value = unescapeXml(Array.from(body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)).map((m) => m[1]).join(""));
      else value = unescapeXml(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "");
      if (value !== "") cells[ref] = value;
    }
    rows.push({ row: Number(rowMatch[1]), cells });
  }
  return rows;
}

const columnNumber = (letters: string): number => letters.split("").reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);

/** Writes a text into one cell (`G7`) of the sheet: an existing cell is replaced, a missing one is added in its place of the row. */
export function setCellText(parts: Zip, sheetName: string, ref: string, text: string): void {
  const path = sheetPart(parts, sheetName);
  const xml = parts.get(path)?.toString("utf8") ?? "";
  const [, letters, rowNumber] = /^([A-Z]+)(\d+)$/.exec(ref) ?? [];
  if (!letters) throw new Error(`bad cell ${ref}`);
  const style = (cell: string) => /\bs="(\d+)"/.exec(cell)?.[1];
  const make = (s?: string) => `<c r="${ref}"${s ? ` s="${s}"` : ""} t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
  const rowPattern = new RegExp(`(<row\\b[^>]*\\br="${rowNumber}"[^>]*?)(/>|>([\\s\\S]*?)</row>)`);
  const found = rowPattern.exec(xml);
  if (!found) throw new Error(`no row ${rowNumber} in the sheet`);
  const cells = Array.from((found[3] ?? "").matchAll(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g)).map((m) => m[0]);
  let placed = false;
  const next: string[] = [];
  for (const cell of cells) {
    const cellLetters = /\br="([A-Z]+)\d+"/.exec(cell)?.[1] ?? "";
    if (cellLetters === letters) { next.push(make(style(cell))); placed = true; continue; }
    if (!placed && columnNumber(cellLetters) > columnNumber(letters)) { next.push(make()); placed = true; }
    next.push(cell);
  }
  if (!placed) next.push(make());
  const open = found[1].replace(/\s*\/$/, "");
  parts.set(path, Buffer.from(xml.replace(found[0], `${open}>${next.join("")}</row>`), "utf8"));
}
