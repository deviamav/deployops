import Link from "next/link";
import { startOfDay, subDays, format } from "date-fns";
import { Globe, Wand2 } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { visibilityWhere, type SessionUser } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { DashboardChart } from "@/components/dashboard-chart";

export default async function DashboardPage() {
  const session = await auth();
  const user = session!.user as unknown as SessionUser;

  const domainsWhere = visibilityWhere(user, "domain");
  const landingsWhere = visibilityWhere(user, "landing");
  const offersWhere = visibilityWhere(user, "offer");
  const jobsWhere = visibilityWhere(user, "job");
  const serversWhere = visibilityWhere(user, "server");
  const startOfToday = startOfDay(new Date());

  const [
    serversCount,
    domainsCount,
    landingsCount,
    offersCount,
    todayJobs,
    recentJobs,
    deployedDomains,
  ] = await Promise.all([
    prisma.server.count({ where: serversWhere }),
    prisma.domain.count({ where: domainsWhere }),
    prisma.landing.count({ where: landingsWhere }),
    prisma.offer.count({ where: offersWhere }),
    prisma.deployJob.count({
      where: { ...jobsWhere, status: "success", startedAt: { gte: startOfToday } },
    }),
    prisma.deployJob.findMany({
      where: { ...jobsWhere, startedAt: { gte: subDays(new Date(), 14) } },
      select: { startedAt: true, status: true },
    }),
    prisma.domain.count({ where: { ...domainsWhere, status: "deployed" } }),
  ]);

  const series = buildSeries(recentJobs);
  const weekTotal = series.slice(-7).reduce((n, d) => n + d.count, 0);
  const deployCoverage =
    domainsCount === 0 ? 0 : Math.min(100, Math.round((deployedDomains / domainsCount) * 100));
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const displayName = user.name ?? user.email.split("@")[0];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/[0.06] pb-5">
        <div className="min-w-0">
          <p className="page-kicker">{greet}</p>
          <h1 className="page-title mt-1 truncate">{displayName}</h1>
          <p className="mt-1 text-[13px] text-zinc-500">
            Operations overview — deployments, inventory and recent activity.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="secondary">
            <Link href="/domains">
              <Globe className="h-3.5 w-3.5" /> Domains
            </Link>
          </Button>
          <Button asChild>
            <Link href="/deploy">
              <Wand2 className="h-3.5 w-3.5" /> New Deploy
            </Link>
          </Button>
        </div>
      </header>

      {/* Metric strip: one bordered surface, hairline dividers */}
      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-white/[0.08] bg-white/[0.06] md:grid-cols-4">
        <Metric label="Deployment coverage" hint={`${deployedDomains} of ${domainsCount} domains`}>
          <span className="font-display text-[2rem] font-semibold leading-none tracking-[-0.03em] tabular-nums">
            {deployCoverage}
            <span className="ml-0.5 text-base font-medium text-zinc-500">%</span>
          </span>
          <div className="meter mt-3">
            <span style={{ width: `${deployCoverage}%` }} />
          </div>
        </Metric>
        <Metric label="Deploys today" hint="Successful jobs">
          <Figure value={todayJobs} />
        </Metric>
        <Metric label="Deploys · 7 days" hint="Successful jobs">
          <Figure value={weekTotal} />
        </Metric>
        <Metric label="Inventory" hint="Servers · packs · templates">
          <div className="flex items-baseline gap-4 tabular-nums">
            <Inline label="SRV" value={serversCount} />
            <Inline label="PCK" value={offersCount} />
            <Inline label="TPL" value={landingsCount} />
          </div>
        </Metric>
      </section>

      <section className="surface">
        <div className="flex items-end justify-between border-b border-white/[0.06] px-5 py-3.5">
          <div>
            <h2 className="text-[13px] font-semibold tracking-normal">Deploy activity</h2>
            <p className="text-xs text-zinc-500">Last 14 days · successful jobs</p>
          </div>
        </div>
        <div className="h-56 px-3 pb-3 pt-4 md:h-64">
          <DashboardChart data={series} />
        </div>
      </section>
    </div>
  );
}

function Metric({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[#0c0c0e] p-5">
      <p className="page-kicker mb-3">{label}</p>
      {children}
      {hint && <p className="mt-2 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

function Figure({ value }: { value: number }) {
  return (
    <span className="font-display text-[2rem] font-semibold leading-none tracking-[-0.03em] tabular-nums">
      {value}
    </span>
  );
}

function Inline({ label, value }: { label: string; value: number }) {
  return (
    <span className="flex flex-col gap-1">
      <span className="font-display text-xl font-semibold leading-none tracking-tight">{value}</span>
      <span className="font-mono text-[10px] text-zinc-500">{label}</span>
    </span>
  );
}

function buildSeries(jobs: { startedAt: Date; status: string }[]) {
  const map = new Map<string, number>();
  for (let i = 13; i >= 0; i--) map.set(format(subDays(new Date(), i), "MMM d"), 0);
  for (const j of jobs) {
    if (j.status !== "success") continue;
    const day = format(j.startedAt, "MMM d");
    if (map.has(day)) map.set(day, (map.get(day) ?? 0) + 1);
  }
  return Array.from(map.entries()).map(([day, count]) => ({ day, count }));
}
