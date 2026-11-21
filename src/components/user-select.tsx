"use client";

import { roleLabel } from "@/lib/utils";

import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "team_lead" | "operator";
  group: { id: string; name: string } | null;
}

interface Props {
  value?: string | null;
  onChange: (id: string | null) => void;
  /** Якщо true — додає опцію «— я (поточний) —» (null). */
  allowSelf?: boolean;
  placeholder?: string;
}

export function UserSelect({ value, onChange, allowSelf = true, placeholder }: Props) {
  const [items, setItems] = useState<UserRow[]>([]);

  useEffect(() => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && setItems(d))
      .catch(() => {});
  }, []);

  return (
    <Select
      value={
        value === null || value === undefined
          ? allowSelf
            ? "__self__"
            : undefined
          : value
      }
      onValueChange={(v) => onChange(v === "__self__" ? null : v)}
    >
      <SelectTrigger>
        <SelectValue placeholder={placeholder ?? "Select a user…"} />
      </SelectTrigger>
      <SelectContent>
        {allowSelf && (
          <SelectItem value="__self__">
            <span className="text-emerald-300">— me (current admin) —</span>
          </SelectItem>
        )}
        {items.map((u) => (
          <SelectItem key={u.id} value={u.id}>
            <div className="flex flex-col">
              <span>
                {u.name ?? u.email}{" "}
                <span className="text-xs text-zinc-500">[{roleLabel(u.role)}]</span>
              </span>
              {u.email !== u.name && (
                <span className="text-xs text-zinc-500">{u.email}</span>
              )}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
