import { EventEmitter } from "node:events";

/**
 * In-memory pub/sub for the live log of deploy jobs.
 * Every line emits a `log` event with the payload `{jobId, line}`.
 *
 * A buffer of the latest lines is kept per jobId so that clients
 * attaching later still receive the history.
 */
class DeployJobBus extends EventEmitter {
  private buffers = new Map<string, string[]>();
  private finished = new Set<string>();
  static readonly EVENT = "log";
  static readonly DONE = "done";

  constructor() {
    super();
    this.setMaxListeners(0);
  }

  emitLine(jobId: string, line: string): void {
    const buf = this.buffers.get(jobId) ?? [];
    buf.push(line);
    if (buf.length > 5000) buf.shift();
    this.buffers.set(jobId, buf);
    this.emit(DeployJobBus.EVENT, jobId, line);
  }

  finish(jobId: string, status: "success" | "failed"): void {
    this.finished.add(jobId);
    this.emit(DeployJobBus.DONE, jobId, status);
  }

  isFinished(jobId: string): boolean {
    return this.finished.has(jobId);
  }

  getBuffered(jobId: string): string[] {
    return [...(this.buffers.get(jobId) ?? [])];
  }

  cleanup(jobId: string): void {
    setTimeout(() => {
      this.buffers.delete(jobId);
      this.finished.delete(jobId);
    }, 5 * 60_000);
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __deployops_bus: DeployJobBus | undefined;
}

export const jobEvents: DeployJobBus = globalThis.__deployops_bus ?? new DeployJobBus();
if (!globalThis.__deployops_bus) globalThis.__deployops_bus = jobEvents;

export { DeployJobBus };
