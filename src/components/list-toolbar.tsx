"use client";

import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PaginationBar } from "@/components/pagination-bar";
import { cn } from "@/lib/utils";

interface ListToolbarProps {
  search: string;
  onSearchChange: (v: string) => void;
  onPasteText?: (text: string) => boolean | void;
  placeholder?: string;
  tokensCount?: number;
  matchCount?: number;
  actions?: React.ReactNode;
  className?: string;
}

/** Пошук з підтримкою paste списку (domains/IP/імена). */
export function ListToolbar({
  search,
  onSearchChange,
  onPasteText,
  placeholder = "Search or paste a list…",
  tokensCount = 0,
  matchCount,
  actions,
  className,
}: ListToolbarProps) {
  const multi = tokensCount > 1;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          {multi ? (
            <textarea
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              onPaste={(e) => {
                if (!onPasteText) return;
                const text = e.clipboardData.getData("text");
                if (onPasteText(text)) e.preventDefault();
              }}
              rows={Math.min(6, Math.max(2, search.split("\n").length))}
              placeholder={placeholder}
              className="w-full resize-y rounded-lg border border-white/[0.08] bg-[#0c0c0e] py-2 pl-10 pr-10 text-[13px] text-zinc-100 placeholder:text-zinc-600 hover:border-white/[0.14] focus-visible:border-lime-400/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400/20"
            />
          ) : (
            <Input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              onPaste={(e) => {
                if (!onPasteText) return;
                const text = e.clipboardData.getData("text");
                if (onPasteText(text)) e.preventDefault();
              }}
              placeholder={placeholder}
              className="h-9 pl-10 pr-10"
            />
          )}
          {search && (
            <button
              type="button"
              className="absolute right-3 top-3 text-zinc-500 hover:text-zinc-200"
              onClick={() => onSearchChange("")}
              aria-label="Clear"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {actions}
      </div>
      {tokensCount > 1 && (
        <p className="text-[11px] text-lime-400/90">
          bulk filter · {tokensCount} tokens
          {typeof matchCount === "number" ? ` → ${matchCount} matches` : ""}
        </p>
      )}
    </div>
  );
}

interface BulkBarProps {
  count: number;
  onClear: () => void;
  onSelectAllFiltered?: () => void;
  children?: React.ReactNode;
}

export function BulkBar({ count, onClear, onSelectAllFiltered, children }: BulkBarProps) {
  if (count === 0) return null;
  return (
    <div className="bulk-bar">
      <span className="text-[13px] font-medium text-lime-200">Selected: {count}</span>
      {onSelectAllFiltered && (
        <Button size="sm" variant="ghost" onClick={onSelectAllFiltered}>
          All filtered
        </Button>
      )}
      {children}
      <Button size="sm" variant="ghost" onClick={onClear}>
        Reset
      </Button>
    </div>
  );
}

interface ListFooterProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (p: number) => void;
}

export function ListFooter({ page, pageSize, total, onPageChange }: ListFooterProps) {
  return (
    <PaginationBar page={page} pageSize={pageSize} total={total} onPageChange={onPageChange} />
  );
}
