"use client";

import { useState } from "react";
import { flagCdnUrl, normalizeGeoCode } from "@/lib/geo-flag";

interface Props {
  flag?: string | null;
  code?: string | null;
  className?: string;
  /** Ширина прапора в px (висота = 2/3 ширини, пропорція 3:2). */
  size?: number;
  title?: string;
}

function flagHeight(size: number): number {
  return Math.max(12, Math.round(size * (2 / 3)));
}

function flagImageSrc(code: string, size: number): string {
  const px = size >= 32 ? 80 : 40;
  return `/api/flags/${code}?s=${px}`;
}

/** Прапор країни: /api/flags (проксі) → flagcdn → нейтральний placeholder. */
export function GeoFlag({
  flag: _flag,
  code,
  className = "",
  size = 28,
  title,
}: Props) {
  const iso = normalizeGeoCode(code);
  const [stage, setStage] = useState<"proxy" | "cdn" | "placeholder">("proxy");
  const height = flagHeight(size);

  if (!iso) {
    return (
      <span
        className={`inline-block shrink-0 rounded-[2px] bg-zinc-700/60 ${className}`}
        style={{ width: size, height }}
        role="img"
        aria-label="flag"
      />
    );
  }

  if (stage === "placeholder") {
    return (
      <span
        className={`inline-block shrink-0 rounded-[2px] bg-zinc-700/80 ${className}`}
        style={{ width: size, height }}
        title={title ?? iso}
        role="img"
        aria-label={iso}
      />
    );
  }

  const src =
    stage === "proxy"
      ? flagImageSrc(iso, size)
      : flagCdnUrl(iso, size >= 32 ? 80 : 40);

  if (!src) {
    return (
      <span
        className={`inline-block shrink-0 rounded-[2px] bg-zinc-700/80 ${className}`}
        style={{ width: size, height }}
        title={title ?? iso}
        role="img"
        aria-label={iso}
      />
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden ${className}`}
      style={{ width: size, height: height, minWidth: size, minHeight: height }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        title={title ?? iso}
        aria-label={iso}
        className="block h-full w-full rounded-[2px] object-contain object-center"
        width={size}
        height={height}
        loading="lazy"
        decoding="async"
        onError={() => setStage((s) => (s === "proxy" ? "cdn" : "placeholder"))}
      />
    </span>
  );
}
