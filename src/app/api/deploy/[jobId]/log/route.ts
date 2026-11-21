import { prisma } from "@/lib/prisma";
import { requireSession, visibilityWhere } from "@/lib/rbac";
import { DeployJobBus, jobEvents } from "@/server/deploy/jobs";

/**
 * SSE-стрім live-логу deploy-job. Кожне повідомлення — JSON-рядок
 * `{ line: string }`. Завершальне — `{ done: true, status: "success" | "failed" }`.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;

  const me = await requireSession().catch(() => null);
  if (!me) {
    return new Response("unauthorized", { status: 401 });
  }
  const job = await prisma.deployJob.findFirst({
    where: { id: jobId, ...visibilityWhere(me, "job") },
  });
  if (!job) {
    return new Response("not found", { status: 404 });
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {}
      };

      // 1) історія
      const buffered = jobEvents.getBuffered(jobId);
      for (const line of buffered) send({ line });

      // 2) live
      const onLine = (id: string, line: string) => {
        if (id !== jobId) return;
        send({ line });
      };
      const onDone = (id: string, status: "success" | "failed") => {
        if (id !== jobId) return;
        send({ done: true, status });
        try {
          controller.close();
        } catch {}
        jobEvents.off(DeployJobBus.EVENT, onLine);
        jobEvents.off(DeployJobBus.DONE, onDone);
      };

      if (jobEvents.isFinished(jobId)) {
        send({ done: true, status: "success" });
        try {
          controller.close();
        } catch {}
        return;
      }

      jobEvents.on(DeployJobBus.EVENT, onLine);
      jobEvents.on(DeployJobBus.DONE, onDone);

      const ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {}
      }, 15_000);

      req.signal.addEventListener("abort", () => {
        clearInterval(ping);
        jobEvents.off(DeployJobBus.EVENT, onLine);
        jobEvents.off(DeployJobBus.DONE, onDone);
        try {
          controller.close();
        } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
