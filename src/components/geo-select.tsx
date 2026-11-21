"use client";

import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GeoFlag } from "@/components/geo-flag";

export interface Geo {
  id: string;
  code: string;
  name: string;
  flag: string | null;
  active: boolean;
}

interface Props {
  value?: string | null;
  onChange: (id: string) => void;
  placeholder?: string;
  filterGeoId?: string | null;
}

export function GeoSelect({ value, onChange, placeholder = "Select a market…", filterGeoId }: Props) {
  const [geos, setGeos] = useState<Geo[]>([]);

  useEffect(() => {
    fetch("/api/admin/geos")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          let list = data.filter((g: Geo) => g.active);
          if (filterGeoId) list = list.filter((g) => g.id === filterGeoId);
          setGeos(list);
        }
      })
      .catch(() => {});
  }, [filterGeoId]);

  const selected = geos.find((g) => g.id === value);

  return (
    <Select value={value ?? undefined} onValueChange={onChange}>
      <SelectTrigger>
        {selected ? (
          <span className="flex items-center gap-2 truncate">
            <GeoFlag flag={selected.flag} code={selected.code} size={26} />
            <span className="font-mono">{selected.code}</span>
            <span className="text-zinc-400">— {selected.name}</span>
          </span>
        ) : (
          <SelectValue placeholder={placeholder} />
        )}
      </SelectTrigger>
      <SelectContent>
        {geos.map((g) => (
          <SelectItem key={g.id} value={g.id}>
            <span className="mr-2 inline-flex">
              <GeoFlag flag={g.flag} code={g.code} size={26} />
            </span>
            <span className="font-mono">{g.code}</span>{" "}
            <span className="text-zinc-400">— {g.name}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function GeoBadge({
  flag,
  code,
  name,
  size = 26,
}: {
  flag: string | null;
  code: string;
  name?: string;
  size?: number;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <GeoFlag flag={flag} code={code} size={size} />
      <span className="font-mono text-xs leading-none">{code}</span>
      {name && <span className="text-zinc-400">{name}</span>}
    </span>
  );
}

/** @deprecated використовуй GeoFlag component */
export { geoFlag } from "@/lib/geo-flag";
