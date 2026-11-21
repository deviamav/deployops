import { lookup } from "node:dns/promises";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NodeSSH } from "node-ssh";
import type { Server } from "@prisma/client";
import { decryptSecret } from "./crypto";

export interface SshTestResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

/**
 * SECURITY (SSRF/DNS-rebinding): резолвимо хост у конкретну IP-адресу
 * перед SSH-конектом і перевіряємо її через checkHostForbidden. Підключатись
 * далі будемо саме по resolved IP — це закриває DNS-rebinding (TOCTOU),
 * коли A-запис може повернути іншу адресу між валідацією і `connect`.
 *
 * Якщо host вже є IP-літералом — додатково перевіряємо через
 * checkHostForbidden, бо ssh.connect міг би прийняти "::ffff:127.0.0.1".
 */
export async function resolveAndCheckHost(host: string): Promise<string> {
  const direct = checkHostForbidden(host);
  if (direct) throw new Error(`SSH host rejected: ${direct}`);
  const isLiteralV4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
  const isLiteralV6 = host.includes(":");
  if (isLiteralV4 || isLiteralV6) return host;
  const addrs = await lookup(host, { all: true, verbatim: true });
  if (!addrs.length) throw new Error(`SSH host: DNS lookup failed for ${host}`);
  for (const a of addrs) {
    const err = checkHostForbidden(a.address);
    if (err) {
      throw new Error(`SSH host ${host} resolves to forbidden address: ${err}`);
    }
  }
  return addrs[0].address;
}

export async function openSsh(server: Pick<Server, "host" | "port" | "username" | "passwordEncrypted">): Promise<NodeSSH> {
  const ip = await resolveAndCheckHost(server.host);
  const ssh = new NodeSSH();
  await ssh.connect({
    host: ip,
    port: server.port,
    username: server.username,
    password: decryptSecret(server.passwordEncrypted),
    readyTimeout: 15_000,
  });
  return ssh;
}

export async function testSsh(
  server: Pick<Server, "host" | "port" | "username" | "passwordEncrypted">,
): Promise<SshTestResult> {
  const t0 = Date.now();
  try {
    const ssh = await openSsh(server);
    const res = await ssh.execCommand("echo ok");
    ssh.dispose();
    if (res.code !== 0) {
      return { ok: false, latencyMs: Date.now() - t0, error: res.stderr || `exit ${res.code}` };
    }
    return { ok: true, latencyMs: Date.now() - t0 };
  } catch (e: any) {
    return { ok: false, latencyMs: Date.now() - t0, error: e?.message ?? String(e) };
  }
}

/**
 * Безпечне shell-екранування для POSIX-команд. node-ssh.execCommand вже
 * захищає від injection через argv, але деякі команди ми будуємо як рядок
 * (наприклад, `find ... | head -n1`), тому шляхи треба обережно квотити.
 */
export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * SECURITY (SSRF): забороняє підключення до приватних/internal діапазонів,
 * щоб admin (або зловмисник з admin-сесією) не міг через "Add Server" зробити
 * SSH-port-scan локальної інфри panel-VPS чи дотягтись до internal сервісів.
 *
 * Повертає null якщо хост валідний, інакше — повідомлення для UI.
 */
