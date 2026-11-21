import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        "flex h-9 w-full rounded-lg border border-white/[0.08] bg-[#0c0c0e] px-3 py-1.5 text-[13px] text-zinc-100 transition-colors placeholder:text-zinc-600 hover:border-white/[0.14] focus-visible:border-lime-400/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400/20 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
