"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { useClientList } from "@/hooks/use-client-list";
import { ListFooter, ListToolbar } from "@/components/list-toolbar";
import { PageHeader } from "@/components/page-header";
import { PaginationBar } from "@/components/pagination-bar";
import { Truncate } from "@/components/row-actions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Row {
  id: string;
  action: string;
  target: string | null;
  meta: any;
  ip: string | null;
  createdAt: string;
  user?: { email: string; name: string | null } | null;
}

const SERVER_PAGE_SIZE = 50;

export default function AuditPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [serverPage, setServerPage] = useState(1);
  const [serverTotal, setServerTotal] = useState(0);

  const getHaystack = useCallback(
    (r: Row) => [
      r.action,
      r.target,
      r.ip,
      r.user?.email,
      r.user?.name,
      r.meta ? JSON.stringify(r.meta) : null,
    ],
    [],
  );
  const list = useClientList(items, getHaystack, (i) => i.id, 25);

  async function load() {
    const qs = new URLSearchParams({
      page: String(serverPage),
      pageSize: String(SERVER_PAGE_SIZE),
    });
    const data = await fetch(`/api/audit?${qs}`).then((r) => r.json());
    if (data?.items) {
      setItems(data.items);
      setServerTotal(data.total);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverPage]);

  return (
    <div className="space-y-8">
      <PageHeader kicker="Audit log" title="Audit" />

      <ListToolbar
        search={list.search}
        onSearchChange={list.setSearch}
        onPasteText={list.onPasteMass}
        placeholder="Action, target, user, IP…"
        tokensCount={list.tokens.length}
        matchCount={list.total}
      />

      <Card className="ui-table-wrap overflow-hidden rounded-3xl p-0">
        <div className="overflow-x-auto">
        <Table className="min-w-[900px]">
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>IP</TableHead>
              <TableHead>Meta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.pageItems.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-zinc-500">
                  No events found
                </TableCell>
              </TableRow>
            )}
            {list.pageItems.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs text-zinc-400">
                  {format(new Date(r.createdAt), "yyyy-MM-dd HH:mm:ss")}
                </TableCell>
                <TableCell className="text-xs">
                  <Truncate className="max-w-[180px]" title={r.user?.email}>
                    {r.user?.email ?? "—"}
                  </Truncate>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{r.action}</Badge>
                </TableCell>
                <TableCell className="font-mono text-[11px]">
                  <Truncate className="max-w-[160px]" title={r.target ?? undefined}>
                    {r.target ?? "—"}
                  </Truncate>
                </TableCell>
                <TableCell className="font-mono text-[11px]">
                  <Truncate className="max-w-[120px]">{r.ip ?? "—"}</Truncate>
                </TableCell>
                <TableCell className="font-mono text-[10px] text-zinc-500">
                  <Truncate
                    className="max-w-[200px]"
                    title={r.meta ? JSON.stringify(r.meta) : undefined}
                  >
                    {r.meta ? JSON.stringify(r.meta) : "—"}
                  </Truncate>
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

      <PaginationBar
        page={serverPage}
        pageSize={SERVER_PAGE_SIZE}
        total={serverTotal}
        onPageChange={setServerPage}
      />
    </div>
  );
}
