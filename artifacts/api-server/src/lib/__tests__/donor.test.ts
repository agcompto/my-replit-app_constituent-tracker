import { describe, it, expect } from "vitest";
import {
  normalizeDonorId,
  parseDonorIdInput,
  escapeCsvCell,
  buildCsv,
  detectPii,
} from "../donor";

describe("normalizeDonorId", () => {
  it("zero-pads to 8 characters", () => {
    expect(normalizeDonorId("1")).toBe("00000001");
    expect(normalizeDonorId("12345")).toBe("00012345");
    expect(normalizeDonorId("12345678")).toBe("12345678");
  });
  it("trims surrounding whitespace", () => {
    expect(normalizeDonorId("   42  ")).toBe("00000042");
  });
  it("rejects non-numeric input", () => {
    expect(normalizeDonorId("abc123")).toBeNull();
    expect(normalizeDonorId("12.34")).toBeNull();
    expect(normalizeDonorId("12-34")).toBeNull();
    expect(normalizeDonorId("")).toBeNull();
    expect(normalizeDonorId("   ")).toBeNull();
  });
  it("rejects values longer than 8 digits", () => {
    expect(normalizeDonorId("123456789")).toBeNull();
  });
});

describe("parseDonorIdInput", () => {
  it("parses newline-delimited IDs and dedupes", () => {
    const r = parseDonorIdInput("1\n2\n2\n3\n");
    expect(r.validIds).toEqual(["00000001", "00000002", "00000003"]);
    expect(r.duplicateSamples).toEqual(["00000002"]);
  });
  it("collects rejected samples and ignores extras", () => {
    const r = parseDonorIdInput("1\nabc\n2\n", {});
    expect(r.validIds).toEqual(["00000001", "00000002"]);
    expect(r.rejectedSamples).toEqual(["abc"]);
  });
  it("respects header + columnIndex", () => {
    const r = parseDonorIdInput(
      "name,donor_id\nAlice,5\nBob,7\n",
      { hasHeader: true, columnIndex: 1 },
    );
    expect(r.detectedColumns).toEqual(["name", "donor_id"]);
    expect(r.validIds).toEqual(["00000005", "00000007"]);
    expect(r.extraColumnsIgnored).toBe(true);
  });
  it("flags rows with extra columns", () => {
    const r = parseDonorIdInput("1,extra\n2,more\n");
    expect(r.extraColumnsIgnored).toBe(true);
    expect(r.validIds).toEqual(["00000001", "00000002"]);
  });
});

describe("escapeCsvCell — formula injection guard", () => {
  it("prefixes a single quote in front of dangerous leading chars", () => {
    expect(escapeCsvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(escapeCsvCell("+1")).toBe("'+1");
    expect(escapeCsvCell("-1")).toBe("'-1");
    expect(escapeCsvCell("@cmd")).toBe("'@cmd");
    // tab/CR are dangerous leading chars too — they get the apostrophe guard;
    // CR additionally triggers cell quoting because it is a record terminator.
    expect(escapeCsvCell("\tinjected").startsWith("'")).toBe(true);
    expect(escapeCsvCell("\rmalicious").includes("'\r")).toBe(true);
  });
  it("quotes cells containing comma/quote/newline", () => {
    expect(escapeCsvCell('hello, "world"')).toBe('"hello, ""world"""');
    expect(escapeCsvCell("a\nb")).toBe('"a\nb"');
  });
  it("passes safe values through unchanged", () => {
    expect(escapeCsvCell("plain")).toBe("plain");
    expect(escapeCsvCell(42)).toBe("42");
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
  });
  it("combines guard + quoting when both apply", () => {
    expect(escapeCsvCell('=A,B')).toBe('"\'=A,B"');
  });
});

describe("buildCsv", () => {
  it("emits CRLF lines and a trailing terminator", () => {
    const csv = buildCsv(["a", "b"], [["1", "2"], ["3", "4"]]);
    expect(csv).toBe("a,b\r\n1,2\r\n3,4\r\n");
  });
  it("escapes header and row cells consistently", () => {
    const csv = buildCsv(["=name", "n"], [["alice", 1]]);
    expect(csv.startsWith("'=name,n\r\n")).toBe(true);
  });
});

describe("detectPii", () => {
  it("flags email/phone/address-shaped strings", () => {
    expect(detectPii("contact me at jane@example.org")).toBe(true);
    expect(detectPii("call (919) 555-1212 today")).toBe(true);
    expect(detectPii("123 Main Street")).toBe(true);
  });
  it("ignores donor IDs and plain prose", () => {
    expect(detectPii("constituent 00012345 is segment A")).toBe(false);
    expect(detectPii("Q3 stewardship campaign")).toBe(false);
    expect(detectPii(null)).toBe(false);
  });
});
