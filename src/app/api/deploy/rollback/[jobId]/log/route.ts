import { requireSession } from "@/lib/rbac";
import { DeployJobBus, jobEvents } from "@/server/deploy/jobs";
import { getRollbackJob } from "@/server/deploy/rollback-runner";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const me = await requireSession().catch(() => null);
  if (!me) return new Response("unauthorized", { status: 401 });
  const { jobId } = await params;

  const info = getRollbackJob(jobId);
  if (!info) return new Response("not found", { status: 404 });

  // Перевірка прав: admin або власник/team_lead групи
  const isAdmin = me.role === "admin";
  const isOwner = info.ownerId === me.id;
  const isTeamLead = me.role === "team_lead" && info.groupId && me.groupId === info.groupId;
  if (!isAdmin && !isOwner && !isTeamLead) {
    return new Response("forbidden", { status: 403 });
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {}
      };

      for (const line of jobEvents.getBuffered(jobId)) send({ line });

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
