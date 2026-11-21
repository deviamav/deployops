"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Undo2, XCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LogViewer } from "@/components/log-viewer";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  domain: { id: string; name: string } | null;
  onFinish?: () => void;
}

type JobStatus = "idle" | "running" | "success" | "failed";

export function RollbackDialog({ open, onOpenChange, domain, onFinish }: Props) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [status, setStatus] = useState<JobStatus>("idle");

  // Тримаємо актуальне onFinish без ре-підписки SSE.
  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  // Reset при закритті.
  useEffect(() => {
    if (!open) {
      setJobId(null);
      setLines([]);
      setStatus("idle");
    }
  }, [open]);

  // SSE підписка — лише на jobId. Уникаємо повторних підключень.
  useEffect(() => {
    if (!jobId) return;
    const es = new EventSource(`/api/deploy/rollback/${jobId}/log`);
    let finished = false;
    es.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload.line) setLines((cur) => [...cur, payload.line]);
        if (payload.done && !finished) {
          finished = true;
          setStatus(payload.status as JobStatus);
          es.close();
          if (payload.status === "success") {
            toast.success(`Rollback completed: ${domain?.name ?? ""}`, {
              duration: 8_000,
            });
            onFinishRef.current?.();
          } else {
            toast.error(`Rollback failed: ${domain?.name ?? ""}`, { duration: 12_000 });
          }
        }
      } catch {}
    };
    es.onerror = () => es.close();
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  async function start() {
    if (!domain) return;
    setStatus("running");
    setLines([]);
    const res = await fetch("/api/deploy/rollback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domainId: domain.id }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err?.error ?? "Failed to start rollback");
      setStatus("failed");
      return;
    }
    const j = await res.json();
    setJobId(j.jobId);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="h-5 w-5 text-amber-300" />
            Roll back <span className="font-mono">{domain?.name}</span>
          </DialogTitle>
          <DialogDescription>
            The deploy layout is detected automatically (split layout with <code>white/</code>, or
            standard / gateway layout with <code>content.php</code>). Deployed folders are removed and
            the original <code>index.php</code>/<code>.html</code> is restored. You can deploy again
            afterwards.
          </DialogDescription>
        </DialogHeader>

        {status === "idle" && (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-200">
            This removes the deployed layout on the server (content folders and the entry script)
            and restores the original index file. Click “Run rollback” to continue.
          </div>
        )}

        {(status !== "idle" || lines.length > 0) && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-zinc-500">Status:</span>
              <Badge
                variant={
                  status === "success"
                    ? "success"
                    : status === "failed"
                    ? "destructive"
                    : "warning"
                }
              >
                {status === "success" && <CheckCircle2 className="mr-1 h-3 w-3" />}
                {status === "failed" && <XCircle className="mr-1 h-3 w-3" />}
                {status}
              </Badge>
            </div>
            <LogViewer lines={lines} status={status} />
          </div>
        )}

        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={status === "running"}
          >
            {status === "idle" ? "Cancel" : "Close"}
          </Button>
          {status === "idle" && (
            <Button variant="destructive" onClick={start}>
              <Undo2 className="mr-1 h-4 w-4" /> Run rollback
            </Button>
          )}
          {status === "running" && (
            <Button disabled>
              <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Running…
            </Button>
          )}
          {status === "failed" && (
            <Button variant="destructive" onClick={start}>
              <Undo2 className="mr-1 h-4 w-4" /> Retry
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
