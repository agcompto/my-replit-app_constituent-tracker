import { describe, expect, it } from "vitest";
import { build } from "esbuild";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

describe("createZipArchive", () => {
  it("survives the bundled ESM runtime path used by the API build", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "zip-archive-smoke-"));
    try {
      const entry = path.join(dir, "entry.ts");
      const output = path.join(dir, "entry.mjs");
      await writeFile(
        entry,
        `
          import { archiver, createZipArchive } from ${JSON.stringify(path.resolve("src/lib/zipArchive.ts"))};

          const archive = archiver("zip", { zlib: { level: 6 } });
          if (typeof archive.append !== "function" || typeof archive.finalize !== "function") {
            throw new Error("ZIP archive instance is missing archiver methods");
          }
          archive.abort();
        `,
      );
      await build({
        entryPoints: [entry],
        outfile: output,
        bundle: true,
        platform: "node",
        format: "esm",
        logLevel: "silent",
        banner: {
          js: `import { createRequire as __zipSmokeCreateRequire } from "node:module";\nglobalThis.require = __zipSmokeCreateRequire(import.meta.url);`,
        },
      });
      const result = await execFileAsync(process.execPath, [output]);
      expect(result.stderr).toBe("");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
