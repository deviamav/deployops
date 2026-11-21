"use client";

import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  value?: string | null;
  onChange: (id: string | null) => void;
  /** Якщо true — додає опцію «public» (`null`). */
  allowPublic?: boolean;
}

interface GroupRow {
  id: string;
  name: string;
}

export function GroupSelect({ value, onChange, allowPublic = true }: Props) {
  const [groups, setGroups] = useState<GroupRow[]>([]);

  useEffect(() => {
    fetch("/api/admin/groups")
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setGroups(data))
      .catch(() => {});
  }, []);

  return (
    <Select
      value={value === null || value === undefined ? (allowPublic ? "__public__" : undefined) : value}
      onValueChange={(v) => onChange(v === "__public__" ? null : v)}
    >
      <SelectTrigger>
        <SelectValue placeholder="Select a group…" />
      </SelectTrigger>
      <SelectContent>
        {allowPublic && (
          <SelectItem value="__public__">
            <span className="text-emerald-300">— public —</span>
          </SelectItem>
        )}
        {groups.map((g) => (
          <SelectItem key={g.id} value={g.id}>
            {g.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
