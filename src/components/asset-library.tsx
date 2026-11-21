"use client";

import { useCallback, useEffect, useState } from "react";
import { RowActions, Truncate } from "@/components/row-actions";
import { toast } from "sonner";
import { useDropzone } from "react-dropzone";
import {
  Download,
  ExternalLink,
  FileCode2,
  Pencil,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { GroupSelect } from "@/components/group-select";
import { formatBytes } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { ListToolbar, BulkBar, ListFooter } from "@/components/list-toolbar";
import { useClientList } from "@/hooks/use-client-list";

interface AssetRow {
  id: string;
  name: string;
  originalFilename: string;
  sizeBytes: number;
  uploadedAt: string;
  geo: { id: string; code: string; flag: string | null; name: string };
  group: { id: string; name: string } | null;
  uploadedBy?: { email: string };
}

interface Props {
  kind: "templates" | "packs";
  title: string;
  description: string;
  canUpload: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canDownload: boolean;
  canViewCode: boolean;
}

export function AssetLibrary({
  kind,
  title,
  description,
  canUpload,
  canEdit,
  canDelete,
  canDownload,
  canViewCode,
}: Props) {
  const canEditMeta = canUpload || canEdit;
  const [items, setItems] = useState<AssetRow[]>([]);
  const [filterGeo, setFilterGeo] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editing, setEditing] = useState<AssetRow | null>(null);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);

  const getHaystack = useCallback(
    (i: AssetRow) => [i.name, i.originalFilename, i.geo.code, i.geo.name, i.group?.name],
    [],
  );
  const list = useClientList(items, getHaystack, (i) => i.id, 25);

  const load = useCallback(async () => {
    const url = filterGeo ? `/api/${kind}?geoId=${filterGeo}` : `/api/${kind}`;
    const data = await fetch(url).then((r) => r.json());
    if (Array.isArray(data)) setItems(data);
    list.clearSelection();
  }, [filterGeo, kind, list.clearSelection]);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(id: string, name: string) {
    if (!confirm(`Delete "${name}"?`)) return;
    const r = await fetch(`/api/${kind}/${id}`, { method: "DELETE" });
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
    if (!confirm(`Delete ${list.selected.size} item(s)?`)) return;
    const res = await fetch(`/api/${kind}/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...list.selected], action: "delete" }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      toast.success(`Deleted: ${data.ok ?? 0}`);
      if (data.errors?.length) toast.warning(`${data.errors.length} errors`);
      load();
    } else {
      toast.error(data?.error ?? "Error");
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        kicker={description}
        title={title}
        actions={
          canUpload ? (
            <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
              <DialogTrigger asChild>
                <Button>
                  <UploadCloud className="mr-1 h-4 w-4" /> Upload
                </Button>
              </DialogTrigger>
              <UploadDialog kind={kind} onUploaded={load} onClose={() => setUploadOpen(false)} />
            </Dialog>
          ) : undefined
        }
      />

      <ListToolbar
        search={list.search}
        onSearchChange={list.setSearch}
        onPasteText={list.onPasteMass}
        placeholder="Search / paste a list…"
        tokensCount={list.tokens.length}
        matchCount={list.total}
        actions={
          <div className="w-44">
            <GeoSelect
              value={filterGeo ?? undefined}
              onChange={(v) => setFilterGeo(v)}
              placeholder="Market…"
            />
          </div>
        }
      />

      {(canDelete || canEditMeta) && (
        <BulkBar
          count={list.selected.size}
          onClear={list.clearSelection}
          onSelectAllFiltered={list.selectFiltered}
        >
          {canEditMeta && (
            <Button size="sm" variant="secondary" onClick={() => setBulkEditOpen(true)}>
              <Pencil className="mr-1 h-3.5 w-3.5" /> Bulk edit
            </Button>
          )}
          {canDelete && (
            <Button size="sm" variant="destructive" onClick={bulkDelete}>
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Bulk delete
            </Button>
          )}
        </BulkBar>
      )}

      <Card className="overflow-hidden rounded-xl p-0">
        <div className="overflow-x-auto">
        <Table className="min-w-[800px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox checked={list.allPageSelected} onCheckedChange={list.togglePage} />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Market</TableHead>
              <TableHead>Group</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead className="w-[140px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.total === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-zinc-500">
                  No {title.toLowerCase()} yet
                </TableCell>
              </TableRow>
            )}
            {list.pageItems.map((a) => (
              <TableRow key={a.id} data-selected={list.selected.has(a.id) || undefined}>
                <TableCell>
                  <Checkbox
                    checked={list.selected.has(a.id)}
                    onCheckedChange={() => list.toggle(a.id)}
                  />
                </TableCell>
                <TableCell>
                  <div className="min-w-0 max-w-[220px]">
                    <Truncate className="font-medium">{a.name}</Truncate>
                    <Truncate className="mt-0.5 font-mono text-[11px] text-zinc-500" title={a.originalFilename}>
                      {a.originalFilename}
                    </Truncate>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="inline-flex items-center gap-1 py-1.5">
                    <GeoBadge flag={a.geo.flag} code={a.geo.code} size={26} />
                  </Badge>
                </TableCell>
                <TableCell>
                  {a.group ? (
                    <Badge variant="default">{a.group.name}</Badge>
                  ) : (
                    <Badge variant="success">public</Badge>
                  )}
                </TableCell>
                <TableCell className="text-xs text-zinc-300">{formatBytes(a.sizeBytes)}</TableCell>
                <TableCell className="text-xs text-zinc-400">
                  {new Date(a.uploadedAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <RowActions
                    maxVisible={3}
                    actions={[
                      {
                        key: "preview",
                        label: "Open preview",
                        icon: ExternalLink,
                        onClick: () =>
                          window.open(`/api/${kind}/${a.id}/preview/`, "_blank", "noopener,noreferrer"),
                      },
                      {
                        key: "edit-meta",
                        label: "Edit metadata",
                        icon: Pencil,
                        onClick: () => setEditing(a),
                        hidden: !canEditMeta,
                      },
                      {
                        key: "code",
                        label: canEdit ? "Edit files" : "View",
                        icon: FileCode2,
                        href: `/${kind}/${a.id}`,
                        hidden: !canViewCode,
                      },
                      {
                        key: "download",
                        label: "Download ZIP",
                        icon: Download,
                        href: `/api/${kind}/${a.id}/download`,
                        hidden: !canDownload,
                      },
                      {
                        key: "delete",
                        label: "Delete",
                        icon: Trash2,
                        onClick: () => remove(a.id, a.name),
                        tone: "danger",
                        hidden: !canDelete,
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

      <EditAssetDialog
        kind={kind}
        asset={editing}
        onClose={() => setEditing(null)}
        onSaved={load}
      />

      <BulkEditDialog
        kind={kind}
        open={bulkEditOpen}
        ids={[...list.selected]}
        onOpenChange={setBulkEditOpen}
        onSaved={load}
      />
    </div>
  );
}

function EditAssetDialog({
  kind,
  asset,
  onClose,
  onSaved,
}: {
  kind: "templates" | "packs";
  asset: AssetRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [geoId, setGeoId] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (asset) {
      setName(asset.name);
      setGeoId(asset.geo.id);
      setGroupId(asset.group?.id ?? null);
    }
  }, [asset]);

  if (!asset) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch(`/api/${kind}/${asset!.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, geoId, groupId }),
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
    <Dialog open={!!asset} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {kind === "packs" ? "content pack" : "template"}</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Market</Label>
              <GeoSelect value={geoId ?? undefined} onChange={setGeoId} />
            </div>
            <div className="space-y-1.5">
              <Label>Group</Label>
              <GroupSelect value={groupId} onChange={setGroupId} allowPublic />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !geoId}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BulkEditDialog({
  kind,
  open,
  ids,
  onOpenChange,
  onSaved,
}: {
  kind: "templates" | "packs";
  open: boolean;
  ids: string[];
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [geoId, setGeoId] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [changeGroup, setChangeGroup] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!geoId && !changeGroup) {
      toast.error("Select a market or group to change");
      return;
    }
    setLoading(true);
    const patch: Record<string, unknown> = {};
    if (geoId) patch.geoId = geoId;
    if (changeGroup) patch.groupId = groupId;
    const res = await fetch(`/api/${kind}/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, action: "patch", patch }),
    });
    setLoading(false);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      toast.success(`Updated: ${data.ok ?? 0}`);
      onOpenChange(false);
      onSaved();
    } else {
      toast.error(data?.error ?? "Error");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bulk edit ({ids.length})</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <p className="text-xs text-zinc-500">Only the selected fields are changed.</p>
          <div className="space-y-1.5">
            <Label>Market (optional)</Label>
            <GeoSelect value={geoId ?? undefined} onChange={setGeoId} placeholder="— keep unchanged —" />
          </div>
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={changeGroup} onCheckedChange={(v) => setChangeGroup(!!v)} />
              Change group
            </label>
            {changeGroup && (
              <GroupSelect value={groupId ?? undefined} onChange={setGroupId} allowPublic />
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              Apply
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UploadDialog({
  kind,
  onUploaded,
  onClose,
}: {
  kind: "templates" | "packs";
  onUploaded: () => void;
  onClose: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [geoId, setGeoId] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    multiple: false,
    accept: { "application/zip": [".zip"] },
    onDrop: (files) => {
      const f = files[0];
      if (!f) return;
      setFile(f);
      if (!name) setName(f.name.replace(/\.zip$/i, ""));
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
    if (groupId) fd.append("groupId", groupId);
    const res = await fetch(`/api/${kind}`, { method: "POST", body: fd });
    setLoading(false);
    if (res.ok) {
      toast.success("Uploaded");
      onUploaded();
      onClose();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err?.error ?? "Error");
    }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Upload {kind === "templates" ? "template" : "content pack"}</DialogTitle>
      </DialogHeader>
      <form className="space-y-4" onSubmit={submit}>
        <div
          {...getRootProps()}
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-white/10 px-6 py-8 text-sm text-zinc-400 transition hover:border-lime-500/40 ${
            isDragActive ? "border-lime-500/50 bg-lime-500/5" : ""
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
            <span>Drop a ZIP archive or click to browse</span>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Market *</Label>
            <GeoSelect value={geoId ?? undefined} onChange={(v) => setGeoId(v)} />
          </div>
          <div className="space-y-1.5">
            <Label>Group</Label>
            <GroupSelect value={groupId ?? undefined} onChange={setGroupId} allowPublic />
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button type="submit" disabled={loading || !file || !geoId}>
            {loading ? "Uploading…" : "Upload"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
