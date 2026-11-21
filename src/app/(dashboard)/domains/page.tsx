"use client";

import { roleLabel } from "@/lib/utils";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  Circle,
  FolderSearch,
  Pencil,
  Plus,
  Trash2,
  Undo2,
  UploadCloud,
  Wand2,
} from "lucide-react";
import { RollbackDialog } from "@/components/rollback-dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import { BulkImportDialog } from "@/components/bulk-import-dialog";
import { parseDomainsTxt } from "@/lib/parsers/domains-txt";
import { UserSelect } from "@/components/user-select";
import { PageHeader } from "@/components/page-header";
import { ListToolbar, BulkBar, ListFooter } from "@/components/list-toolbar";
import { useClientList } from "@/hooks/use-client-list";
import { Checkbox } from "@/components/ui/checkbox";
import { RowActions, Truncate } from "@/components/row-actions";

interface DomainRow {
  id: string;
  name: string;
  webRoot: string;
  deployMode: "pack_only" | "template_and_pack";
  status: string;
  lastDeployAt: string | null;
  server: {
    id: string;
    host: string;
    name: string;
    setup?: { id: string; key: string; name: string; webRootTemplate: string } | null;
  };
  ownerId: string;
  owner: { id: string; email: string; name: string | null };
}

interface ServerRow {
  id: string;
  name: string;
  host: string;
  setup?: {
    id: string;
    key: string;
    name: string;
    webRootTemplate: string;
  } | null;
}

interface MeInfo {
  role: "admin" | "team_lead" | "operator";
  id: string;
}

