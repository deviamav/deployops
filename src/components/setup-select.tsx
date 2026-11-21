"use client";

import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Row {
  id: string;
  key: string;
  name: string;
  webRootTemplate: string;
}

interface Props {
  value?: string | null;
  onChange: (id: string | null, setup?: Row | null) => void;
  allowNone?: boolean;
}

export function SetupSelect({ value, onChange, allowNone = true }: Props) {
  const [setups, setSetups] = useState<Row[]>([]);

  useEffect(() => {
    fetch("/api/admin/setups")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setSetups(data);
      })
      .catch(() => {});
  }, []);

  return (
    <Select
      value={
        value === null || value === undefined
          ? allowNone
            ? "__none__"
            : undefined
          : value
      }
      onValueChange={(v) => {
        if (v === "__none__") {
          onChange(null, null);
        } else {
          const found = setups.find((s) => s.id === v) ?? null;
          onChange(v, found);
        }
      }}
    >
      <SelectTrigger>
        <SelectValue placeholder="Select a server preset…" />
      </SelectTrigger>
      <SelectContent>
        {allowNone && (
          <SelectItem value="__none__">
            <span className="text-zinc-400">— default (/var/www/{"{domain}"}) —</span>
          </SelectItem>
        )}
        {setups.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            <div className="flex flex-col">
              <span>{s.name}</span>
              <span className="text-xs text-zinc-500 font-mono">{s.webRootTemplate}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
