"use client";

import { roleLabel } from "@/lib/utils";

import { useCallback, useEffect, useState } from "react";
import { useClientList } from "@/hooks/use-client-list";
import { ListFooter, ListToolbar } from "@/components/list-toolbar";
import { PageHeader } from "@/components/page-header";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Copy, KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import { RowActions, Truncate } from "@/components/row-actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { GroupSelect } from "@/components/group-select";
import { TeamLeadSelect } from "@/components/team-lead-select";
import { randomPassword } from "@/lib/utils";

interface Row {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "team_lead" | "operator";
  group: { id: string; name: string } | null;
  createdAt: string;
  canEditAssets: boolean;
  canDeleteAssets: boolean;
  canDownloadAssets: boolean;
  canViewAssetCode: boolean;
}

export default function UsersPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [editing, setEditing] = useState<Row | null>(null);
  const [adding, setAdding] = useState(false);

  const getHaystack = useCallback(
    (u: Row) => [u.email, u.name, u.role, u.group?.name],
    [],
  );
  const list = useClientList(items, getHaystack, (i) => i.id, 25);

  async function load() {
    const data = await fetch("/api/admin/users").then((r) => r.json());
    if (Array.isArray(data)) setItems(data);
  }
  useEffect(() => {
    load();
  }, []);

  async function reset(id: string, email: string) {
    if (!confirm(`Generate a new password for ${email}?`)) return;
    const data = await fetch(`/api/admin/users/${id}/reset-password`, { method: "POST" }).then((r) =>
      r.json(),
    );
    if (data.password) {
      await copyToClipboard(data.password);
      toast.success(`New password (copied): ${data.password}`, { duration: 20_000 });
    } else {
      toast.error(data?.error ?? "Reset failed");
    }
  }

  async function remove(id: string, email: string) {
    if (!confirm(`Delete user ${email}?`)) return;
    const r = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
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
        kicker="Console users"
        title="Users"
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus className="mr-1 h-4 w-4" /> Add user
          </Button>
        }
      />

      <ListToolbar
        search={list.search}
        onSearchChange={list.setSearch}
        onPasteText={list.onPasteMass}
        placeholder="Email, name, role, group…"
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
              <TableHead>Email</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Group</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-[140px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.pageItems.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-zinc-500">
                  No users found
                </TableCell>
              </TableRow>
            )}
            {list.pageItems.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <Checkbox
                    checked={list.selected.has(u.id)}
                    onCheckedChange={() => list.toggle(u.id)}
                  />
                </TableCell>
                <TableCell className="font-medium">
                  <Truncate className="max-w-[200px]" title={u.email}>
                    {u.email}
                  </Truncate>
                </TableCell>
                <TableCell>
                  <Truncate className="max-w-[140px]">{u.name ?? "—"}</Truncate>
                </TableCell>
                <TableCell>
                  <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                    {roleLabel(u.role)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Truncate className="max-w-[140px]">{u.group?.name ?? "—"}</Truncate>
                </TableCell>
                <TableCell className="text-xs text-zinc-400">
                  {new Date(u.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <RowActions
                    maxVisible={3}
                    actions={[
                      {
                        key: "edit",
                        label: "Edit",
                        icon: Pencil,
                        onClick: () => setEditing(u),
                      },
                      {
                        key: "reset",
                        label: "Reset password",
                        icon: KeyRound,
                        onClick: () => reset(u.id, u.email),
                        tone: "warn",
                      },
                      {
                        key: "delete",
                        label: "Delete",
                        icon: Trash2,
                        onClick: () => remove(u.id, u.email),
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

      <AddUserDialog open={adding} onOpenChange={setAdding} onCreated={load} />
      <EditUserDialog
        user={editing}
        onOpenChange={(o) => !o && setEditing(null)}
        onSaved={load}
      />
    </div>
  );
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // ignore
  }
}

function AddUserDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    email: "",
    name: "",
    password: randomPassword(14),
    role: "operator" as "admin" | "team_lead" | "operator",
    groupId: null as string | null,
    teamLeadId: null as string | null,
    canEditAssets: false,
    canDeleteAssets: false,
    canDownloadAssets: false,
    canViewAssetCode: false,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        email: "",
        name: "",
        password: randomPassword(14),
        role: "operator",
        groupId: null,
        teamLeadId: null,
        canEditAssets: false,
        canDeleteAssets: false,
        canDownloadAssets: false,
        canViewAssetCode: false,
      });
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        email: form.email.trim().toLowerCase(),
      }),
    });
    setLoading(false);
    if (res.ok) {
      await copyToClipboard(form.password);
      toast.success(`Created. Password copied: ${form.password}`, { duration: 20_000 });
      onOpenChange(false);
      onCreated();
    } else {
      const e = await res.json().catch(() => ({}));
      toast.error(e?.error ?? "Error");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add user</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Password</Label>
              <div className="flex gap-2">
                <Input
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                  minLength={8}
                  className="font-mono"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  title="Copy"
                  onClick={() => {
                    copyToClipboard(form.password);
                    toast.success("Copied");
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  title="Generate new"
                  onClick={() => setForm({ ...form, password: randomPassword(14) })}
                >
                  <KeyRound className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-zinc-500">min. 8 characters</p>
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select
                value={form.role}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    role: v as any,
                    teamLeadId: v === "operator" ? form.teamLeadId : null,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">admin</SelectItem>
                  <SelectItem value="team_lead">team_lead</SelectItem>
                  <SelectItem value="operator">operator</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.role === "operator" ? (
              <div className="space-y-1.5">
                <Label>Team lead</Label>
                <TeamLeadSelect
                  value={form.teamLeadId}
                  onChange={(tlId, groupId) =>
                    setForm({ ...form, teamLeadId: tlId, groupId: groupId ?? form.groupId })
                  }
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Group</Label>
                <GroupSelect
                  value={form.groupId}
                  onChange={(v) => setForm({ ...form, groupId: v })}
                />
              </div>
            )}
            {form.role === "operator" && (
              <div className="col-span-2 space-y-1.5">
                <Label>Group (auto from team lead, or choose manually)</Label>
                <GroupSelect
                  value={form.groupId}
                  onChange={(v) => setForm({ ...form, groupId: v })}
                />
              </div>
            )}
          </div>
          {form.role !== "admin" && (
            <PermissionsBlock
              value={{
                canEditAssets: form.canEditAssets,
                canDeleteAssets: form.canDeleteAssets,
                canDownloadAssets: form.canDownloadAssets,
                canViewAssetCode: form.canViewAssetCode,
              }}
              onChange={(p) => setForm({ ...form, ...p })}
            />
          )}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PermissionsBlock({
  value,
  onChange,
}: {
  value: {
    canEditAssets: boolean;
    canDeleteAssets: boolean;
    canDownloadAssets: boolean;
    canViewAssetCode: boolean;
  };
  onChange: (next: Partial<typeof value>) => void;
}) {
  const items: {
    key: keyof typeof value;
    label: string;
    desc: string;
  }[] = [
    {
      key: "canViewAssetCode",
      label: "View asset code",
      desc: "Files tab / editor in read-only mode",
    },
    {
      key: "canEditAssets",
      label: "Edit asset code",
      desc: "Write files inside the ZIP (also enables viewing)",
    },
    {
      key: "canDeleteAssets",
      label: "Delete assets",
      desc: "Trash button on templates / content packs",
    },
    {
      key: "canDownloadAssets",
      label: "Download ZIP",
      desc: "Download ZIP button",
    },
  ];
  return (
    <div className="space-y-2 rounded-2xl border border-white/10 bg-zinc-900/40 p-3">
      <div className="text-xs uppercase tracking-wider text-zinc-500">
        Template / content pack permissions
      </div>
      <p className="text-xs text-zinc-500">
        Always enabled for admins. Team leads and operators can by default only run deploys and see
        previews.
      </p>
      <div className="grid gap-2 pt-1 md:grid-cols-2">
        {items.map((it) => (
          <label
            key={it.key}
            className="flex cursor-pointer items-start gap-2 rounded-xl border border-white/5 bg-zinc-950/40 p-2 hover:bg-white/5"
          >
            <input
              type="checkbox"
              checked={value[it.key]}
              onChange={(e) => onChange({ [it.key]: e.target.checked } as any)}
              className="mt-1 accent-lime-500"
            />
            <div>
              <div className="text-sm font-medium">{it.label}</div>
              <div className="text-xs text-zinc-500">{it.desc}</div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

function EditUserDialog({
  user,
  onOpenChange,
  onSaved,
}: {
  user: Row | null;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    email: "",
    name: "",
    role: "operator" as "admin" | "team_lead" | "operator",
    groupId: null as string | null,
    teamLeadId: null as string | null,
    password: "",
    canEditAssets: false,
    canDeleteAssets: false,
    canDownloadAssets: false,
    canViewAssetCode: false,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setForm({
        email: user.email,
        name: user.name ?? "",
        role: user.role,
        groupId: user.group?.id ?? null,
        teamLeadId: null,
        password: "",
        canEditAssets: user.canEditAssets ?? false,
        canDeleteAssets: user.canDeleteAssets ?? false,
        canDownloadAssets: user.canDownloadAssets ?? false,
        canViewAssetCode: user.canViewAssetCode ?? false,
      });
      if (user.role === "operator" && user.group?.id) {
        fetch("/api/admin/groups")
          .then((r) => r.json())
          .then((groups) => {
            if (!Array.isArray(groups)) return;
            const g = groups.find((x: any) => x.id === user.group?.id);
            if (g?.teamLeadId) setForm((f) => ({ ...f, teamLeadId: g.teamLeadId }));
          })
          .catch(() => {});
      }
    }
  }, [user]);

  if (!user) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    const payload: any = {
      email: form.email.trim().toLowerCase(),
      name: form.name.trim() || null,
      role: form.role,
      groupId: form.groupId,
      canEditAssets: form.canEditAssets,
      canDeleteAssets: form.canDeleteAssets,
      canDownloadAssets: form.canDownloadAssets,
      canViewAssetCode: form.canViewAssetCode,
    };
    if (form.password.trim().length > 0) {
      payload.password = form.password.trim();
    }
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setLoading(false);
    if (res.ok) {
      if (payload.password) {
        await copyToClipboard(payload.password);
        toast.success(`Saved. New password copied: ${payload.password}`, {
          duration: 20_000,
        });
      } else {
        toast.success("Saved");
      }
      onOpenChange(false);
      onSaved();
    } else {
      const e = await res.json().catch(() => ({}));
      toast.error(e?.error ?? "Error");
    }
  }

  return (
    <Dialog open={!!user} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit: {user.email}</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select
                value={form.role}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    role: v as any,
                    teamLeadId: v === "operator" ? form.teamLeadId : null,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">admin</SelectItem>
                  <SelectItem value="team_lead">team_lead</SelectItem>
                  <SelectItem value="operator">operator</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.role === "operator" ? (
              <div className="space-y-1.5">
                <Label>Team lead</Label>
                <TeamLeadSelect
                  value={form.teamLeadId}
                  onChange={(tlId, groupId) =>
                    setForm({ ...form, teamLeadId: tlId, groupId: groupId ?? form.groupId })
                  }
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Group</Label>
                <GroupSelect
                  value={form.groupId}
                  onChange={(v) => setForm({ ...form, groupId: v })}
                />
              </div>
            )}
            {form.role === "operator" && (
              <div className="col-span-2 space-y-1.5">
                <Label>Group</Label>
                <GroupSelect
                  value={form.groupId}
                  onChange={(v) => setForm({ ...form, groupId: v })}
                />
              </div>
            )}
            {form.role !== "admin" && (
              <div className="col-span-2">
                <PermissionsBlock
                  value={{
                    canEditAssets: form.canEditAssets,
                    canDeleteAssets: form.canDeleteAssets,
                    canDownloadAssets: form.canDownloadAssets,
                    canViewAssetCode: form.canViewAssetCode,
                  }}
                  onChange={(p) => setForm({ ...form, ...p })}
                />
              </div>
            )}
            <div className="col-span-2 space-y-1.5">
              <Label>New password</Label>
              <div className="flex gap-2">
                <Input
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="leave empty to keep unchanged"
                  minLength={form.password.length > 0 ? 8 : undefined}
                  className="font-mono"
                  autoComplete="new-password"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  title="Generate"
                  onClick={() => setForm({ ...form, password: randomPassword(14) })}
                >
                  <KeyRound className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
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
