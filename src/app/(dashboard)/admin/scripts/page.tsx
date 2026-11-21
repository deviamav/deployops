"use client";

import { useCallback, useEffect, useState } from "react";
import { useClientList } from "@/hooks/use-client-list";
import { BulkBar, ListFooter, ListToolbar } from "@/components/list-toolbar";
import { PageHeader } from "@/components/page-header";
import { toast } from "sonner";
import { useDropzone } from "react-dropzone";
import { Download, Pencil, Plus, Star, Trash2, UploadCloud } from "lucide-react";
import { RowActions, Truncate } from "@/components/row-actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { GeoSelect, GeoBadge } from "@/components/geo-select";
import { formatBytes } from "@/lib/utils";

interface Row {
  id: string;
  name: string;
  isDefault: boolean;
  notes: string | null;
  engine: "php_gateway" | "php_redirect" | "html_gateway";
  uploadedAt: string;
  geoId: string;
  geo: { id: string; code: string; flag: string | null; name: string };
}

export default function EntryScriptsPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const getHaystack = useCallback(
    (r: Row) => [r.name, r.notes, r.engine, r.geo.code, r.geo.name],
    [],
  );
  const list = useClientList(items, getHaystack, (i) => i.id, 25);

  async function load() {
    const data = await fetch("/api/admin/scripts").then((r) => r.json());
    if (Array.isArray(data)) setItems(data);
    list.clearSelection();
  }
  useEffect(() => {
    load();
  }, []);

  async function setDefault(id: string) {
    await fetch(`/api/admin/scripts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    toast.success("Default updated");
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete entry script?")) return;
    const r = await fetch(`/api/admin/scripts/${id}`, { method: "DELETE" });
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
    if (!confirm(`Delete ${list.selected.size} entry script(s)?`)) return;
    const res = await fetch("/api/admin/scripts/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...list.selected] }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      toast.success(`Deleted: ${data.ok ?? list.selected.size}`);
      load();
    } else {
      toast.error(data?.error ?? "Error");
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Entry script library"
        title="Entry Scripts"
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Add entry script
          </Button>
        }
      />

      <ListToolbar
        search={list.search}
        onSearchChange={list.setSearch}
        onPasteText={list.onPasteMass}
        placeholder="Name, geo, notes…"
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
        <Table className="min-w-[720px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox checked={list.allPageSelected} onCheckedChange={list.togglePage} />
              </TableHead>
              <TableHead>Market</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Engine</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead>Default</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead className="w-[140px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.pageItems.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-zinc-500">
                  No entry scripts
                </TableCell>
              </TableRow>
            )}
            {list.pageItems.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Checkbox
                    checked={list.selected.has(r.id)}
                    onCheckedChange={() => list.toggle(r.id)}
                  />
                </TableCell>
                <TableCell>
                  <GeoBadge flag={r.geo.flag} code={r.geo.code} name={r.geo.name} />
                </TableCell>
                <TableCell className="font-medium">
                  <Truncate className="max-w-[180px]">{r.name}</Truncate>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      r.engine === "html_gateway"
                        ? "cyan"
                        : r.engine === "php_redirect"
                          ? "warning"
                          : "secondary"
                    }
                  >
                    {r.engine === "html_gateway"
                      ? "Split layout"
                      : r.engine === "php_redirect"
                        ? "Gateway only"
                        : "Standard layout"}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-zinc-500">
                  <Truncate className="max-w-[200px]" title={r.notes ?? undefined}>
                    {r.notes ?? "—"}
                  </Truncate>
                </TableCell>
                <TableCell>
                  {r.isDefault ? (
                    <Badge variant="warning">★ default</Badge>
                  ) : (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 rounded-lg text-zinc-400 hover:text-zinc-100"
                      onClick={() => setDefault(r.id)}
                      title="Make default"
                    >
                      <Star className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
                <TableCell className="text-xs text-zinc-400">
                  {new Date(r.uploadedAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <RowActions
                    maxVisible={3}
                    actions={[
                      {
                        key: "edit",
                        label: "Edit",
                        icon: Pencil,
                        onClick: () => setEditing(r),
                      },
                      {
                        key: "download",
                        label: "Download",
                        icon: Download,
                        href: `/api/admin/scripts/${r.id}/download`,
                      },
                      {
                        key: "delete",
                        label: "Delete",
                        icon: Trash2,
                        onClick: () => remove(r.id),
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

      <AddScriptDialog open={addOpen} onOpenChange={setAddOpen} onCreated={load} />
      <EditScriptDialog entryScript={editing} onClose={() => setEditing(null)} onSaved={load} />
    </div>
  );
}

function EditScriptDialog({
  entryScript,
  onClose,
  onSaved,
}: {
  entryScript: Row | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [engine, setEngine] = useState<"php_gateway" | "php_redirect" | "html_gateway">(
    "php_gateway",
  );
  const [isDefault, setIsDefault] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (entryScript) {
      setName(entryScript.name);
      setNotes(entryScript.notes ?? "");
      setEngine(entryScript.engine ?? "php_gateway");
      setIsDefault(entryScript.isDefault);
    }
  }, [entryScript]);

  if (!entryScript) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch(`/api/admin/scripts/${entryScript!.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, notes: notes || null, engine, isDefault }),
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
    <Dialog open={!!entryScript} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit entry script</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="text-sm text-zinc-400">
            Geo: <GeoBadge flag={entryScript.geo.flag} code={entryScript.geo.code} name={entryScript.geo.name} />
          </div>
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <EngineSelect value={engine} onChange={setEngine} />
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={isDefault} onCheckedChange={(v) => setIsDefault(!!v)} />
            Default for {entryScript.geo.code}
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

function AddScriptDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [geoId, setGeoId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [engine, setEngine] = useState<"php_gateway" | "php_redirect" | "html_gateway">(
    "php_gateway",
  );
  const [isDefault, setIsDefault] = useState(false);
  const [loading, setLoading] = useState(false);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    multiple: false,
    accept: { "application/x-httpd-php": [".php"], "text/plain": [".php"] },
    onDrop: (files) => {
      const f = files[0];
      if (!f) return;
      setFile(f);
      if (!name) setName(f.name.replace(/\.php$/i, ""));
    },
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !geoId) return;
    setLoading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("name", name);
    fd.append("geoId", geoId);
    fd.append("notes", notes);
    fd.append("engine", engine);
    fd.append("isDefault", String(isDefault));
    const res = await fetch("/api/admin/scripts", { method: "POST", body: fd });
    setLoading(false);
    if (res.ok) {
      toast.success("Entry script added");
      onOpenChange(false);
      setFile(null);
      setName("");
      setEngine("php_gateway");
      setIsDefault(false);
      onCreated();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err?.error ?? "Error");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload entry script (.php)</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div
            {...getRootProps()}
            className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-white/10 px-6 py-8 text-sm text-zinc-400 transition hover:border-lime-500/50 ${
              isDragActive ? "border-lime-500/60 bg-lime-500/5" : ""
            }`}
          >
            <input {...getInputProps()} />
            <UploadCloud className="h-6 w-6" />
            {file ? (
              <div className="text-center text-zinc-200">
                <div className="font-mono text-xs">{file.name}</div>
                <div className="text-xs text-zinc-500">{formatBytes(file.size)}</div>
              </div>
            ) : (
              <span>Drop a .php file or click to browse</span>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Market *</Label>
            <GeoSelect value={geoId ?? undefined} onChange={setGeoId} />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <EngineSelect value={engine} onChange={setEngine} />
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={isDefault} onCheckedChange={(v) => setIsDefault(!!v)} />
            Make default for this market
          </label>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !file || !geoId}>
              Upload
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EngineSelect({
  value,
  onChange,
}: {
  value: "php_gateway" | "php_redirect" | "html_gateway";
  onChange: (v: "php_gateway" | "php_redirect" | "html_gateway") => void;
}) {
  const btn = (
    key: "php_gateway" | "php_redirect" | "html_gateway",
    title: string,
    hint: string,
  ) => (
    <button
      type="button"
      onClick={() => onChange(key)}
      className={`rounded-xl border px-3 py-2.5 text-left text-sm transition ${
        value === key
          ? "border-lime-500/40 bg-lime-500/10 text-lime-100"
          : "border-white/10 text-zinc-400 hover:bg-white/5"
      }`}
    >
      <div className="font-medium">{title}</div>
      <div className="mt-0.5 text-[11px] text-zinc-500">{hint}</div>
    </button>
  );

  return (
    <div className="space-y-1.5">
      <Label>Layout</Label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {btn("php_gateway", "Standard layout", "content.php · reffo/per")}
        {btn("php_redirect", "Gateway only", "content.php · entry script only")}
        {btn("html_gateway", "Split layout", "index.php · offer/ · white/")}
      </div>
    </div>
  );
}
