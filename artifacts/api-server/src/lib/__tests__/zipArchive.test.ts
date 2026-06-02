import { describe, expect, it } from "vitest";
import { build } from "esbuild";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { strFromU8, unzipSync } from "fflate";

const execFileAsync = promisify(execFile);

describe("createZipArchive", () => {
  it("creates a readable ZIP archive through the bundled ESM runtime path used by the API build", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "zip-archive-smoke-"));
    try {
      const entry = path.join(dir, "entry.ts");
      const output = path.join(dir, "entry.mjs");
      await writeFile(
        entry,
        `
          import { createZipArchive } from ${JSON.stringify(path.resolve("src/lib/zipArchive.ts"))};

          const archive = createZipArchive({ zlib: { level: 6 } });
          if (typeof archive.append !== "function" || typeof archive.finalize !== "function") {
            throw new Error("ZIP archive instance is missing archiver methods");
          }

          const chunks = [];
          archive.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
          const done = new Promise((resolve, reject) => {
            archive.on("end", resolve);
            archive.on("error", reject);
          });

          archive.append("Lobo archive smoke test", { name: "lobo-smoke.txt" });
          await archive.finalize();
          await done;
          process.stdout.write(Buffer.concat(chunks).toString("base64"));
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

      const files = unzipSync(Buffer.from(result.stdout, "base64"));
      expect(strFromU8(files["lobo-smoke.txt"])).toBe(
        "Lobo archive smoke test",
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("keeps campaign route source on the low-conflict legacy archiver call shape", async () => {
    const campaignRoute = await readFile(
      path.resolve("src/routes/campaigns.ts"),
      "utf8",
    );

    expect(campaignRoute).toContain('import * as archiver from "archiver";');
    expect(campaignRoute).not.toContain(
      'import { createZipArchive } from "../lib/zipArchive";',
    );
    expect(
      campaignRoute.match(/archiver\("zip", \{ zlib: \{ level: 6 \} \}\)/g),
    ).toHaveLength(2);
  });
});
