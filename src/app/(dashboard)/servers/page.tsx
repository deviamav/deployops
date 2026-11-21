"use client";

import { roleLabel } from "@/lib/utils";

import { useCallback, useEffect, useState } from "react";
import { useClientList } from "@/hooks/use-client-list";
import { BulkBar, ListFooter, ListToolbar } from "@/components/list-toolbar";
import { PageHeader } from "@/components/page-header";
import { toast } from "sonner";
import { FolderSearch, Pencil, Plus, RefreshCcw, Trash2, UploadCloud, Zap } from "lucide-react";
import { RowActions, Truncate } from "@/components/row-actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BulkImportDialog } from "@/components/bulk-import-dialog";
import { parseServersTxt } from "@/lib/parsers/servers-txt";
import { SetupSelect } from "@/components/setup-select";
import { UserSelect } from "@/components/user-select";

interface ServerRow {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  notes: string | null;
  createdAt: string;
  domainsCount: number;
  setupId: string | null;
  setup: {
    id: string;
    key: string;
    name: string;
    webRootTemplate: string;
    webUser: string | null;
  } | null;
  ownerId: string;
  owner: { id: string; email: string; name: string | null } | null;
}

export default function ServersPage() {
  const [items, setItems] = useState<ServerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<ServerRow | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [latency, setLatency] = useState<Record<string, { ok: boolean; ms: number; err?: string }>>({});
  const getHaystack = useCallback(
    (s: ServerRow) => [
      s.name,
      s.host,
      String(s.port),
      s.username,
      s.notes,
      s.owner?.email,
      s.owner?.name,
      s.setup?.key,
      s.setup?.name,
    ],
    [],
  );
  const list = useClientList(items, getHaystack, (i) => i.id, 25);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/servers").then((r) => r.json());
    if (Array.isArray(res)) setItems(res);
    list.clearSelection();
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function test(id: string) {
    const res = await fetch(`/api/servers/${id}/test`, { method: "POST" }).then((r) => r.json());
    setLatency((prev) => ({
      ...prev,
      [id]: { ok: res.ok, ms: res.latencyMs, err: res.error },
    }));
    if (res.ok) toast.success(`SSH OK · ${res.latencyMs}ms`);
    else toast.error(`SSH error: ${res.error}`);
  }

  async function remove(id: string) {
    if (!confirm("Delete server?")) return;
    await fetch(`/api/servers/${id}`, { method: "DELETE" });
    toast.success("Deleted");
    load();
  }

  async function bulkDelete() {
    if (list.selected.size === 0) return;
    if (!confirm(`Delete ${list.selected.size} server(s)? (servers with domains are skipped)`)) return;
    const res = await fetch("/api/servers/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...list.selected] }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      toast.success(`Deleted: ${data.ok ?? 0}`);
      if (data.errors?.length) toast.warning(`${data.errors.length} not deleted (domains attached?)`);
      load();
    } else {
      toast.error(data?.error ?? "Error");
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="VPS inventory (SSH)"
        title="Servers"
        actions={
          <>
            <Button variant="secondary" onClick={load}>
              <RefreshCcw className="mr-1 h-4 w-4" /> Refresh
            </Button>
            <Button variant="secondary" onClick={() => setBulkOpen(true)}>
              <UploadCloud className="mr-1 h-4 w-4" /> Bulk import
            </Button>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> Add server
            </Button>
          </>
        }
      />

      <ListToolbar
        search={list.search}
        onSearchChange={list.setSearch}
        onPasteText={list.onPasteMass}
        placeholder="Name, host, IP, user…"
        tokensCount={list.tokens.length}
        matchCount={list.total}
      />

      <BulkBar
        count={list.selected.size}
        onClear={list.clearSelection}
        onSelectAllFiltered={list.selectFiltered}
      >
        <Button size="sm" variant="destructive" onClick={bulkDelete}>
          <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
        </Button>
      </BulkBar>

      <Card className="ui-table-wrap rounded-3xl p-0">
        <div className="overflow-x-auto">
        <Table className="min-w-[960px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox checked={list.allPageSelected} onCheckedChange={list.togglePage} />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Host</TableHead>
              <TableHead>SSH user</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Setup</TableHead>
              <TableHead>Domains</TableHead>
              <TableHead>SSH</TableHead>
              <TableHead className="w-[140px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-zinc-500">
                  loading…
                </TableCell>
              </TableRow>
            )}
            {!loading && list.total === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-zinc-500">
                  No servers yet. Add the first one.
                </TableCell>
              </TableRow>
            )}
            {list.pageItems.map((s) => {
              const l = latency[s.id];
              return (
                <TableRow key={s.id}>
                  <TableCell>
                    <Checkbox
                      checked={list.selected.has(s.id)}
                      onCheckedChange={() => list.toggle(s.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <Truncate className="max-w-[160px] font-medium">{s.name}</Truncate>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    <Truncate title={`${s.host}:${s.port}`}>
                      {s.host}:{s.port}
                    </Truncate>
                  </TableCell>
                  <TableCell>
                    <Truncate className="max-w-[100px]">{s.username}</Truncate>
                  </TableCell>
                  <TableCell className="text-xs">
                    <Truncate className="max-w-[140px]">
                      {s.owner?.name ?? s.owner?.email ?? "—"}
                    </Truncate>
                  </TableCell>
                  <TableCell>
                    {s.setup ? (
                      <div className="flex flex-col">
                        <Badge variant="cyan" className="w-fit">{s.setup.key}</Badge>
                        <span className="mt-1 font-mono text-[10px] text-zinc-500">
                          {s.setup.webRootTemplate}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-500">default</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{s.domainsCount}</Badge>
                  </TableCell>
                  <TableCell>
                    {l ? (
                      l.ok ? (
                        <Badge variant="success">{l.ms}ms</Badge>
                      ) : (
                        <Badge variant="destructive">{l.err}</Badge>
                      )
                    ) : (
                      <span className="text-zinc-600 text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <RowActions
                      maxVisible={3}
                      actions={[
                        {
                          key: "test",
                          label: "Test SSH",
                          icon: Zap,
                          onClick: () => test(s.id),
                          tone: "warn",
                        },
                        {
                          key: "files",
                          label: "Server files",
                          icon: FolderSearch,
                          href: `/servers/${s.id}/files`,
                        },
                        {
                          key: "edit",
                          label: "Edit",
                          icon: Pencil,
                          onClick: () => setEditing(s),
                        },
                        {
                          key: "delete",
                          label: "Delete",
                          icon: Trash2,
                          onClick: () => remove(s.id),
                          tone: "danger",
                        },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
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

      <ServerDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSaved={load}
        mode="create"
      />
      <ServerDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        onSaved={load}
        mode="edit"
        initial={editing}
      />

      <BulkImportDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        title="Bulk import servers"
        description="Format: <IP>\\t<password>\\t<domain1> <domain2>… (one server per line). The web root is built from the selected server preset."
        parse={parseServersTxt}
        columns={[
          { key: "host", label: "IP" },
          { key: "password", label: "Password" },
          { key: "domains", label: "Domains" },
        ]}
        textareaPlaceholder={`37.1.221.109\tdrBDx9T66y\txusulora.pro xakomi.pro\n45.136.196.175\tdVBN5LXQj4\tbikidequft.pro`}
        controls={<BulkServerControls />}
        onImport={async (text) => {
          const setupId = (
            document.querySelector("[data-bulk-setup]") as HTMLInputElement | null
          )?.value;
          const ownerId = (
            document.querySelector("[data-bulk-owner]") as HTMLInputElement | null
          )?.value;
          const res = await fetch("/api/servers/bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text,
              setupId: setupId || null,
              ownerId: ownerId || undefined,
            }),
          }).then((r) => r.json());
          load();
          return res;
        }}
      />
    </div>
  );
}

function BulkServerControls() {
  const [setups, setSetups] = useState<{ id: string; name: string; webRootTemplate: string }[]>([]);
  const [users, setUsers] = useState<{ id: string; email: string; name: string | null; role: string }[]>([]);
  useEffect(() => {
    fetch("/api/admin/setups")
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && setSetups(d))
      .catch(() => {});
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && setUsers(d))
      .catch(() => {});
  }, []);
  return (
    <div className="grid grid-cols-1 gap-3 rounded-2xl border border-white/5 bg-zinc-950/40 p-4 md:grid-cols-2">
      <div>
        <Label>Server preset (web root template)</Label>
        <select
          data-bulk-setup
          className="mt-1.5 h-10 w-full rounded-xl border border-white/10 bg-zinc-900/70 px-3 text-sm"
          defaultValue=""
        >
          <option value="">— default (/var/www/{"{domain}"}) —</option>
          {setups.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} → {s.webRootTemplate}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label>Owner (who owns these servers)</Label>
        <select
          data-bulk-owner
          className="mt-1.5 h-10 w-full rounded-xl border border-white/10 bg-zinc-900/70 px-3 text-sm"
          defaultValue=""
        >
          <option value="">— me (admin) —</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name ?? u.email} [{roleLabel(u.role)}]
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function ServerDialog({
  open,
  onOpenChange,
  onSaved,
  mode,
  initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  mode: "create" | "edit";
  initial?: ServerRow | null;
}) {
  const [form, setForm] = useState({
    name: "",
    host: "",
    port: 22,
    username: "root",
    password: "",
    notes: "",
    setupId: null as string | null,
    ownerId: null as string | null,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      if (mode === "edit" && initial) {
        setForm({
          name: initial.name,
          host: initial.host,
          port: initial.port,
          username: initial.username,
          password: "",
          notes: initial.notes ?? "",
          setupId: initial.setupId,
          ownerId: initial.ownerId,
        });
      } else {
        setForm({
          name: "",
          host: "",
          port: 22,
          username: "root",
          password: "",
          notes: "",
          setupId: null,
          ownerId: null,
        });
      }
    }
  }, [open, mode, initial]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const url = mode === "edit" && initial ? `/api/servers/${initial.id}` : "/api/servers";
    const method = mode === "edit" ? "PATCH" : "POST";
    const payload: any = {
      name: form.name,
      host: form.host,
      port: form.port,
      username: form.username,
      notes: form.notes || null,
      setupId: form.setupId,
    };
    if (form.ownerId) payload.ownerId = form.ownerId;
    if (form.password) payload.password = form.password;
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setLoading(false);
    if (res.ok) {
      toast.success(mode === "edit" ? "Saved" : "Server added");
      onOpenChange(false);
      onSaved();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err?.error ?? "Error");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "edit" ? `Edit: ${initial?.name}` : "Add server"}
          </DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="vps-pl-01"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Host</Label>
              <Input
                value={form.host}
                onChange={(e) => setForm({ ...form, host: e.target.value })}
                placeholder="37.1.221.109"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Port</Label>
              <Input
                type="number"
                value={form.port}
                onChange={(e) => setForm({ ...form, port: Number(e.target.value) })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>User</Label>
              <Input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>
                Password{" "}
                {mode === "edit" && (
                  <span className="text-zinc-500 text-xs">(leave empty to keep unchanged)</span>
                )}
              </Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required={mode === "create"}
                autoComplete="new-password"
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>
                Setup type{" "}
                <span className="text-zinc-500 text-xs">
                  (defines the web root for new domains and the chown user)
                </span>
              </Label>
              <SetupSelect
                value={form.setupId}
                onChange={(id) => setForm({ ...form, setupId: id })}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>
                Owner{" "}
                <span className="text-zinc-500 text-xs">(who owns this server)</span>
              </Label>
              <UserSelect
                value={form.ownerId}
                onChange={(id) => setForm({ ...form, ownerId: id })}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Notes</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="optional"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {mode === "edit" ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
