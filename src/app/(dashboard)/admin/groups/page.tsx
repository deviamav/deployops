"use client";

import { useCallback, useEffect, useState } from "react";
import { useClientList } from "@/hooks/use-client-list";
import { ListFooter, ListToolbar } from "@/components/list-toolbar";
import { PageHeader } from "@/components/page-header";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { RowActions, Truncate } from "@/components/row-actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  name: string;
  teamLead: { id: string; email: string } | null;
  _count: { users: number; landings: number; offers: number };
}

export default function GroupsPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");

  const getHaystack = useCallback(
    (g: Row) => [g.name, g.teamLead?.email, String(g._count.users)],
    [],
  );
  const list = useClientList(items, getHaystack, (i) => i.id, 25);

  async function load() {
    const data = await fetch("/api/admin/groups").then((r) => r.json());
    if (Array.isArray(data)) setItems(data);
  }
  useEffect(() => {
    load();
  }, []);

  async function add() {
    if (!name.trim()) return;
    const res = await fetch("/api/admin/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      toast.success("Created");
      setAddOpen(false);
      setName("");
      load();
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete group?")) return;
    await fetch(`/api/admin/groups/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Teams"
        title="Groups"
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Add group
          </Button>
        }
      />

      <ListToolbar
        search={list.search}
        onSearchChange={list.setSearch}
        onPasteText={list.onPasteMass}
        placeholder="Name, team lead…"
        tokensCount={list.tokens.length}
        matchCount={list.total}
      />

      <Card className="ui-table-wrap overflow-hidden rounded-3xl p-0">
        <div className="overflow-x-auto">
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox checked={list.allPageSelected} onCheckedChange={list.togglePage} />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Team lead</TableHead>
              <TableHead>Users</TableHead>
              <TableHead>Templates</TableHead>
              <TableHead>Content packs</TableHead>
              <TableHead className="w-[140px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.pageItems.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-zinc-500">
                  No groups found
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
                <TableCell className="font-medium">
                  <Truncate className="max-w-[180px]">{g.name}</Truncate>
                </TableCell>
                <TableCell className="text-xs">
                  <Truncate className="max-w-[200px]" title={g.teamLead?.email}>
                    {g.teamLead?.email ?? "—"}
                  </Truncate>
                </TableCell>
                <TableCell>{g._count.users}</TableCell>
                <TableCell>{g._count.landings}</TableCell>
                <TableCell>{g._count.offers}</TableCell>
                <TableCell>
                  <RowActions
                    maxVisible={3}
                    actions={[
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
            <DialogTitle>New group</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Team-Alpha" />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={add}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
