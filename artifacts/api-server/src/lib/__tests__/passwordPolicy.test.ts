import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { validatePasswordPolicy, checkHibp } from "../passwordPolicy";

describe("validatePasswordPolicy", () => {
  beforeEach(() => {
    process.env.PASSWORD_HIBP_DISABLED = "1";
  });
  afterEach(() => {
    delete process.env.PASSWORD_HIBP_DISABLED;
  });

  it("rejects passwords shorter than 12 chars", async () => {
    const r = await validatePasswordPolicy({ password: "Short1!" });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/at least 12/);
  });

  it("rejects passwords longer than 128 chars", async () => {
    const r = await validatePasswordPolicy({ password: "a1".repeat(70) });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/at most 128/);
  });

  it("requires a letter and a digit/symbol", async () => {
    expect((await validatePasswordPolicy({ password: "aaaaaaaaaaaaaa" })).ok).toBe(false);
    expect((await validatePasswordPolicy({ password: "11111111111111" })).ok).toBe(false);
    expect((await validatePasswordPolicy({ password: "abcdefghijkl1" })).ok).toBe(true);
  });

  it("rejects passwords containing the user's email local part", async () => {
    const r = await validatePasswordPolicy({
      password: "alicewonderland-99",
      email: "alice@ncsu.edu",
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/email/);
  });

  it("does not match short email locals (avoids false positives)", async () => {
    // "al" is too short to be considered a substring trigger.
    const r = await validatePasswordPolicy({
      password: "trombone-octave-9",
      email: "al@ncsu.edu",
    });
    expect(r.ok).toBe(true);
  });

  it("rejects passwords containing parts of the user's name", async () => {
    const r = await validatePasswordPolicy({
      password: "wonderland-tides-77",
      name: "Alice Wonderland",
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/name/);
  });
});

describe("checkHibp (mocked)", () => {
  beforeEach(() => {
    delete process.env.PASSWORD_HIBP_DISABLED;
  });

  it("returns the breach count when the suffix is present", async () => {
    const { createHash } = await import("node:crypto");
    const sha1 = createHash("sha1").update("password").digest("hex").toUpperCase();
    const suffix = sha1.slice(5);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        `DEADBEEFCAFEBABE0000000000000000000:0\r\n${suffix}:42\r\n`,
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const count = await checkHibp("password");
      expect(count).toBe(42);
      expect(fetchMock).toHaveBeenCalledOnce();
      const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
      expect(calledUrl).toMatch(/^https:\/\/api\.pwnedpasswords\.com\/range\/[0-9A-F]{5}$/);
      // The plaintext must never appear in the URL — only the SHA-1 prefix.
      expect(calledUrl).not.toContain(Buffer.from("password").toString("base64"));
      expect(calledUrl.split("/range/")[1]).toBe(sha1.slice(0, 5));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("returns 0 when the suffix is absent", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "DEADBEEF:5\r\n",
    }));
    try {
      expect(await checkHibp("an-uncommon-passphrase")).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("returns null (fail-open) when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    try {
      expect(await checkHibp("anything")).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("policy surfaces breach reason when fetch reports a hit for the actual suffix", async () => {
    const { createHash } = await import("node:crypto");
    const pw = "trombone-octave-9";
    const sha1 = createHash("sha1").update(pw).digest("hex").toUpperCase();
    const suffix = sha1.slice(5);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      text: async () => `${suffix}:7\r\n`,
    }));
    try {
      const r = await validatePasswordPolicy({ password: pw });
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/breach/i);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
