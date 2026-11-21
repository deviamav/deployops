import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/*
  Status colors (success / warning / destructive) are reserved for state.
  Everything else is neutral or the single lime accent.
*/
const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-4 transition-colors",
  {
    variants: {
      variant: {
        default: "border-white/[0.08] bg-white/[0.04] text-zinc-300",
        secondary: "border-white/[0.06] bg-transparent text-zinc-400",
        success: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
        warning: "border-amber-500/25 bg-amber-500/10 text-amber-300",
        destructive: "border-red-500/25 bg-red-500/10 text-red-300",
        outline: "border-white/[0.12] text-zinc-300",
        cyan: "border-lime-400/25 bg-lime-400/[0.07] text-lime-300",
        pink: "border-white/[0.08] bg-white/[0.04] text-zinc-300",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
