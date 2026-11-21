"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { matchesSearchTokens, parseSearchTokens } from "@/lib/mass-search";
import { cn } from "@/lib/utils";

export interface DomainOption {
  id: string;
  name: string;
  status: string;
  server: { host: string };
}

interface Props {
  domains: DomainOption[];
  value: string[];
  onChange: (ids: string[]) => void;
}

export function DomainMultiSelect({ domains, value, onChange }: Props) {
  const [search, setSearch] = useState("");

  const tokens = useMemo(() => parseSearchTokens(search), [search]);

  const filtered = useMemo(() => {
    if (tokens.length === 0) return domains;
    return domains.filter((d) =>
      matchesSearchTokens([d.name, d.server.host, d.status], tokens),
    );
  }, [domains, tokens]);

  const selectedSet = useMemo(() => new Set(value), [value]);
  const selectedDomains = useMemo(
    () => domains.filter((d) => selectedSet.has(d.id)),
    [domains, selectedSet],
  );

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((d) => selectedSet.has(d.id));

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  }

  function toggleAllFiltered() {
    if (allFilteredSelected) {
      const filteredIds = new Set(filtered.map((d) => d.id));
      onChange(value.filter((id) => !filteredIds.has(id)));
    } else {
      const next = new Set(value);
      filtered.forEach((d) => next.add(d.id));
      onChange([...next]);
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text");
    const pasted = parseSearchTokens(text);
    if (pasted.length < 2) return;
    e.preventDefault();
    setSearch(pasted.join("\n"));
    const matched = domains.filter((d) =>
      matchesSearchTokens([d.name, d.server.host], pasted),
    );
    if (matched.length > 0) {
      const next = new Set(value);
      matched.forEach((d) => next.add(d.id));
      onChange([...next]);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl surface-inset">
      <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
        <Search className="h-4 w-4 shrink-0 text-lime-400/70" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onPaste={onPaste}
          placeholder="Search or paste a list of domains / IPs…"
          className="h-10 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
        />
        {value.length > 0 && (
          <Badge variant="cyan" className="shrink-0">
            {value.length}
          </Badge>
        )}
      </div>

      {selectedDomains.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b border-white/5 px-4 py-2.5">
          {selectedDomains.slice(0, 8).map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => toggle(d.id)}
              className="inline-flex max-w-[180px] items-center gap-1 rounded-md border border-lime-400/25 bg-lime-400/[0.07] px-2 py-0.5 text-[11px] font-medium text-lime-200 transition hover:bg-lime-500/20"
              title="Remove"
            >
              <span className="truncate">{d.name}</span>
              <X className="h-3 w-3 shrink-0 opacity-70" />
            </button>
          ))}
          {selectedDomains.length > 8 && (
            <span className="self-center text-[11px] text-zinc-500">
              +{selectedDomains.length - 8}
            </span>
          )}
        </div>
      )}

      {tokens.length > 1 && (
        <div className="px-4 pt-2 text-[11px] text-lime-400/80">
          bulk filter: {tokens.length} tokens → {filtered.length} matches
        </div>
      )}

      <div className="flex items-center justify-between px-4 py-2.5">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
          <Checkbox checked={allFilteredSelected} onCheckedChange={toggleAllFiltered} />
          Select all ({filtered.length})
        </label>
        {value.length > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange([])}>
            Reset
          </Button>
        )}
      </div>

      <div className="scrollbar-thin max-h-[min(52vh,420px)] space-y-0.5 overflow-y-auto px-2 pb-3">
        {filtered.length === 0 && (
          <div className="py-10 text-center text-sm text-zinc-500">No domains found</div>
        )}
        {filtered.map((d) => {
          const on = selectedSet.has(d.id);
          return (
            <label
              key={d.id}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200",
                on ? "bg-lime-500/10 ring-1 ring-lime-500/20" : "hover:bg-white/[0.04]",
              )}
            >
              <Checkbox checked={on} onCheckedChange={() => toggle(d.id)} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-zinc-100">{d.name}</div>
                <div className="truncate font-mono text-[11px] text-zinc-500">{d.server.host}</div>
              </div>
              <Badge variant={d.status === "deployed" ? "success" : "secondary"}>{d.status}</Badge>
            </label>
          );
        })}
      </div>
    </div>
  );
}
