"use client";

import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type RowAction = {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
  onClick?: () => void;
  tone?: "default" | "danger" | "warn" | "accent";
  hidden?: boolean;
};

const toneClass: Record<NonNullable<RowAction["tone"]>, string> = {
  default: "text-zinc-400 hover:text-zinc-100",
  danger: "text-zinc-400 hover:text-rose-300",
  warn: "text-zinc-400 hover:text-amber-300",
  accent: "text-zinc-400 hover:text-lime-300",
};

/**
 * Горизонтальні muted-дії + overflow меню.
 * Без різнокольорового «колхозу».
 */
export function RowActions({
  actions,
  maxVisible = 3,
  className,
}: {
  actions: RowAction[];
  maxVisible?: number;
  className?: string;
}) {
  const visible = actions.filter((a) => !a.hidden);
  const main = visible.slice(0, maxVisible);
  const rest = visible.slice(maxVisible);

  return (
    <div className={cn("flex items-center justify-end gap-0.5", className)}>
      {main.map((a) => {
        const Icon = a.icon;
        const cls = cn(
          "h-8 w-8 rounded-lg transition-colors duration-200",
          toneClass[a.tone ?? "default"],
        );
        if (a.href) {
          return (
            <Button key={a.key} asChild size="icon" variant="ghost" className={cls} title={a.label}>
              <Link href={a.href}>
                <Icon className="h-4 w-4" />
              </Link>
            </Button>
          );
        }
        return (
          <Button
            key={a.key}
            size="icon"
            variant="ghost"
            className={cls}
            title={a.label}
            onClick={a.onClick}
          >
            <Icon className="h-4 w-4" />
          </Button>
        );
      })}
      {rest.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-lg text-zinc-400 hover:text-zinc-100"
              title="More"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[160px]">
            {rest.map((a) => {
              const Icon = a.icon;
              if (a.href) {
                return (
                  <DropdownMenuItem key={a.key} asChild>
                    <Link href={a.href} className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      {a.label}
                    </Link>
                  </DropdownMenuItem>
                );
              }
              return (
                <DropdownMenuItem key={a.key} onClick={a.onClick} className="gap-2">
                  <Icon className="h-4 w-4" />
                  {a.label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

export function Truncate({
  children,
  className,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  const tip = title ?? (typeof children === "string" ? children : undefined);
  return (
    <span className={cn("block max-w-full truncate", className)} title={tip}>
      {children}
    </span>
  );
}
