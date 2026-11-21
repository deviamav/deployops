import path from "node:path";
import fs from "node:fs/promises";

export const UPLOADS_ROOT = path.resolve(process.cwd(), "uploads");

/**
 * On-disk storage folders for templates, content packs, and entry files.
 */
export const PATHS = {
  landings: path.join(UPLOADS_ROOT, "templates"),
  offers: path.join(UPLOADS_ROOT, "content-packs"),
  entryScripts: path.join(UPLOADS_ROOT, "entry-scripts"),
} as const;

export async function ensureUploadDirs(): Promise<void> {
  await fs.mkdir(PATHS.landings, { recursive: true });
  await fs.mkdir(PATHS.offers, { recursive: true });
  await fs.mkdir(PATHS.entryScripts, { recursive: true });
}
