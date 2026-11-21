"use client";

import { useCallback, useEffect, useState } from "react";
import { useClientList } from "@/hooks/use-client-list";
import { ListFooter, ListToolbar } from "@/components/list-toolbar";
import { PageHeader } from "@/components/page-header";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Lock, Pencil, Plus, Server, Trash2 } from "lucide-react";
import { RowActions, Truncate } from "@/components/row-actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

interface Row {
  id: string;
  key: string;
  name: string;
  webRootTemplate: string;
  webUser: string | null;
  isBuiltin: boolean;
  createdAt: string;
  serversCount: number;
}

export default function SetupsPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);

  const getHaystack = useCallback(
    (s: Row) => [s.key, s.name, s.webRootTemplate, s.webUser],
    [],
  );
  const list = useClientList(items, getHaystack, (i) => i.id, 25);

  async function load() {
    const data = await fetch("/api/admin/setups").then((r) => r.json());
    if (Array.isArray(data)) setItems(data);
  }
  useEffect(() => {
    load();
  }, []);

  async function remove(s: Row) {
    if (s.isBuiltin) {
      toast.error("Built-in presets cannot be deleted");
      return;
    }
    if (s.serversCount > 0) {
      toast.error(`In use by ${s.serversCount} server(s)`);
      return;
    }
    if (!confirm(`Delete preset "${s.name}"?`)) return;
    const r = await fetch(`/api/admin/setups/${s.id}`, { method: "DELETE" });
    if (r.ok) {
      toast.success("Deleted");
      load();
    } else {
      const e = await r.json().catch(() => ({}));
      toast.error(e?.error ?? "Error");
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Web root path and web-user presets · {domain} is replaced with the domain name"
        title="Server Setups"
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus className="mr-1 h-4 w-4" /> Add setup
          </Button>
        }
      />

      <ListToolbar
        search={list.search}
        onSearchChange={list.setSearch}
        onPasteText={list.onPasteMass}
        placeholder="Key, name, webRoot…"
        tokensCount={list.tokens.length}
        matchCount={list.total}
      />

      <Card className="ui-table-wrap overflow-hidden rounded-3xl p-0">
        <div className="overflow-x-auto">
        <Table className="min-w-[880px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox checked={list.allPageSelected} onCheckedChange={list.togglePage} />
              </TableHead>
              <TableHead>Key</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>webRoot template</TableHead>
              <TableHead>webUser</TableHead>
              <TableHead>Used</TableHead>
              <TableHead className="w-[140px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.pageItems.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-zinc-500">
                  No presets
                </TableCell>
              </TableRow>
            )}
            {list.pageItems.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <Checkbox
                    checked={list.selected.has(s.id)}
                    onCheckedChange={() => list.toggle(s.id)}
                  />
                </TableCell>
                <TableCell className="font-mono text-xs">
                  <div className="flex min-w-0 max-w-[140px] items-center gap-1.5">
                    {s.isBuiltin && (
                      <Lock className="h-3 w-3 shrink-0 text-zinc-500" aria-label="builtin" />
                    )}
                    <Truncate>{s.key}</Truncate>
                  </div>
                </TableCell>
                <TableCell>
                  <Truncate className="max-w-[160px]">{s.name}</Truncate>
                </TableCell>
                <TableCell className="font-mono text-xs text-zinc-300">
                  <Truncate className="max-w-[240px]" title={s.webRootTemplate}>
                    {s.webRootTemplate}
                  </Truncate>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  <Truncate className="max-w-[120px]">{s.webUser ?? "—"}</Truncate>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    <Server className="mr-1 h-3 w-3" />
                    {s.serversCount}
                  </Badge>
                </TableCell>
                <TableCell>
                  <RowActions
                    maxVisible={3}
                    actions={[
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
                        onClick: () => remove(s),
                        tone: "danger",
                        hidden: s.isBuiltin,
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

      <SetupDialog
        open={adding}
        onOpenChange={setAdding}
        onSaved={load}
        mode="create"
      />
      <SetupDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        onSaved={load}
        mode="edit"
        initial={editing}
      />
    </div>
  );
}

function SetupDialog({
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
  initial?: Row | null;
}) {
  const [form, setForm] = useState({
    key: "",
    name: "",
    webRootTemplate: "/var/www/{domain}",
    webUser: "www-data",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      if (mode === "edit" && initial) {
        setForm({
          key: initial.key,
          name: initial.name,
          webRootTemplate: initial.webRootTemplate,
          webUser: initial.webUser ?? "",
        });
      } else {
        setForm({
          key: "",
          name: "",
          webRootTemplate: "/var/www/{domain}",
          webUser: "www-data",
        });
      }
    }
  }, [open, mode, initial]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.webRootTemplate.includes("{domain}")) {
      toast.error("The web root template must contain {domain}");
      return;
    }
    setLoading(true);
    const url = mode === "edit" && initial ? `/api/admin/setups/${initial.id}` : "/api/admin/setups";
    const method = mode === "edit" ? "PATCH" : "POST";
    const payload =
      mode === "edit"
        ? {
            name: form.name,
            webRootTemplate: form.webRootTemplate,
            webUser: form.webUser.trim() || null,
          }
        : {
            key: form.key.trim(),
            name: form.name,
            webRootTemplate: form.webRootTemplate,
            webUser: form.webUser.trim() || null,
          };
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setLoading(false);
    if (res.ok) {
      toast.success(mode === "edit" ? "Saved" : "Created");
      onOpenChange(false);
      onSaved();
    } else {
      const e = await res.json().catch(() => ({}));
      toast.error(e?.error ?? "Error");
    }
  }

  const isBuiltin = mode === "edit" && initial?.isBuiltin;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "edit" ? `Edit: ${initial?.name}` : "New preset"}
          </DialogTitle>
        </DialogHeader>
        {isBuiltin && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            This is a built-in preset — the key cannot be changed, but the template and user can.
          </div>
        )}
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Key</Label>
              <Input
                value={form.key}
                onChange={(e) => setForm({ ...form, key: e.target.value })}
                placeholder="hestia_custom"
                disabled={mode === "edit"}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Hestia / public_html"
                required
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>
                webRoot template{" "}
                <span className="text-zinc-500 text-xs">
                  (<code className="text-lime-300">{"{domain}"}</code> — replaced with the domain name)
                </span>
              </Label>
              <Input
                value={form.webRootTemplate}
                onChange={(e) => setForm({ ...form, webRootTemplate: e.target.value })}
                className="font-mono"
                placeholder="/home/admin/web/{domain}/public_html"
                required
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>
                webUser <span className="text-zinc-500 text-xs">(optional; used for chown)</span>
              </Label>
              <Input
                value={form.webUser}
                onChange={(e) => setForm({ ...form, webUser: e.target.value })}
                className="font-mono"
                placeholder="www-data | admin | nginx"
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
