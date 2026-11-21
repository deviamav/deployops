import { cn } from "@/lib/utils";

export function PageHeader({
  kicker,
  title,
  actions,
  className,
}: {
  kicker?: string;
  title: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end justify-between gap-4 border-b border-white/[0.06] pb-4",
        className,
      )}
    >
      <div className="min-w-0">
        {kicker && <p className="page-kicker">{kicker}</p>}
        <h1 className="page-title mt-1">{title}</h1>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