export function checkHostForbidden(host: string): string | null {
  const h = host.trim().toLowerCase();
  if (!h) return "host: порожнє значення";

  // 1) hostname-форма — лишаємо як є; ssh2 зробить resolve.
  //    Блокуємо очевидні loopback-aliases.
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h === "localhost.localdomain") {
    return "host: loopback/internal hostname заборонено";
  }

  // 2) IPv4 — парсимо і перевіряємо приватні діапазони (RFC1918, loopback, link-local, multicast, CGNAT)
  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const o = ipv4.slice(1).map(Number);
    if (o.some((n) => n > 255)) return "host: некоректний IPv4";
    const [a, b] = o;
    if (a === 10) return "host: приватний 10.0.0.0/8";
    if (a === 127) return "host: loopback 127.0.0.0/8";
    if (a === 169 && b === 254) return "host: link-local 169.254.0.0/16";
    if (a === 172 && b >= 16 && b <= 31) return "host: приватний 172.16.0.0/12";
    if (a === 192 && b === 168) return "host: приватний 192.168.0.0/16";
    if (a === 100 && b >= 64 && b <= 127) return "host: CGNAT 100.64.0.0/10";
    if (a >= 224) return "host: multicast/reserved";
    if (a === 0) return "host: 0.0.0.0/8";
  }

  // 3) IPv6-mapped IPv4 ::ffff:x.x.x.x — рекурсивно перевіряємо як IPv4
  const v6mappedV4 = h.match(/^(?:::ffff:|0:0:0:0:0:ffff:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  if (v6mappedV4) {
    const inner = checkHostForbidden(v6mappedV4[1]);
    if (inner) return `host: IPv6-mapped ${inner}`;
  }

  // 4) IPv6 — блокуємо loopback, всі форми (::1, 0:0:0:0:0:0:0:1, ::ffff:0:1, тощо),
  //    unique-local (fc00::/7), link-local (fe80::/10), unspecified (::), multicast (ff00::/8).
  if (h === "::" || h === "0:0:0:0:0:0:0:0") return "host: IPv6 unspecified заборонено";
  if (h === "::1" || h.startsWith("::1:") || /^0:0:0:0:0:0:0:1$/i.test(h) || /^(?:0:){6}0:1$/i.test(h)) {
    return "host: IPv6 loopback заборонено";
  }
  if (/^f[cd][0-9a-f]{0,2}:/i.test(h)) return "host: IPv6 unique-local заборонено";
  if (/^fe[89ab][0-9a-f]?:/i.test(h)) return "host: IPv6 link-local заборонено";
  if (/^ff[0-9a-f]{0,2}:/i.test(h)) return "host: IPv6 multicast заборонено";

  return null;
}

/** Типова помилка Hestia: Subsystem sftp internal-sftp-server (exit 127). */
export function isSftpUnavailableError(err: unknown): boolean {
  const msg =
    err instanceof Error
      ? `${err.message} ${err.name}`
      : typeof err === "string"
        ? err
        : JSON.stringify(err ?? "");
  return (
    /exit code 127/i.test(msg) ||
    /establishing SFTP/i.test(msg) ||
    /sftp/i.test(msg) ||
    /No SFTP/i.test(msg)
  );
}

/** Hestia/Vesta webRoot: /home/<user>/web/<domain>/public_html */
export function looksLikeHestiaPath(remotePath: string): boolean {
  return /^\/home\/[^/]+\/web\//.test(remotePath);
}

/**
 * Відомий баг HestiaCP: у sshd_config написано `internal-sftp-server`
 * замість `internal-sftp` — SFTP падає з exit 127, SSH shell працює.
 * Виправляємо + reload (без drop існуючих сесій).
 */
export async function tryFixHestiaSftp(ssh: NodeSSH): Promise<boolean> {
  const check = await ssh.execCommand(
    `grep -E '^[[:space:]]*Subsystem[[:space:]]+sftp[[:space:]]+internal-sftp-server' /etc/ssh/sshd_config 2>/dev/null || true`,
  );
  if (!check.stdout.trim()) return false;

  const fix = await ssh.execCommand(
    `sed -i 's|^\\([[:space:]]*Subsystem[[:space:]]\\+sftp[[:space:]]\\+\\)internal-sftp-server|\\1internal-sftp|' /etc/ssh/sshd_config && ` +
      `( systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || ` +
      `  kill -HUP "$(cat /var/run/sshd.pid 2>/dev/null)" 2>/dev/null || true ) && echo FIXED`,
  );
  return fix.stdout.includes("FIXED");
}

/** На одному SSH-конекті після першого fail SFTP більше не чіпаємо. */
const sftpBroken = new WeakSet<NodeSSH>();

async function putViaShell(ssh: NodeSSH, localPath: string, remotePath: string): Promise<void> {
  const buf = await fs.readFile(localPath);
  const dir = posixDirname(remotePath);
  const mkdir = await ssh.execCommand(`mkdir -p ${shellQuote(dir)}`);
  if (mkdir.code !== 0 && mkdir.code !== null) {
    throw new Error(`mkdir ${dir}: ${mkdir.stderr || mkdir.stdout || `exit ${mkdir.code}`}`);
  }

  // base64 через stdin — надійніше за binary Readable у node-ssh (Hestia/OpenSSH).
  const b64 = buf.toString("base64");
  const res = await ssh.execCommand(
    `base64 -d > ${shellQuote(remotePath)} 2>/dev/null || base64 -D > ${shellQuote(remotePath)}`,
    { stdin: b64 },
  );
  if (res.code !== 0 && res.code !== null) {
    // fallback: raw cat (може зіпсувати binary на деяких локалях — лише якщо base64 fail)
    const res2 = await ssh.execCommand(`cat > ${shellQuote(remotePath)}`, {
      stdin: Readable.from(buf),
    });
    if (res2.code !== 0 && res2.code !== null) {
      throw new Error(
        `shell upload failed: ${res.stderr || res2.stderr || res.stdout || `exit ${res.code}`}`,
      );
    }
  }

  // sanity: розмір
  const st = await ssh.execCommand(`stat -c %s ${shellQuote(remotePath)} 2>/dev/null || wc -c < ${shellQuote(remotePath)}`);
  const remoteSize = parseInt(st.stdout.trim(), 10);
  if (Number.isFinite(remoteSize) && remoteSize !== buf.length) {
    throw new Error(
      `shell upload size mismatch: local=${buf.length} remote=${remoteSize} (${remotePath})`,
    );
  }
}

async function getViaShell(ssh: NodeSSH, localPath: string, remotePath: string): Promise<void> {
  const res = await ssh.execCommand(
    `base64 -w0 ${shellQuote(remotePath)} 2>/dev/null || base64 ${shellQuote(remotePath)}`,
  );
  if (res.code !== 0 && res.code !== null) {
    throw new Error(
      `shell download failed: ${res.stderr || res.stdout || `exit ${res.code}`}`,
    );
  }
  const b64 = res.stdout.replace(/\s+/g, "");
  await fs.mkdir(path.dirname(localPath), { recursive: true });
  await fs.writeFile(localPath, Buffer.from(b64, "base64"));
}

function posixDirname(p: string): string {
  const i = p.lastIndexOf("/");
  return i <= 0 ? "/" : p.slice(0, i);
}

export type TransferLog = (line: string) => void;

/**
 * Upload: на Hestia-шляхах одразу shell; інакше SFTP → shell fallback.
 * Будь-яка помилка SFTP → shell (не тільки exit 127).
 */
export async function putRemoteFile(
  ssh: NodeSSH,
  localPath: string,
  remotePath: string,
  log?: TransferLog,
): Promise<void> {
  const preferShell = sftpBroken.has(ssh) || looksLikeHestiaPath(remotePath);

  if (!preferShell) {
    try {
      await ssh.putFile(localPath, remotePath);
      return;
    } catch (e) {
      sftpBroken.add(ssh);
      log?.(
        `  ! SFTP fail: ${e instanceof Error ? e.message : String(e)} — fallback shell upload`,
      );
      const fixed = await tryFixHestiaSftp(ssh);
      if (fixed) {
        log?.(`  ✓ sshd: internal-sftp-server → internal-sftp (reload)`);
        try {
          await ssh.putFile(localPath, remotePath);
          sftpBroken.delete(ssh);
          return;
        } catch (e2) {
          log?.(
            `  ! SFTP still broken after fix — shell: ${e2 instanceof Error ? e2.message : String(e2)}`,
          );
        }
      }
    }
  } else {
    log?.(`  · transfer: shell (hestia/no-sftp) → ${remotePath}`);
  }

  await putViaShell(ssh, localPath, remotePath);
}

/** Download з тим самим fallback. */
export async function getRemoteFile(
  ssh: NodeSSH,
  localPath: string,
  remotePath: string,
  log?: TransferLog,
): Promise<void> {
  const preferShell = sftpBroken.has(ssh) || looksLikeHestiaPath(remotePath);

  if (!preferShell) {
    try {
      await ssh.getFile(localPath, remotePath);
      return;
    } catch (e) {
      sftpBroken.add(ssh);
      log?.(
        `  ! SFTP fail: ${e instanceof Error ? e.message : String(e)} — fallback shell download`,
      );
      const fixed = await tryFixHestiaSftp(ssh);
      if (fixed) {
        try {
          await ssh.getFile(localPath, remotePath);
          sftpBroken.delete(ssh);
          return;
        } catch {
          /* fall through */
        }
      }
    }
  }

  await getViaShell(ssh, localPath, remotePath);
}
