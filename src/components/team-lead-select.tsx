"use client";

import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface GroupRow {
  id: string;
  name: string;
  teamLeadId: string | null;
  teamLead?: { id: string; email: string; name: string | null } | null;
}

interface Props {
  value?: string | null;
  onChange: (teamLeadId: string | null, groupId: string | null) => void;
  placeholder?: string;
}

/** Вибір team lead → автоматично підставляє groupId групи цього TL. */
export function TeamLeadSelect({ value, onChange, placeholder = "Select a team lead…" }: Props) {
  const [groups, setGroups] = useState<GroupRow[]>([]);

  useEffect(() => {
    fetch("/api/admin/groups")
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setGroups(data))
      .catch(() => {});
  }, []);

  const withLead = groups.filter((g) => g.teamLeadId && g.teamLead);

  return (
    <Select
      value={value ?? "__none__"}
      onValueChange={(v) => {
        if (v === "__none__") {
          onChange(null, null);
          return;
        }
        const g = withLead.find((x) => x.teamLeadId === v);
        onChange(v, g?.id ?? null);
      }}
    >
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">
          <span className="text-zinc-400">— no team lead —</span>
        </SelectItem>
        {withLead.map((g) => (
          <SelectItem key={g.teamLeadId!} value={g.teamLeadId!}>
            {g.teamLead!.name ?? g.teamLead!.email}
            <span className="ml-2 text-xs text-zinc-500">· {g.name}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
