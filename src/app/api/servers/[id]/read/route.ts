import path from "node:path";
import fs from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { canMutate, HttpError, requireSession } from "@/lib/rbac";
import { badRequest, handleError, ok } from "@/lib/http";
import { openSsh, shellQuote, getRemoteFile } from "@/lib/ssh";
import { isTextPath, mimeFromPath } from "@/lib/zip-edit";

const MAX_TEXT_BYTES = 4 * 1024 * 1024;
const MAX_BIN_BYTES = 32 * 1024 * 1024;

function isSafePath(p: string): boolean {
  if (!p) return false;
  if (!p.startsWith("/")) return false;
  if (/(^|\/)\.\.(\/|$)/.test(p)) return false;
  if (p.includes("\0")) return false;
  return true;
}

/**
 * `GET /api/servers/:id/read?path=/var/www/x.php`
 *
 * Текстові файли — повертає `{ text: "..." }` (для редактора).
 * Бінарні / зображення — `?raw=1` віддає вміст напряму з відповідним
 * Content-Type для preview.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireSession();
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const targetPath = url.searchParams.get("path") ?? "";
    const raw = url.searchParams.get("raw") === "1";
    if (!isSafePath(targetPath)) return badRequest("unsafe path");

    const server = await prisma.server.findUnique({
      where: { id },
      include: { owner: true },
    });
    if (!server) throw new HttpError(404, "server not found");
    if (!canMutate(me, { ownerId: server.ownerId, groupId: server.owner.groupId })) {
      throw new HttpError(403, "forbidden");
    }

    const ssh = await openSsh(server);
    try {
      const sizeRes = await ssh.execCommand(
        `stat -c '%s|%F' ${shellQuote(targetPath)}`,
      );
      if (sizeRes.code !== 0) {
        throw new Error(sizeRes.stderr || `stat failed`);
      }
      const [sizeStr, type] = sizeRes.stdout.trim().split("|");
      const size = parseInt(sizeStr, 10);
      if (type !== "regular file" && type !== "regular empty file") {
        return badRequest(`not a regular file: ${type}`);
      }
      if (raw) {
        if (size > MAX_BIN_BYTES) return badRequest("file too large");
        const localTmp = path.join(process.cwd(), "uploads", ".tmp", `srv-${Date.now()}`);
        await fs.mkdir(path.dirname(localTmp), { recursive: true });
        await getRemoteFile(ssh, localTmp, targetPath);
        const buf = await fs.readFile(localTmp);
        await fs.unlink(localTmp).catch(() => {});
        return new Response(new Uint8Array(buf), {
          headers: {
            "Content-Type": mimeFromPath(targetPath),
            // SECURITY: компрометований VPS міг записати .html/.svg з JS, тому
            // дивимось вміст у sandbox без allow-same-origin — це створює
            // opaque origin, JS не має доступу до cookie панелі.
            "Content-Security-Policy":
              "sandbox allow-forms allow-popups; default-src 'self' data: blob:; img-src * data: blob:;",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "no-store",
          },
        });
      }
      if (!isTextPath(targetPath)) {
        return ok({ binary: true, size, mime: mimeFromPath(targetPath) });
      }
      if (size > MAX_TEXT_BYTES) return badRequest("file too large for editor");
      const localTmp = path.join(process.cwd(), "uploads", ".tmp", `srv-${Date.now()}`);
      await fs.mkdir(path.dirname(localTmp), { recursive: true });
      await getRemoteFile(ssh, localTmp, targetPath);
      const text = await fs.readFile(localTmp, "utf8");
      await fs.unlink(localTmp).catch(() => {});
      return ok({ binary: false, content: text, size });
    } finally {
      try {
        ssh.dispose();
      } catch {}
    }
  } catch (e) {
    return handleError(e);
  }
}
