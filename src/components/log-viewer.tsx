"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  lines: string[];
  className?: string;
  status?: "idle" | "running" | "success" | "failed";
}

export function LogViewer({ lines, className, status }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, autoScroll]);

  return (
    <div className={cn("relative", className)}>
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const t = e.currentTarget;
          const atBottom = t.scrollHeight - (t.scrollTop + t.clientHeight) < 20;
          setAutoScroll(atBottom);
        }}
        className="scrollbar-thin h-80 overflow-auto rounded-2xl border border-white/5 bg-black/70 p-4 font-mono text-xs leading-relaxed text-zinc-300"
      >
        {lines.length === 0 && (
          <div className="text-zinc-600">
            {status === "running" ? "→ waiting for output…" : "the log will appear here"}
          </div>
        )}
        {lines.map((l, i) => (
          <div key={i} className={colorize(l)}>
            {l}
          </div>
        ))}
      </div>
      {!autoScroll && (
        <button
          onClick={() => setAutoScroll(true)}
          className="absolute bottom-3 right-3 rounded-md border border-white/[0.08] bg-[#111113] px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          ↓ Auto-scroll
        </button>
      )}
    </div>
  );
}

function colorize(line: string): string {
  if (line.startsWith("✗") || line.includes("ERROR")) return "text-rose-400";
  if (line.startsWith("✓") || line.includes("✓")) return "text-emerald-300";
  if (line.startsWith("step:") || line.startsWith("▶")) return "text-lime-300";
  if (line.startsWith("    !")) return "text-amber-300";
  return "";
}
