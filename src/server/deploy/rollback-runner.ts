import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { openSsh } from "@/lib/ssh";
import { logEvent } from "@/lib/audit";
import { DeployEngine } from "./engine";
import { jobEvents } from "./jobs";

/**
 * Ephemeral rollback jobs (not stored in the DB as CloakJob).
 * Kept in memory only, to check access when a client attaches to the SSE stream.
 */
interface RollbackJobInfo {
  domainId: string;
  ownerId: string;
  groupId: string | null;
  startedById: string;
}
const rollbackJobs = new Map<string, RollbackJobInfo>();

export function getRollbackJob(jobId: string): RollbackJobInfo | undefined {
  return rollbackJobs.get(jobId);
}

export async function startRollbackJob(input: {
  domainId: string;
  userId: string;
}): Promise<string> {
  const jobId = `rollback-${randomUUID()}`;
  const domain = await prisma.domain.findUnique({
    where: { id: input.domainId },
    include: { server: { include: { setup: true } }, owner: true },
  });
  if (!domain) throw new Error("domain not found");
  rollbackJobs.set(jobId, {
    domainId: domain.id,
    ownerId: domain.ownerId,
    groupId: domain.owner.groupId,
    startedById: input.userId,
  });
  // Run asynchronously
  runRollback(jobId, domain).catch((e) => console.error("[rollback] background:", e));
  return jobId;
}

async function runRollback(
  jobId: string,
  domain: {
    id: string;
    name: string;
    webRoot: string;
    originalIndex: string | null;
    server: {
      host: string;
      port: number;
      username: string;
      passwordEncrypted: string;
      setup?: { webUser: string | null } | null;
    };
  },
): Promise<void> {
  const emit = (line: string) => {
    jobEvents.emitLine(jobId, `[${new Date().toISOString()}] ${line}`);
  };

  emit(`▶ rollback start: ${domain.name}`);
  emit(`  server: ${domain.server.host}:${domain.server.port}`);

  let status: "success" | "failed" = "success";
  let errorMsg: string | undefined;
  let ssh = null as Awaited<ReturnType<typeof openSsh>> | null;

  try {
    ssh = await openSsh(domain.server);
    emit("  ✓ ssh connected");

    const engine = new DeployEngine({
      ssh,
      domain,
      webUser: domain.server.setup?.webUser ?? null,
      emit,
    });
    await engine.rollback();
  } catch (e: any) {
    status = "failed";
    errorMsg = e?.message ?? String(e);
    emit(`✗ ERROR: ${errorMsg}`);
  } finally {
    try {
      ssh?.dispose();
    } catch {}
  }

  await prisma.domain.update({
    where: { id: domain.id },
    data: {
      status: status === "success" ? "pending" : "failed",
      lastCloakAt: null,
      ...(status === "success" ? { originalIndex: null } : {}),
    },
  });

  const info = rollbackJobs.get(jobId);
  await logEvent({
    userId: info?.startedById ?? null,
    action: "domain.rollback",
    target: domain.id,
    meta: { domainName: domain.name, status, error: errorMsg ?? null },
  });

  jobEvents.finish(jobId, status);
  jobEvents.cleanup(jobId);
  setTimeout(() => rollbackJobs.delete(jobId), 10 * 60_000);
}
