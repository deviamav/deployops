"use client";

import { useCallback, useEffect, useState } from "react";
import { useClientList } from "@/hooks/use-client-list";
import { ListFooter, ListToolbar } from "@/components/list-toolbar";
import { PageHeader } from "@/components/page-header";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { RowActions, Truncate } from "@/components/row-actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GeoFlag } from "@/components/geo-flag";
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
  code: string;
  name: string;
  flag: string | null;
  active: boolean;
  _count: { landings: number; offers: number; entryScripts: number; jobs: number };
}

export default function GeosPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState({ code: "", name: "" });

  const getHaystack = useCallback((g: Row) => [g.code, g.name], []);
  const list = useClientList(items, getHaystack, (i) => i.id, 25);

  async function load() {
    const data = await fetch("/api/admin/geos").then((r) => r.json());
    if (Array.isArray(data)) setItems(data);
  }
  useEffect(() => {
    load();
  }, []);

  async function add() {
    if (!form.code || form.code.length !== 2) {
      toast.error("Code must be ISO-2 (e.g. DE)");
      return;
    }
    const res = await fetch("/api/admin/geos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: form.code, name: form.name }),
    });
    if (res.ok) {
      toast.success("Created");
      setAddOpen(false);
      setForm({ code: "", name: "" });
      load();
    } else {
      const e = await res.json().catch(() => ({}));
      toast.error(e?.error ?? "Error");
    }
  }

  async function toggleActive(g: Row) {
    await fetch(`/api/admin/geos/${g.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !g.active }),
    });
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete market?")) return;
    const r = await fetch(`/api/admin/geos/${id}`, { method: "DELETE" });
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
        kicker="Market directory"
        title="Geos"
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Add geo
          </Button>
        }
      />

      <ListToolbar
        search={list.search}
        onSearchChange={list.setSearch}
        onPasteText={list.onPasteMass}
        placeholder="Code, name…"
        tokensCount={list.tokens.length}
        matchCount={list.total}
      />

      <Card className="ui-table-wrap overflow-hidden rounded-3xl p-0">
        <div className="overflow-x-auto">
        <Table className="min-w-[720px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox checked={list.allPageSelected} onCheckedChange={list.togglePage} />
              </TableHead>
              <TableHead>Flag</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Active</TableHead>
              <TableHead>Templates</TableHead>
              <TableHead>Content packs</TableHead>
              <TableHead>Entry scripts</TableHead>
              <TableHead className="w-[140px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.pageItems.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-zinc-500">
                  No markets yet — add the first one
                </TableCell>
              </TableRow>
            )}
            {list.pageItems.map((g) => (
              <TableRow key={g.id}>
                <TableCell>
                  <Checkbox
                    checked={list.selected.has(g.id)}
                    onCheckedChange={() => list.toggle(g.id)}
                  />
                </TableCell>
                <TableCell>
                  <GeoFlag flag={g.flag} code={g.code} size={36} />
                </TableCell>
                <TableCell className="font-mono">{g.code}</TableCell>
                <TableCell>
                  <Truncate className="max-w-[180px]">{g.name}</Truncate>
                </TableCell>
                <TableCell>
                  <button
                    type="button"
                    onClick={() => toggleActive(g)}
                    className={`rounded-md px-1.5 py-0.5 text-[11px] ${
                      g.active ? "bg-emerald-500/15 text-emerald-300" : "bg-zinc-700 text-zinc-400"
                    }`}
                  >
                    {g.active ? "on" : "off"}
                  </button>
                </TableCell>
                <TableCell>{g._count.landings}</TableCell>
                <TableCell>{g._count.offers}</TableCell>
                <TableCell>{g._count.entryScripts}</TableCell>
                <TableCell>
                  <RowActions
                    maxVisible={3}
                    actions={[
                      {
                        key: "edit",
                        label: "Edit",
                        icon: Pencil,
                        onClick: () => setEditing(g),
                      },
                      {
                        key: "delete",
                        label: "Delete",
                        icon: Trash2,
                        onClick: () => remove(g.id),
                        tone: "danger",
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

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add market</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Code (ISO-2)</Label>
              <Input
                value={form.code}
                onChange={(e) =>
                  setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") })
                }
                placeholder="UA"
                maxLength={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Germany"
              />
            </div>
            {form.code.length === 2 && (
              <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-zinc-900/40 p-3">
                <GeoFlag code={form.code} size={32} />
                <span className="text-sm text-zinc-400">
                  The flag is generated automatically from the code <span className="font-mono">{form.code}</span>
                </span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={add}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EditGeoDialog geo={editing} onClose={() => setEditing(null)} onSaved={load} />
    </div>
  );
}

function EditGeoDialog({
  geo,
  onClose,
  onSaved,
}: {
  geo: Row | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (geo) {
      setName(geo.name);
      setActive(geo.active);
    }
  }, [geo]);

  if (!geo) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch(`/api/admin/geos/${geo!.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, active }),
    });
    setLoading(false);
    if (res.ok) {
      toast.success("Saved");
      onClose();
      onSaved();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err?.error ?? "Error");
    }
  }

  return (
    <Dialog open={!!geo} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit market</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-zinc-900/40 p-3">
            <GeoFlag flag={geo.flag} code={geo.code} size={36} />
            <div>
              <div className="font-mono text-lg">{geo.code}</div>
              <div className="text-xs text-zinc-500">Code cannot be changed</div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="accent-lime-500"
            />
            Active (show in selectors)
          </label>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
