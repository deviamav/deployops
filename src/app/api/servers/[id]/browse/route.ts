import { prisma } from "@/lib/prisma";
import { canMutate, HttpError, requireSession } from "@/lib/rbac";
import { badRequest, handleError, ok } from "@/lib/http";
import { openSsh, shellQuote } from "@/lib/ssh";

export interface RemoteEntry {
  name: string;
  path: string;
  isDir: boolean;
  isSymlink: boolean;
  size: number;
  mtime: string | null;
  mode: string;
  owner: string;
}

function isSafePath(p: string): boolean {
  if (!p) return false;
  if (!p.startsWith("/")) return false;
  // забороняємо '..'-сегменти і керовані символи / пробіл-only
  if (/(^|\/)\.\.(\/|$)/.test(p)) return false;
  // забороняємо null-byte
  if (p.includes("\0")) return false;
  return true;
}

/**
 * `GET /api/servers/:id/browse?path=/var/www`
 *
 * Повертає список вмісту каталогу на віддаленому сервері.
 * Без виконання довільних shell-команд: викликаємо `ls` з контрольованими
 * аргументами (через shell-quote).
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireSession();
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const targetPath = url.searchParams.get("path") ?? "/";

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
      const res = await ssh.execCommand(
        `LC_ALL=C ls -lAh --time-style=full-iso ${shellQuote(targetPath)}`,
      );
      if (res.code !== 0) {
        throw new Error(res.stderr || `ls failed (exit ${res.code})`);
      }
      const entries = parseLsOutput(res.stdout, targetPath);
      return ok({ path: targetPath, entries });
    } finally {
      try {
        ssh.dispose();
      } catch {}
    }
  } catch (e) {
    return handleError(e);
  }
}

function parseLsOutput(out: string, base: string): RemoteEntry[] {
  // ls -lAh --time-style=full-iso :
  // -rw-r--r-- 1 root root 4.0K 2026-06-11 10:00:00.000000000 +0000 name
  const lines = out.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("total "));
  const items: RemoteEntry[] = [];
  for (const line of lines) {
    const m = line.match(
      /^(\S+)\s+\d+\s+(\S+)\s+\S+\s+(\S+)\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:\s+[+\-]\d{4})?)\s+(.+)$/,
    );
    if (!m) continue;
    const [, mode, owner, sizeStr, mtimeStr, rawName] = m;
    const isSymlink = mode.startsWith("l");
    let name = rawName;
    if (isSymlink) {
      const arrow = name.indexOf(" -> ");
      if (arrow >= 0) name = name.slice(0, arrow);
    }
    if (name === "." || name === "..") continue;
    const isDir = mode.startsWith("d");
    const fullPath = base === "/" ? `/${name}` : `${base.replace(/\/+$/, "")}/${name}`;
    items.push({
      name,
      path: fullPath,
      isDir,
      isSymlink,
      size: parseLsSize(sizeStr),
      mtime: mtimeStr,
      mode,
      owner,
    });
  }
  items.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return items;
}

function parseLsSize(s: string): number {
  const m = s.match(/^([\d.]+)([KMGT]?)$/);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const mult: Record<string, number> = { "": 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 };
  return Math.round(n * (mult[m[2]] ?? 1));
}
