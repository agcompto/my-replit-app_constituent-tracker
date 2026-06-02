import * as archiverModule from "archiver";

type ZipArchiveFactory = new (
  options?: archiverModule.ZipOptions,
) => archiverModule.Archiver;
type ArchiverRuntimeModule = { ZipArchive?: ZipArchiveFactory };

/**
 * Create a ZIP archive using archiver@8's ESM class export.
 *
 * Do not call the module namespace as `archiver("zip", ...)`: archiver@8 no
 * longer exports a callable CommonJS-style function, and bundlers correctly
 * warn that calling the namespace object will crash at runtime. The Definitely
 * Typed package still models archiver's older `export =` callable API, so this
 * small adapter isolates the compatibility cast while keeping route code on the
 * real ESM runtime contract.
 */
export function createZipArchive(
  options?: archiverModule.ZipOptions,
): archiverModule.Archiver {
  const { ZipArchive } = archiverModule as unknown as ArchiverRuntimeModule;
  if (typeof ZipArchive !== "function") {
    throw new Error(
      "archiver ZIP support is unavailable: expected archiver@8 to export ZipArchive",
    );
  }

  return new ZipArchive(options);
}
