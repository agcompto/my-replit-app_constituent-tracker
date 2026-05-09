import { parseDonorIdInput, type ParseAudienceResult } from "./donor";

export interface AudienceSourceInput {
  rawText?: string;
  googleSheetUrl?: string;
  csvFileBase64?: string;
  hasHeader?: boolean;
  columnIndex?: number;
}

export interface ResolvedAudience extends ParseAudienceResult {
  source: "paste" | "google_sheet" | "file";
}

const SHEET_ID_PATTERNS = [
  /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/,
  /[?&]id=([a-zA-Z0-9-_]+)/,
];

function extractSheetId(url: string): string | null {
  for (const re of SHEET_ID_PATTERNS) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

function extractGid(url: string): string | null {
  const m = url.match(/[#?&]gid=([0-9]+)/);
  return m ? m[1] : null;
}

const SHEET_FETCH_TIMEOUT_MS = 15_000;
const SHEET_MAX_BYTES = 15 * 1024 * 1024; // 15 MB hard cap on remote response

async function fetchGoogleSheetCsv(url: string): Promise<string> {
  const id = extractSheetId(url);
  if (!id) {
    throw new Error("Could not extract spreadsheet ID from the Google Sheet URL.");
  }
  const gid = extractGid(url);
  const csvUrl = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv${gid ? `&gid=${gid}` : ""}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SHEET_FETCH_TIMEOUT_MS);
  let resp: Response;
  try {
    resp = await fetch(csvUrl, { redirect: "follow", signal: controller.signal });
  } catch (e) {
    clearTimeout(timer);
    if ((e as Error).name === "AbortError") {
      throw new Error("Google Sheet fetch timed out. Try again or use a smaller sheet.");
    }
    throw new Error("Could not contact Google Sheets.");
  }
  if (!resp.ok) {
    clearTimeout(timer);
    if (resp.status === 401 || resp.status === 403 || resp.status === 404) {
      throw new Error(
        "Could not read the Google Sheet. Make sure sharing is set to 'Anyone with the link — Viewer'.",
      );
    }
    throw new Error(`Google Sheet fetch failed (HTTP ${resp.status}).`);
  }
  const ct = resp.headers.get("content-type") ?? "";
  if (ct.includes("text/html")) {
    clearTimeout(timer);
    throw new Error(
      "Google returned an HTML page instead of CSV. The sheet is likely not shared publicly.",
    );
  }
  const advertisedLen = Number(resp.headers.get("content-length") ?? "0");
  if (advertisedLen > SHEET_MAX_BYTES) {
    clearTimeout(timer);
    controller.abort();
    throw new Error("Google Sheet response is too large (max 15 MB).");
  }

  // Stream and enforce a hard byte cap regardless of the advertised header.
  if (!resp.body) {
    clearTimeout(timer);
    throw new Error("Google Sheet response was empty.");
  }
  const reader = resp.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > SHEET_MAX_BYTES) {
        controller.abort();
        throw new Error("Google Sheet response is too large (max 15 MB).");
      }
      chunks.push(value);
    }
  } finally {
    clearTimeout(timer);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
}

function decodeBase64Csv(b64: string): string {
  // strip data URI prefix if present
  const cleaned = b64.replace(/^data:[^;]+;base64,/, "");
  let buf: Buffer;
  try {
    buf = Buffer.from(cleaned, "base64");
  } catch {
    throw new Error("Could not decode the uploaded file (invalid base64).");
  }
  // Try to detect UTF-8 BOM and strip
  let text: string;
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    text = buf.slice(3).toString("utf8");
  } else {
    text = buf.toString("utf8");
  }
  return text;
}

const MAX_INPUT_BYTES = 15 * 1024 * 1024; // 15 MB of decoded text

export async function resolveAudienceSource(
  input: AudienceSourceInput,
): Promise<ResolvedAudience> {
  const provided = [input.rawText, input.googleSheetUrl, input.csvFileBase64].filter(
    (v) => typeof v === "string" && v.trim().length > 0,
  );
  if (provided.length === 0) {
    throw new Error("Provide one of: rawText, googleSheetUrl, or csvFileBase64.");
  }
  if (provided.length > 1) {
    throw new Error("Provide only one of: rawText, googleSheetUrl, or csvFileBase64.");
  }

  let text: string;
  let source: ResolvedAudience["source"];
  if (input.googleSheetUrl?.trim()) {
    text = await fetchGoogleSheetCsv(input.googleSheetUrl.trim());
    source = "google_sheet";
  } else if (input.csvFileBase64?.trim()) {
    text = decodeBase64Csv(input.csvFileBase64.trim());
    source = "file";
  } else {
    text = input.rawText!;
    source = "paste";
  }

  if (Buffer.byteLength(text, "utf8") > MAX_INPUT_BYTES) {
    throw new Error("Input is too large (max 15 MB of text). Please split into smaller files.");
  }

  const parsed = parseDonorIdInput(text, {
    hasHeader: input.hasHeader,
    columnIndex: input.columnIndex,
  });
  return { ...parsed, source };
}
