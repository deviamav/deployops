"use client";

import { useCallback, useEffect, useState } from "react";
import { useClientList } from "@/hooks/use-client-list";
import { ListFooter, ListToolbar } from "@/components/list-toolbar";
import { formatDistanceToNow } from "date-fns";
import { Eye } from "lucide-react";
import { RowActions, Truncate } from "@/components/row-actions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { GeoBadge } from "@/components/geo-select";
import { PaginationBar } from "@/components/pagination-bar";
import { PageHeader } from "@/components/page-header";

interface JobRow {
  id: string;
  status: "queued" | "running" | "success" | "failed";
  startedAt: string;
  finishedAt: string | null;
  domain: { id: string; name: string; deployMode: string };
  deployMode?: string | null;
  pixelPlatform?: string | null;
  geo: { code: string; flag: string | null };
  entryScript: { name: string };
  startedBy: { email: string };
  landingId: string | null;
  offerId: string | null;
  log: string;
}

export default function HistoryPage() {
  const [items, setItems] = useState<JobRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [openLog, setOpenLog] = useState<JobRow | null>(null);

  const getHaystack = useCallback(
    (j: JobRow) => [
      j.domain.name,
      j.geo.code,
      j.status,
      j.startedBy.email,
      j.entryScript.name,
      j.deployMode ?? j.domain.deployMode,
      j.pixelPlatform,
    ],
    [],
  );
  const list = useClientList(items, getHaystack, (i) => i.id, 25);

  async function load(p = page) {
    const data = await fetch(`/api/deploy?page=${p}&pageSize=${pageSize}`).then((r) => r.json());
    if (Array.isArray(data?.items)) {
      setItems(data.items);
      setTotal(typeof data.total === "number" ? data.total : data.items.length);
    }
  }
  useEffect(() => {
    load(page);
    const t = setInterval(() => load(page), 10_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  return (
    <div className="space-y-8">
      <PageHeader kicker="Deploy job history" title="History" />

      <ListToolbar
        search={list.search}
        onSearchChange={list.setSearch}
        onPasteText={list.onPasteMass}
        placeholder="Domain, geo, status, email…"
        tokensCount={list.tokens.length}
        matchCount={list.total}
      />

      <Card className="ui-table-wrap overflow-hidden rounded-3xl p-0">
        <div className="overflow-x-auto">
        <Table className="min-w-[960px]">
          <TableHeader>
            <TableRow>
              <TableHead>Domain</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Analytics</TableHead>
              <TableHead>Market</TableHead>
              <TableHead>Entry script</TableHead>
              <TableHead>By</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead className="w-[100px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.pageItems.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="py-10 text-center text-zinc-500">
                  No deploy jobs yet
                </TableCell>
              </TableRow>
            )}
            {list.pageItems.map((j) => (
              <TableRow key={j.id}>
                <TableCell className="font-medium">
                  <Truncate className="max-w-[160px]">{j.domain.name}</Truncate>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      (j.deployMode ?? j.domain.deployMode) === "pack_only" ? "secondary" : "cyan"
                    }
                  >
                    {(j.deployMode ?? j.domain.deployMode) === "pack_only"
                      ? "pack"
                      : "template+pack"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{j.pixelPlatform ?? "google"}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="inline-flex items-center gap-1 py-1.5">
                    <GeoBadge flag={j.geo.flag} code={j.geo.code} size={26} />
                  </Badge>
                </TableCell>
                <TableCell className="text-xs">
                  <Truncate className="max-w-[140px]">{j.entryScript.name}</Truncate>
                </TableCell>
                <TableCell className="text-xs">
                  <Truncate className="max-w-[160px]" title={j.startedBy.email}>
                    {j.startedBy.email}
                  </Truncate>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      j.status === "success"
                        ? "success"
                        : j.status === "failed"
                          ? "destructive"
                          : j.status === "running"
                            ? "warning"
                            : "secondary"
                    }
                  >
                    {j.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-zinc-400">
                  {formatDistanceToNow(new Date(j.startedAt), { addSuffix: true })}
                </TableCell>
                <TableCell className="text-xs text-zinc-400">
                  {j.finishedAt
                    ? `${Math.round(
                        (new Date(j.finishedAt).getTime() - new Date(j.startedAt).getTime()) /
                          1000,
                      )}s`
                    : "—"}
                </TableCell>
                <TableCell>
                  <RowActions
                    maxVisible={3}
                    actions={[
                      {
                        key: "log",
                        label: "View log",
                        icon: Eye,
                        onClick: () => setOpenLog(j),
                      },
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
        <ListFooter
          page={list.page}
          pageSize={list.pageSize}
          total={list.total}
          onPageChange={list.setPage}
        />
      </Card>

      <PaginationBar page={page} pageSize={pageSize} total={total} onPageChange={setPage} />

      <Dialog open={!!openLog} onOpenChange={(o) => !o && setOpenLog(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Log · {openLog?.domain.name}</DialogTitle>
          </DialogHeader>
          <pre className="scrollbar-thin max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-2xl border border-white/5 bg-black/70 p-4 font-mono text-xs text-zinc-300">
            {openLog?.log || "(empty)"}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
