import path from "node:path";
import fs from "node:fs/promises";

export const UPLOADS_ROOT = path.resolve(process.cwd(), "uploads");

/**
 * On-disk storage folders. Key names are internal; the product terms are:
 *   landings → Templates · offers → Content Packs · cloakers → Entry Scripts.
 * Folder names are kept so existing uploads stay valid.
 */
export const PATHS = {
  landings: path.join(UPLOADS_ROOT, "landings"),
  offers: path.join(UPLOADS_ROOT, "offers"),
  cloakers: path.join(UPLOADS_ROOT, "cloakers"),
} as const;

export async function ensureUploadDirs(): Promise<void> {
  await fs.mkdir(PATHS.landings, { recursive: true });
  await fs.mkdir(PATHS.offers, { recursive: true });
  await fs.mkdir(PATHS.cloakers, { recursive: true });
}
