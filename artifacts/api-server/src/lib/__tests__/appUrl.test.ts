import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("samlPublicBaseUrl", () => {
  const env = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...env };
    delete process.env.APP_PUBLIC_URL;
    delete process.env.REPLIT_DOMAINS;
    delete process.env.SAML_SP_ENTITY_ID;
  });

  afterEach(() => {
    process.env = env;
    vi.resetModules();
  });

  it("uses APP_PUBLIC_URL when set", async () => {
    process.env.APP_PUBLIC_URL = "https://planner.example.edu/";
    const { samlPublicBaseUrl } = await import("../appUrl");
    expect(samlPublicBaseUrl()).toBe("https://planner.example.edu");
  });

  it("falls back to local Vite origin in development", async () => {
    process.env.NODE_ENV = "development";
    process.env.APP_PUBLIC_PORT = "5173";
    const { samlPublicBaseUrl } = await import("../appUrl");
    expect(samlPublicBaseUrl()).toBe("http://127.0.0.1:5173");
  });

  it("throws outside development when no public URL is configured", async () => {
    process.env.NODE_ENV = "production";
    const { samlPublicBaseUrl } = await import("../appUrl");
    expect(() => samlPublicBaseUrl()).toThrow(/APP_PUBLIC_URL/);
  });
});