export default function DomainsPage() {
  const [items, setItems] = useState<DomainRow[]>([]);
  const [servers, setServers] = useState<ServerRow[]>([]);
  const [filterServer, setFilterServer] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("__all__");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<DomainRow | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [rollbackDomain, setRollbackDomain] = useState<DomainRow | null>(null);
  const [me, setMe] = useState<MeInfo | null>(null);

  async function load() {
    const [d, s, m] = await Promise.all([
      fetch("/api/domains").then((r) => r.json()),
      fetch("/api/servers").then((r) => r.json()),
      fetch("/api/me").then((r) => r.json()).catch(() => null),
    ]);
    if (Array.isArray(d)) setItems(d);
    if (Array.isArray(s)) setServers(s);
    if (m?.user?.role) setMe({ id: m.user.id, role: m.user.role });
  }
  useEffect(() => {
    load();
  }, []);

  const isAdmin = me?.role === "admin";

  const prefiltered = useMemo(() => {
    let r = items;
    if (filterServer) r = r.filter((d) => d.server.id === filterServer);
    if (filterStatus !== "__all__") r = r.filter((d) => d.status === filterStatus);
    return r;
  }, [items, filterServer, filterStatus]);

  const getHaystack = useCallback(
    (d: DomainRow) => [d.name, d.server.host, d.server.name, d.webRoot, d.owner.email],
    [],
  );
  const getId = useCallback((d: DomainRow) => d.id, []);
  const list = useClientList(prefiltered, getHaystack, getId, 25);

  useEffect(() => {
    list.clearSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  async function remove(id: string, name: string) {
    if (!confirm(`Delete domain ${name}?`)) return;
    const r = await fetch(`/api/domains/${id}`, { method: "DELETE" });
    if (r.ok) {
      toast.success("Deleted");
      load();
    } else {
      const e = await r.json().catch(() => ({}));
      toast.error(e?.error ?? "Error");
    }
  }

  async function bulkDelete() {
    if (list.selected.size === 0) return;
    if (!confirm(`Delete ${list.selected.size} domain(s)?`)) return;
    const r = await fetch("/api/domains/bulk-ops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...list.selected], action: "delete" }),
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok) {
      toast.success(`Deleted: ${data.ok ?? 0}`);
      load();
    } else {
      toast.error(data?.error ?? "Error");
    }
  }

  async function toggleStatus(d: DomainRow) {
    const next = d.status === "deployed" ? "pending" : "deployed";
    const label =
      next === "deployed"
        ? `Mark "${d.name}" as deployed?`
        : `Reset status "${d.name}" to pending?`;
    if (!confirm(label)) return;
    const r = await fetch(`/api/domains/${d.id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (r.ok) {
      toast.success(next === "deployed" ? "Marked as deployed" : "Reset to pending");
      load();
    } else {
      const e = await r.json().catch(() => ({}));
      toast.error(e?.error ?? "Error");
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Domains on VPS servers"
        title="Domains"
        actions={
          isAdmin ? (
            <>
              <Button variant="secondary" onClick={() => setBulkOpen(true)}>
                <UploadCloud className="mr-1 h-4 w-4" /> Bulk import
              </Button>
              <Button onClick={() => setAddOpen(true)}>
                <Plus className="mr-1 h-4 w-4" /> Add domain
              </Button>
            </>
          ) : undefined
        }
      />

      <ListToolbar
        search={list.search}
        onSearchChange={list.setSearch}
        onPasteText={list.onPasteMass}
        placeholder="Search / paste a list of domains or IPs…"
        tokensCount={list.tokens.length}
        matchCount={list.total}
        actions={
          <>
            <div className="w-48">
              <Select
                value={filterServer ?? "__all__"}
                onValueChange={(v) => {
                  setFilterServer(v === "__all__" ? null : v);
                  list.setPage(1);
                }}
              >
                <SelectTrigger className="rounded-2xl">
                  <SelectValue placeholder="Server" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">— all servers —</SelectItem>
                  {servers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({s.host})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-36">
              <Select
                value={filterStatus}
                onValueChange={(v) => {
                  setFilterStatus(v);
                  list.setPage(1);
                }}
              >
                <SelectTrigger className="rounded-2xl">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">— all statuses —</SelectItem>
                  <SelectItem value="pending">pending</SelectItem>
                  <SelectItem value="deployed">deployed</SelectItem>
                  <SelectItem value="failed">failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        }
      />

      {isAdmin && (
        <BulkBar
          count={list.selected.size}
          onClear={list.clearSelection}
          onSelectAllFiltered={list.selectFiltered}
        >
          <Button size="sm" variant="destructive" onClick={bulkDelete}>
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
          </Button>
        </BulkBar>
      )}

      <Card className="ui-table-wrap rounded-3xl p-0">
        <div className="overflow-x-auto">
        <Table className="min-w-[860px]">
          <TableHeader>
            <TableRow>
              {isAdmin && (
                <TableHead className="w-10">
                  <Checkbox checked={list.allPageSelected} onCheckedChange={list.togglePage} />
                </TableHead>
              )}
              <TableHead className="min-w-[200px]">Domain</TableHead>
              <TableHead className="min-w-[140px]">Server</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="min-w-[120px]">Owner</TableHead>
              <TableHead className="w-[140px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.total === 0 && (
              <TableRow>
                <TableCell colSpan={isAdmin ? 7 : 6} className="py-12 text-center text-zinc-500">
                  No domains
                </TableCell>
              </TableRow>
            )}
            {list.pageItems.map((d, idx) => (
              <TableRow key={d.id} style={{ animationDelay: `${Math.min(idx, 8) * 0.04}s` }}>
                {isAdmin && (
                  <TableCell>
                    <Checkbox
                      checked={list.selected.has(d.id)}
                      onCheckedChange={() => list.toggle(d.id)}
                    />
                  </TableCell>
                )}
                <TableCell>
                  <div className="min-w-0 max-w-[280px]">
                    <Truncate className="font-medium text-zinc-100">{d.name}</Truncate>
                    <Truncate className="mt-0.5 font-mono text-[11px] text-zinc-500" title={d.webRoot}>
                      {d.server.setup?.key ? `${d.server.setup.key} · ` : ""}
                      {d.webRoot}
                    </Truncate>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="min-w-0 max-w-[160px]">
                    <Truncate className="text-sm">{d.server.name}</Truncate>
                    <Truncate className="font-mono text-[11px] text-zinc-500">{d.server.host}</Truncate>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={d.deployMode === "pack_only" ? "secondary" : "cyan"}>
                    {d.deployMode === "pack_only" ? "pack" : "template+pack"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={statusBadge(d.status)}>{d.status}</Badge>
                </TableCell>
                <TableCell>
                  <Truncate className="max-w-[140px] text-xs text-zinc-300">
                    {d.owner.name ?? d.owner.email}
                  </Truncate>
                </TableCell>
                <TableCell>
                  <RowActions
                    maxVisible={3}
                    actions={[
                      {
                        key: "deploy",
                        label: "Deploy",
                        icon: Wand2,
                        href: `/deploy?domainId=${d.id}`,
                        tone: "accent",
                      },
                      {
                        key: "status",
                        label: d.status === "deployed" ? "Mark pending" : "Mark deployed",
                        icon: d.status === "deployed" ? Circle : CheckCircle2,
                        onClick: () => toggleStatus(d),
                      },
                      {
                        key: "rollback",
                        label: "Rollback",
                        icon: Undo2,
                        onClick: () => setRollbackDomain(d),
                        tone: "warn",
                        hidden: d.status !== "deployed",
                      },
                      {
                        key: "files",
                        label: "Files",
                        icon: FolderSearch,
                        href: `/servers/${d.server.id}/files?path=${encodeURIComponent(d.webRoot)}`,
                        hidden: !isAdmin,
                      },
                      {
                        key: "edit",
                        label: "Edit",
                        icon: Pencil,
                        onClick: () => setEditing(d),
                        hidden: !isAdmin,
                      },
                      {
                        key: "delete",
                        label: "Delete",
                        icon: Trash2,
                        onClick: () => remove(d.id, d.name),
                        tone: "danger",
                        hidden: !isAdmin,
                      },
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      </Card>

      <ListFooter
        page={list.page}
        pageSize={list.pageSize}
        total={list.total}
        onPageChange={list.setPage}
      />

      <DomainDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        servers={servers}
        onSaved={load}
        mode="create"
      />
      <DomainDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        servers={servers}
        onSaved={load}
        mode="edit"
        initial={editing}
      />

      <RollbackDialog
        open={!!rollbackDomain}
        onOpenChange={(o) => !o && setRollbackDomain(null)}
        domain={rollbackDomain ? { id: rollbackDomain.id, name: rollbackDomain.name } : null}
        onFinish={load}
      />

      <BulkImportDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        title="Bulk import domains"
        description="One domain per line. Server, deploy type and owner are shared by all rows."
        parse={parseDomainsTxt}
        columns={[{ key: "name", label: "Domain" }]}
        textareaPlaceholder={`# Example list\nexample-one.com\nexample-two.com`}
        controls={<BulkDomainControls servers={servers} />}
        onImport={async (text) => {
          const serverId = (
            document.querySelector("[data-bulk-server]") as HTMLInputElement | null
          )?.value;
          const ct = (
            document.querySelector("[data-bulk-deploytype]:checked") as HTMLInputElement | null
          )?.value as "pack_only" | "template_and_pack" | undefined;
          const ownerId = (
            document.querySelector("[data-bulk-domain-owner]") as HTMLInputElement | null
          )?.value;
          if (!serverId) throw new Error("Select a server");
          if (!ct) throw new Error("Select a deploy type");
          const res = await fetch("/api/domains/bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text,
              defaultServerId: serverId,
              defaultDeployMode: ct,
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

function statusBadge(s: string): "success" | "destructive" | "secondary" {
  if (s === "deployed") return "success";
  if (s === "failed") return "destructive";
  return "secondary";
}

function renderTemplate(template: string, domain: string) {
  return template.replaceAll("{domain}", domain).replaceAll("{DOMAIN}", domain).replace(/\/+$/, "");
}

function BulkDomainControls({ servers }: { servers: ServerRow[] }) {
  const [users, setUsers] = useState<{ id: string; email: string; name: string | null; role: string }[]>(
    [],
  );
  useEffect(() => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && setUsers(d))
      .catch(() => {});
  }, []);
  return (
    <div className="grid grid-cols-1 gap-3 rounded-2xl border border-white/5 bg-zinc-950/40 p-4 md:grid-cols-3">
      <div className="space-y-1.5">
        <Label>Default Server</Label>
        <select
          data-bulk-server
          className="h-10 w-full rounded-xl border border-white/10 bg-zinc-900/70 px-3 text-sm"
          defaultValue=""
        >
          <option value="" disabled>
            — select —
          </option>
          {servers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.host}) {s.setup ? `[${s.setup.key}]` : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label>Default deploy type</Label>
        <div className="flex gap-4 pt-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="bulkct"
              value="pack_only"
              data-bulk-deploytype
              defaultChecked
            />
            <span>Content pack only</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="bulkct" value="template_and_pack" data-bulk-deploytype />
            <span>Template + content pack</span>
          </label>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Owner</Label>
        <select
          data-bulk-domain-owner
          className="h-10 w-full rounded-xl border border-white/10 bg-zinc-900/70 px-3 text-sm"
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

function DomainDialog({
  open,
  onOpenChange,
  servers,
  onSaved,
  mode,
  initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  servers: ServerRow[];
  onSaved: () => void;
  mode: "create" | "edit";
  initial?: DomainRow | null;
}) {
  const [form, setForm] = useState({
    serverId: "",
    name: "",
    webRoot: "",
    webRootEdited: false,
    deployMode: "pack_only" as "pack_only" | "template_and_pack",
    ownerId: null as string | null,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && initial) {
      setForm({
        serverId: initial.server.id,
        name: initial.name,
        webRoot: initial.webRoot,
        webRootEdited: true,
        deployMode: initial.deployMode,
        ownerId: initial.ownerId,
      });
    } else {
      setForm({
        serverId: "",
        name: "",
        webRoot: "",
        webRootEdited: false,
        deployMode: "pack_only",
        ownerId: null,
      });
    }
  }, [open, mode, initial]);

  function computeWebRoot(serverId: string, name: string) {
    const srv = servers.find((s) => s.id === serverId);
    const tpl = srv?.setup?.webRootTemplate ?? "/var/www/{domain}";
    return name ? renderTemplate(tpl, name) : "";
  }

  function setName(name: string) {
    setForm((f) => ({
      ...f,
      name,
      webRoot: f.webRootEdited ? f.webRoot : computeWebRoot(f.serverId, name),
    }));
  }

  function setServerId(serverId: string) {
    setForm((f) => ({
      ...f,
      serverId,
      webRoot: f.webRootEdited ? f.webRoot : computeWebRoot(serverId, f.name),
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const url = mode === "edit" && initial ? `/api/domains/${initial.id}` : "/api/domains";
    const method = mode === "edit" ? "PATCH" : "POST";
    const payload: any = {
      serverId: form.serverId,
      name: form.name,
      webRoot: form.webRoot,
      deployMode: form.deployMode,
    };
    if (form.ownerId) payload.ownerId = form.ownerId;
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setLoading(false);
    if (res.ok) {
      toast.success(mode === "edit" ? "Saved" : "Domain added");
      onOpenChange(false);
      onSaved();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err?.error ?? "Error");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "edit" ? `Edit: ${initial?.name}` : "Add domain"}
          </DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label>Server</Label>
            <Select value={form.serverId} onValueChange={setServerId}>
              <SelectTrigger>
                <SelectValue placeholder="select a server…" />
              </SelectTrigger>
              <SelectContent>
                {servers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} ({s.host})
                    {s.setup && (
                      <span className="ml-2 text-xs text-zinc-500">[{s.setup.key}]</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Domain</Label>
            <Input value={form.name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>
              webRoot{" "}
              <span className="text-xs text-zinc-500">
                (auto-filled from the server preset, editable)
              </span>
            </Label>
            <Input
              value={form.webRoot}
              onChange={(e) =>
                setForm({ ...form, webRoot: e.target.value, webRootEdited: true })
              }
              className="font-mono"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Deploy type</Label>
            <RadioGroup
              value={form.deployMode}
              onValueChange={(v) => setForm({ ...form, deployMode: v as any })}
              className="grid grid-cols-2 gap-3"
            >
              {[
                { v: "pack_only", l: "Content pack only" },
                { v: "template_and_pack", l: "Template + content pack" },
              ].map((o) => (
                <label
                  key={o.v}
                  className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-zinc-900/40 p-3 hover:bg-white/5"
                >
                  <RadioGroupItem value={o.v} />
                  <span>{o.l}</span>
                </label>
              ))}
            </RadioGroup>
          </div>
          <div className="space-y-1.5">
            <Label>
              Owner <span className="text-xs text-zinc-500">(who owns this domain)</span>
            </Label>
            <UserSelect
              value={form.ownerId}
              onChange={(id) => setForm({ ...form, ownerId: id })}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !form.serverId}>
              {mode === "edit" ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
