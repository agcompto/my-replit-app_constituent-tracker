import * as archiverModule from "archiver";

type ZipArchiveFactory = new (options?: archiverModule.ZipOptions) => archiverModule.Archiver;

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
export function createZipArchive(options?: archiverModule.ZipOptions): archiverModule.Archiver {
  const { ZipArchive } = archiverModule as unknown as { ZipArchive: ZipArchiveFactory };
  return new ZipArchive(options);
}

/** Compatibility wrapper that preserves the old call-site shape without calling
 * the package namespace object. Only ZIP archives are supported by current API
 * routes; add explicit cases here if another format is needed later. */
export function archiver(format: "zip", options?: archiverModule.ZipOptions): archiverModule.Archiver {
  if (format !== "zip") {
    throw new Error(`Unsupported archive format: ${format}`);
  }
  return createZipArchive(options);
}
