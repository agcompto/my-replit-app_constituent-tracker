import { parse } from "csv-parse/sync";

const ID_REGEX = /^[0-9]{1,8}$/;

export function normalizeDonorId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!ID_REGEX.test(trimmed)) return null;
  return trimmed.padStart(8, "0");
}

export interface ParseAudienceOptions {
  hasHeader?: boolean;
  columnIndex?: number;
}

export interface ParseAudienceResult {
  originalRowCount: number;
  blankRowCount: number;
  validIds: string[]; // unique
  duplicateIds: string[]; // donor IDs that appeared more than once
  rejectedSamples: string[]; // first N raw rejected values
  duplicateSamples: string[];
  extraColumnsIgnored: boolean;
  detectedColumns: string[];
}

export function parseDonorIdInput(
  raw: string,
  opts: ParseAudienceOptions = {},
): ParseAudienceResult {
  const hasHeader = opts.hasHeader ?? false;
  const columnIndex = opts.columnIndex ?? 0;
  let rows: string[][];
  try {
    rows = parse(raw, {
      skip_empty_lines: false,
      relax_column_count: true,
      relax_quotes: true,
      trim: true,
    });
  } catch {
    rows = raw.split(/\r?\n/).map((line) => [line]);
  }

  const detectedColumns: string[] =
    hasHeader && rows.length > 0 ? rows[0].map(String) : [];
  const dataRows = hasHeader ? rows.slice(1) : rows;

  const seen = new Set<string>();
  const dupSet = new Set<string>();
  const rejectedSamples: string[] = [];
  const duplicateSamples: string[] = [];
  let blank = 0;
  let extraColumnsIgnored = false;
  const validIds: string[] = [];

  for (const row of dataRows) {
    if (!row || row.length === 0 || row.every((c) => !c || !String(c).trim())) {
      blank++;
      continue;
    }
    if (row.length > 1) extraColumnsIgnored = true;
    const cell = String(row[columnIndex] ?? "").trim();
    if (!cell) {
      blank++;
      continue;
    }
    const norm = normalizeDonorId(cell);
    if (!norm) {
      if (rejectedSamples.length < 50) rejectedSamples.push(cell);
      continue;
    }
    if (seen.has(norm)) {
      if (!dupSet.has(norm)) {
        dupSet.add(norm);
        if (duplicateSamples.length < 50) duplicateSamples.push(norm);
      }
      continue;
    }
    seen.add(norm);
    validIds.push(norm);
  }

  return {
    originalRowCount: dataRows.length,
    blankRowCount: blank,
    validIds,
    duplicateIds: Array.from(dupSet),
    rejectedSamples,
    duplicateSamples,
    extraColumnsIgnored,
    detectedColumns,
  };
}

const PII_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, // email
  /\b\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/, // phone
  /\b\d+\s+[A-Z][A-Za-z]+\s+(St|Street|Ave|Avenue|Rd|Road|Blvd|Lane|Ln|Drive|Dr|Court|Ct)\b/i, // address
];

export function detectPii(text: string | undefined | null): boolean {
  if (!text) return false;
  return PII_PATTERNS.some((re) => re.test(text));
}

export function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  // Formula injection prevention
  const dangerous = /^[=+\-@\t\r]/;
  let out = dangerous.test(s) ? "'" + s : s;
  if (/[",\r\n]/.test(out)) {
    out = '"' + out.replace(/"/g, '""') + '"';
  }
  return out;
}

export function buildCsv(headers: string[], rows: (string | number | null)[][]): string {
  const lines = [headers.map(escapeCsvCell).join(",")];
  for (const row of rows) lines.push(row.map(escapeCsvCell).join(","));
  return lines.join("\r\n") + "\r\n";
}
