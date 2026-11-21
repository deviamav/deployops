import { NodeSSH } from "node-ssh";
import { prisma } from "@/lib/prisma";
import { openSsh } from "@/lib/ssh";
import { logEvent } from "@/lib/audit";
import { DeployEngine } from "./engine";
import { jobEvents } from "./jobs";

interface RunInput {
  jobId: string;
}

/**
 * Runs a deploy job asynchronously: connects over SSH, picks the pipeline
 * (content pack only / template + content pack / gateway only), streams the log
 * through jobEvents and stores the final status in the DB.
 *
 * Note: Prisma models (CloakJob, CloakerScript, Offer, Landing) keep their legacy names;
 * in the product they are Deploy Jobs, Entry Scripts, Content Packs and Templates.
 */
export async function runDeployJob({ jobId }: RunInput): Promise<void> {
  const job = await prisma.cloakJob.findUnique({
    where: { id: jobId },
    include: {
      domain: { include: { server: { include: { setup: true } } } },
      cloakerScript: true,
    },
  });
  if (!job) {
    jobEvents.emitLine(jobId, `✗ job ${jobId} not found in DB`);
    jobEvents.finish(jobId, "failed");
    return;
  }

  await prisma.cloakJob.update({
    where: { id: jobId },
    data: { status: "running" },
  });

  const lines: string[] = [];
  const emit = (line: string) => {
    const stamped = `[${new Date().toISOString()}] ${line}`;
    lines.push(stamped);
    jobEvents.emitLine(jobId, stamped);
  };

  emit(`▶ deploy start: ${job.domain.name} (${job.domain.cloakType})`);
  emit(`  server: ${job.domain.server.host}:${job.domain.server.port}`);
  emit(`  entry script: ${job.cloakerScript.name}`);
  emit(`  transfer: v2 (panel→shell)`);

  let ssh: NodeSSH | null = null;
  let status: "success" | "failed" = "success";
  let errorMsg: string | undefined;

  try {
    ssh = await openSsh(job.domain.server);
    emit("  ✓ ssh connected");

    const cloakerEngine =
      job.cloakerScript.engine === "cubbe"
        ? "cubbe"
        : job.cloakerScript.engine === "palladium_redirect"
          ? "palladium_redirect"
          : "palladium";

    const engine = new DeployEngine({
      ssh,
      domain: job.domain,
      webUser: job.domain.server.setup?.webUser ?? null,
      pixelPlatform: job.pixelPlatform,
      cloakerEngine,
      emit,
      onOriginalIndexDetected: async (kind) => {
        await prisma.domain.update({
          where: { id: job.domainId },
          data: { originalIndex: kind },
        });
      },
    });

    const effectiveType = job.cloakType ?? job.domain.cloakType;
    emit(`  type: ${effectiveType}${job.cloakType ? " (override)" : ""}`);
    emit(`  analytics preset: ${job.pixelPlatform}`);
    emit(`  layout: ${cloakerEngine}`);

    // Gateway-only layout: no template / content pack is uploaded — only content.php + the entry script.
    if (cloakerEngine === "palladium_redirect") {
      await engine.deployPackOnly({
        offerZipPath: "",
        cloakerScriptPath: job.cloakerScript.filePath,
      });
    } else if (effectiveType === "offer_only") {
      if (!job.offerId) throw new Error("content pack is required for a full deploy");
      const offer = await prisma.offer.findUnique({ where: { id: job.offerId } });
      if (!offer) throw new Error(`content pack not found: ${job.offerId}`);
      await engine.deployPackOnly({
        offerZipPath: offer.filePath,
        cloakerScriptPath: job.cloakerScript.filePath,
      });
    } else {
      if (!job.offerId) throw new Error("content pack is required for a full deploy");
      const offer = await prisma.offer.findUnique({ where: { id: job.offerId } });
      if (!offer) throw new Error(`content pack not found: ${job.offerId}`);
      if (!job.landingId) throw new Error("template is required for template + content pack");
      const landing = await prisma.landing.findUnique({ where: { id: job.landingId } });
      if (!landing) throw new Error(`template not found: ${job.landingId}`);
      const landingName =
        job.landingName || landing.name || landing.originalFilename.replace(/\.zip$/i, "");
      await engine.deployTemplateAndPack({
        landingZipPath: landing.filePath,
        offerZipPath: offer.filePath,
        landingName,
        cloakerScriptPath: job.cloakerScript.filePath,
      });
    }
  } catch (e: any) {
    status = "failed";
    errorMsg = e?.message ?? String(e);
    emit(`✗ ERROR: ${errorMsg}`);
  } finally {
    if (ssh) {
      try {
        ssh.dispose();
      } catch {}
    }
  }

  await prisma.cloakJob.update({
    where: { id: jobId },
    data: {
      status,
      finishedAt: new Date(),
      log: lines.join("\n"),
    },
  });
  await prisma.domain.update({
    where: { id: job.domainId },
    data: {
      status: status === "success" ? "deployed" : "failed",
      lastCloakAt: status === "success" ? new Date() : undefined,
    },
  });
  await logEvent({
    userId: job.startedById,
    action: "deploy.finish",
    target: job.id,
    meta: { domainId: job.domainId, status, error: errorMsg ?? null },
  });
  jobEvents.finish(jobId, status);
  jobEvents.cleanup(jobId);
}
