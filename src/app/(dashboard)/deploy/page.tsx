"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  Play,
  Rocket,
  Undo2,
  XCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { LogViewer } from "@/components/log-viewer";
import { RollbackDialog } from "@/components/rollback-dialog";
import { DomainMultiSelect } from "@/components/domain-multi-select";
import { GeoFlag } from "@/components/geo-flag";
interface Domain {
  id: string;
  name: string;
  /** DB enum DeployMode: pack_only = content pack only, template_and_pack = template + content pack */
  deployMode: "pack_only" | "template_and_pack";
  status: string;
  server: { host: string };
}
interface Market {
  id: string;
  code: string;
  name: string;
  flag: string | null;
}
interface Asset {
  id: string;
  name: string;
  geo: { id: string; code: string; flag: string | null };
}
interface EntryScript {
  id: string;
  name: string;
  isDefault: boolean;
  geoId: string;
  /** DB enum EntryEngine — shown in the UI as a file layout. */
  engine?: "php_gateway" | "php_redirect" | "html_gateway";
}

type DeployType = "pack_only" | "template_and_pack";
type AnalyticsPreset = "google" | "facebook" | "tiktok";
type JobStatus = "idle" | "running" | "success" | "failed";
/** standard = template + content pack + entry script · gateway = market + entry script only */
type DeployMode = "standard" | "gateway";

const LAYOUT_LABEL: Record<string, string> = {
  php_gateway: "Standard layout",
  html_gateway: "Split layout",
  php_redirect: "Gateway only",
};

export default function DeployPage() {
  return (
    <Suspense fallback={null}>
      <DeployWizard />
    </Suspense>
  );
}

function DeployWizard() {
  const params = useSearchParams();
  const [domains, setDomains] = useState<Domain[]>([]);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [allTemplates, setAllTemplates] = useState<Asset[]>([]);
  const [allPacks, setAllPacks] = useState<Asset[]>([]);
  const [allScripts, setAllScripts] = useState<EntryScript[]>([]);

  const [domainIds, setDomainIds] = useState<string[]>(
    params.get("domainId") ? [params.get("domainId")!] : [],
  );
  const [mode, setMode] = useState<DeployMode>("standard");
  const [type, setType] = useState<DeployType>("pack_only");
  const [analytics, setAnalytics] = useState<AnalyticsPreset>("google");
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [packId, setPackId] = useState<string | null>(null);
  const [marketId, setMarketId] = useState<string | null>(null);
  const [scriptId, setScriptId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [rollbackOpen, setRollbackOpen] = useState(false);

  const [logLines, setLogLines] = useState<string[]>([]);
  const [jobStatus, setJobStatus] = useState<JobStatus>("idle");
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(
    null,
  );

  const isGateway = mode === "gateway";
  const selectedDomains = domains.filter((d) => domainIds.includes(d.id));
  const selectedDomain = selectedDomains.length === 1 ? selectedDomains[0] : null;
  const selectedMarket = markets.find((m) => m.id === marketId) ?? null;

  const templates = useMemo(
    () => (marketId ? allTemplates.filter((t) => t.geo.id === marketId) : []),
    [allTemplates, marketId],
  );
  const packs = useMemo(
    () => (marketId ? allPacks.filter((p) => p.geo.id === marketId) : []),
    [allPacks, marketId],
  );
  const scripts = useMemo(() => {
    if (!marketId) return [];
    const forMarket = allScripts.filter((s) => s.geoId === marketId);
    if (isGateway) return forMarket.filter((s) => s.engine === "php_redirect");
    return forMarket.filter((s) => s.engine !== "php_redirect");
  }, [allScripts, marketId, isGateway]);

  async function reload() {
    const d = await fetch("/api/domains").then((r) => r.json());
    if (Array.isArray(d)) setDomains(d);
  }

  useEffect(() => {
    reload();
    fetch("/api/admin/geos").then((r) => r.json()).then((g) => Array.isArray(g) && setMarkets(g));
    fetch("/api/templates").then((r) => r.json()).then((d) => Array.isArray(d) && setAllTemplates(d));
    fetch("/api/packs").then((r) => r.json()).then((d) => Array.isArray(d) && setAllPacks(d));
    fetch("/api/admin/scripts")
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && setAllScripts(d));
  }, []);

  useEffect(() => {
    if (selectedDomain && !isGateway) setType(selectedDomain.deployMode);
  }, [selectedDomain, isGateway]);

  // Changing the market invalidates market-bound selections.
  useEffect(() => {
    if (packId && !packs.find((p) => p.id === packId)) setPackId(null);
    if (templateId && !templates.find((t) => t.id === templateId)) setTemplateId(null);
  }, [packs, templates, packId, templateId]);

  useEffect(() => {
    if (!marketId) {
      setScriptId(null);
      return;
    }
    if (scriptId && scripts.find((s) => s.id === scriptId)) return;
    const def = scripts.find((s) => s.isDefault) ?? scripts[0];
    setScriptId(def?.id ?? null);
  }, [marketId, scripts, scriptId]);

  useEffect(() => {
    if (isGateway) {
      setPackId(null);
      setTemplateId(null);
      setTemplateName("");
    }
  }, [isGateway]);

  async function launchOne(domainId: string): Promise<boolean> {
    // Field names follow the stable API contract (entryScriptId / offerId / landingId).
    const res = await fetch("/api/deploy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        isGateway
          ? {
              domainId,
              geoId: marketId,
              entryScriptId: scriptId,
              offerId: null,
              deployMode: "pack_only",
              pixelPlatform: "google",
            }
          : {
              domainId,
              geoId: marketId,
              entryScriptId: scriptId,
              offerId: packId,
              landingId: type === "template_and_pack" ? templateId : null,
              landingName: templateName || undefined,
              deployMode: type,
              pixelPlatform: analytics,
            },
      ),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err?.error ?? "Failed to start deploy");
      return false;
    }
    const j = await res.json();

    return new Promise((resolve) => {
      const es = new EventSource(`/api/deploy/${j.jobId}/log`);
      es.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload.line) setLogLines((cur) => [...cur, payload.line]);
          if (payload.done) {
            es.close();
            const st = payload.status as JobStatus;
            setJobStatus(st);
            const dom = domains.find((d) => d.id === domainId);
            if (st === "success") {
              toast.success(`Deploy OK: ${dom?.name ?? domainId}`, { duration: 6_000 });
              resolve(true);
            } else {
              toast.error(`Deploy failed: ${dom?.name ?? domainId}`, { duration: 10_000 });
              resolve(false);
            }
          }
        } catch {}
      };
      es.onerror = () => {
        es.close();
        resolve(false);
      };
    });
  }

  async function launch() {
    if (domainIds.length === 0) return;
    setJobStatus("running");
    setLogLines([]);
    setBatchProgress({ current: 0, total: domainIds.length });

    let ok = 0;
    for (let i = 0; i < domainIds.length; i++) {
      const id = domainIds[i];
      const dom = domains.find((d) => d.id === id);
      setLogLines((cur) => [...cur, `[batch] ${i + 1}/${domainIds.length} → ${dom?.name ?? id}`]);
      setBatchProgress({ current: i + 1, total: domainIds.length });
      const success = await launchOne(id);
      if (success) ok++;
    }

    setBatchProgress(null);
    setJobStatus(ok > 0 ? "success" : "failed");
    toast.success(`Batch finished: ${ok}/${domainIds.length} succeeded`);
    reload();
  }

  const isDeployed = selectedDomain?.status === "deployed";
  const canLaunch = isGateway
    ? domainIds.length > 0 && !!marketId && !!scriptId && jobStatus !== "running"
    : domainIds.length > 0 &&
      !!marketId &&
      !!packId &&
      !!scriptId &&
      (type === "pack_only" || !!templateId) &&
      jobStatus !== "running";

  const statusTone =
    jobStatus === "success"
      ? "ok"
      : jobStatus === "failed"
        ? "danger"
        : jobStatus === "running"
          ? "warn"
          : "idle";

  return (
    <div className="stagger-in space-y-5">
      {/* Hero */}
      <section className="border-b border-white/[0.06] pb-5">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="mb-2 flex items-center gap-2.5">
              <span className="tag">
                <Rocket className="h-3 w-3" /> deploy wizard
              </span>
              <span className="inline-flex items-center gap-2 font-mono text-[11px] text-zinc-500">
                <span className="status-pulse" data-tone={statusTone} />
                {jobStatus}
              </span>
            </div>
            <h1 className="page-title">New Deploy</h1>
            <p className="mt-1.5 max-w-lg text-[13px] text-zinc-500">
              Domain → Market → Template → Content Pack → Entry Script → Run Deploy. Pick one or
              many domains; progress streams live.
            </p>
          </div>
          {selectedDomain && isDeployed && (
            <Button
              variant="secondary"
              onClick={() => setRollbackOpen(true)}
            >
              <Undo2 className="mr-1 h-4 w-4 text-amber-300" /> Roll back {selectedDomain.name}
            </Button>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[1fr_320px]">
        {/* Main form column */}
        <div className="space-y-5">
          {/* 01 Domain */}
          <Card className="space-y-5 !p-5">
            <SectionHead
              step="01"
              title="Domain"
              hint={
                selectedDomains.length > 0
                  ? `${selectedDomains.length} selected · batch ready`
                  : "one or many — pasting a list works"
              }
            />
            <DomainMultiSelect domains={domains} value={domainIds} onChange={setDomainIds} />
          </Card>

          {/* 02 Market */}
          <Card className="space-y-4 !p-5">
            <SectionHead
              step="02"
              title="Market"
              hint={
                selectedMarket ? (
                  <span className="inline-flex items-center gap-1.5">
                    <GeoFlag flag={selectedMarket.flag} code={selectedMarket.code} size={18} />
                    {selectedMarket.code}
                  </span>
                ) : (
                  "templates, packs and scripts are filtered by market"
                )
              }
            />
            <Field label="Market">
              <Select
                value={marketId ?? undefined}
                onValueChange={(v) => {
                  setMarketId(v);
                  setScriptId(null);
                }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select a market…" />
                </SelectTrigger>
                <SelectContent>
                  {markets.length === 0 && (
                    <div className="p-3 text-sm text-zinc-500">
                      No markets yet — an admin can add them in Admin → Markets
                    </div>
                  )}
                  {markets.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      <GeoFlag flag={m.flag} code={m.code} size={22} className="mr-1.5" />
                      <span className="font-mono">{m.code}</span> · {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div>
              <Label className="page-kicker mb-2 block">
                Deploy mode
              </Label>
              <RadioGroup
                value={mode}
                onValueChange={(v) => setMode(v as DeployMode)}
                className="grid grid-cols-1 gap-3 sm:grid-cols-2"
              >
                <ChoiceTile
                  value="standard"
                  active={mode === "standard"}
                  title="Full deploy"
                  desc="Content pack (+ optional template) with an entry script"
                />
                <ChoiceTile
                  value="gateway"
                  active={mode === "gateway"}
                  title="Gateway only"
                  desc="Entry script only — no template or content pack"
                />
              </RadioGroup>
            </div>
          </Card>

          {/* 03 Template */}
          {!isGateway && (
            <Card className="space-y-4 !p-5">
              <SectionHead
                step="03"
                title="Template"
                hint={type === "template_and_pack" ? `${templates.length} for this market` : "optional"}
              />
              <RadioGroup
                value={type}
                onValueChange={(v) => setType(v as DeployType)}
                className="grid grid-cols-1 gap-3 sm:grid-cols-2"
              >
                <ChoiceTile
                  value="pack_only"
                  active={type === "pack_only"}
                  title="Content pack only"
                  desc="Deploy the content pack without a site template"
                />
                <ChoiceTile
                  value="template_and_pack"
                  active={type === "template_and_pack"}
                  title="Template + content pack"
                  desc="Deploy a site template together with a content pack"
                />
              </RadioGroup>

              {type === "template_and_pack" && (
                <Field label="Site template" hint={`for this market: ${templates.length}`}>
                  <Select value={templateId ?? undefined} onValueChange={setTemplateId}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select a template…" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.length === 0 && (
                        <div className="p-3 text-sm text-zinc-500">
                          No templates for this market — upload one on /templates
                        </div>
                      )}
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          <GeoFlag flag={t.geo.flag} code={t.geo.code} size={22} className="mr-1.5" />
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="mt-3 space-y-1.5">
                    <Label className="text-xs text-zinc-400">Template name (optional)</Label>
                    <Input
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      placeholder="defaults to the file name"
                      className="h-11"
                    />
                  </div>
                </Field>
              )}
            </Card>
          )}

          {/* 04 Content Pack */}
          {!isGateway && (
            <Card className="space-y-4 !p-5">
              <SectionHead
                step="04"
                title="Content Pack"
                hint={marketId ? `${packs.length} for this market` : "select a market first"}
              />
              <Field label="Content pack">
                <Select value={packId ?? undefined} onValueChange={setPackId} disabled={!marketId}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select a content pack…" />
                  </SelectTrigger>
                  <SelectContent>
                    {packs.length === 0 && (
                      <div className="p-3 text-sm text-zinc-500">
                        No content packs for this market — upload one on /packs
                      </div>
                    )}
                    {packs.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        <GeoFlag flag={p.geo.flag} code={p.geo.code} size={22} className="mr-1.5" />
                        <span className="font-mono">{p.geo.code}</span> · {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <div>
                <Label className="page-kicker mb-2 block">
                  Analytics preset
                </Label>
                <RadioGroup
                  value={analytics}
                  onValueChange={(v) => setAnalytics(v as AnalyticsPreset)}
                  className="grid grid-cols-1 gap-3 sm:grid-cols-3"
                >
                  <ChoiceTile
                    value="google"
                    active={analytics === "google"}
                    title="Google"
                    desc="Google tag on the thank-you page"
                  />
                  <ChoiceTile
                    value="facebook"
                    active={analytics === "facebook"}
                    title="Meta"
                    desc="Keep the pack's Meta pixel as is"
                  />
                  <ChoiceTile
                    value="tiktok"
                    active={analytics === "tiktok"}
                    title="TikTok"
                    desc="TikTok pixel page-view and conversion events"
                  />
                </RadioGroup>
              </div>
            </Card>
          )}

          {/* 05 Entry Script */}
          <Card className="space-y-4 !p-5">
            <SectionHead
              step={isGateway ? "03" : "05"}
              title="Entry Script"
              hint={
                selectedMarket
                  ? `for ${selectedMarket.code} · ★ = default`
                  : "select a market first"
              }
            />
            <Field label="Entry script">
              <Select value={scriptId ?? undefined} onValueChange={setScriptId} disabled={!marketId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select an entry script…" />
                </SelectTrigger>
                <SelectContent>
                  {scripts.length === 0 && (
                    <div className="p-3 text-sm text-rose-300">
                      {selectedMarket
                        ? isGateway
                          ? `No gateway scripts for ${selectedMarket.code} — upload one in Admin → Entry Scripts`
                          : `No entry scripts for ${selectedMarket.code}`
                        : "Select a market first"}
                    </div>
                  )}
                  {scripts.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.isDefault && "★ "}
                      {s.name} · {LAYOUT_LABEL[s.engine ?? "php_gateway"]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </Card>

          {/* 06 Run Deploy */}
          <Card className="space-y-4 !p-5">
            <SectionHead
              step={isGateway ? "04" : "06"}
              title="Run Deploy"
              hint={canLaunch ? "ready to run" : "complete the steps above"}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="lg"
                onClick={launch}
                disabled={!canLaunch}
                className="px-6"
              >
                {jobStatus === "running" ? (
                  <>
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    {batchProgress
                      ? `${batchProgress.current}/${batchProgress.total}…`
                      : "Running…"}
                  </>
                ) : (
                  <>
                    <Play className="mr-1 h-4 w-4" />
                    Deploy {domainIds.length > 1 ? `${domainIds.length} domains` : "now"}
                  </>
                )}
              </Button>
              {isDeployed && (
                <Button
                  variant="secondary"
                  onClick={() => setRollbackOpen(true)}
                >
                  <Undo2 className="mr-1 h-4 w-4 text-amber-300" /> Rollback
                </Button>
              )}
              {jobStatus === "success" && selectedDomain && (
                <Button asChild variant="secondary">
                  <Link href={`https://${selectedDomain.name}/`} target="_blank">
                    <ExternalLink className="mr-1 h-4 w-4 text-emerald-300" /> Open site
                  </Link>
                </Button>
              )}
              {jobStatus === "failed" && (
                <Button variant="destructive" onClick={launch}>
                  <XCircle className="mr-1 h-4 w-4" /> Retry
                </Button>
              )}
            </div>
          </Card>

          <Card className="overflow-hidden !p-0">
            <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
              <div>
                <div className="text-sm font-semibold">Live log</div>
                <div className="text-xs text-zinc-500">streamed deploy steps</div>
              </div>
              <Badge
                variant={
                  jobStatus === "success"
                    ? "success"
                    : jobStatus === "failed"
                      ? "destructive"
                      : jobStatus === "running"
                        ? "warning"
                        : "secondary"
                }
              >
                {jobStatus === "success" && <CheckCircle2 className="mr-1 h-3 w-3" />}
                {jobStatus === "failed" && <XCircle className="mr-1 h-3 w-3" />}
                {jobStatus === "running" && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                {jobStatus}
              </Badge>
            </div>
            <div className="p-4 md:p-5">
              <LogViewer lines={logLines} status={jobStatus} />
            </div>
          </Card>
        </div>

        {/* Sticky summary */}
        <aside className="xl:sticky xl:top-4">
          <div className="surface space-y-3.5 p-5">
            <div className="flex items-center justify-between">
              <h2 className="page-kicker">
                Summary
              </h2>
              <span className="status-pulse" data-tone={canLaunch ? "ok" : statusTone} />
            </div>

            <SummaryRow
              label="Domain"
              value={
                selectedDomains.length > 0
                  ? selectedDomains.length === 1
                    ? selectedDomains[0].name
                    : `${selectedDomains.length} selected`
                  : undefined
              }
            />
            <SummaryRow
              label="Market"
              value={
                selectedMarket ? (
                  <span className="inline-flex items-center gap-1.5">
                    <GeoFlag flag={selectedMarket.flag} code={selectedMarket.code} size={18} />
                    {selectedMarket.code}
                  </span>
                ) : undefined
              }
            />
            <SummaryRow label="Mode" value={isGateway ? "Gateway only" : "Full deploy"} />
            {!isGateway && type === "template_and_pack" && (
              <SummaryRow label="Template" value={templates.find((t) => t.id === templateId)?.name} />
            )}
            {!isGateway && (
              <SummaryRow label="Content pack" value={packs.find((p) => p.id === packId)?.name} />
            )}
            {!isGateway && (
              <SummaryRow
                label="Analytics"
                value={analytics === "facebook" ? "Meta" : analytics.charAt(0).toUpperCase() + analytics.slice(1)}
              />
            )}
            <SummaryRow
              label="Entry script"
              value={scripts.find((s) => s.id === scriptId)?.name}
            />

            {batchProgress && (
              <div className="pt-2">
                <div className="mb-1.5 flex justify-between text-[11px] text-zinc-500">
                  <span>Batch</span>
                  <span>
                    {batchProgress.current}/{batchProgress.total}
                  </span>
                </div>
                <div className="meter">
                  <span
                    style={{
                      width: `${Math.round((batchProgress.current / batchProgress.total) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}

            <Button
              size="lg"
              className="mt-2 w-full"
              onClick={launch}
              disabled={!canLaunch}
            >
              {jobStatus === "running" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Running…
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" /> Run Deploy
                </>
              )}
            </Button>
            {!canLaunch && jobStatus !== "running" && (
              <p className="text-center text-[11px] text-zinc-600">
                {isGateway
                  ? "choose domain, market and entry script"
                  : "choose domain, market, content pack and entry script"}
              </p>
            )}
          </div>
        </aside>
      </div>

      <RollbackDialog
        open={rollbackOpen}
        onOpenChange={setRollbackOpen}
        domain={selectedDomain ? { id: selectedDomain.id, name: selectedDomain.name } : null}
        onFinish={reload}
      />
    </div>
  );
}

function SectionHead({
  step,
  title,
  hint,
}: {
  step: string;
  title: string;
  hint?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="mb-1 font-mono text-[11px] font-medium text-lime-400/80">
          {step}
        </div>
        <h2 className="font-display text-[15px] font-semibold tracking-tight">{title}</h2>
      </div>
      {hint && <div className="max-w-xs text-right text-xs text-zinc-500">{hint}</div>}
    </div>
  );
}

function ChoiceTile({
  value,
  active,
  title,
  desc,
}: {
  value: string;
  active: boolean;
  title: string;
  desc: string;
}) {
  return (
    <label className="choice-tile" data-active={active ? "true" : "false"}>
      <RadioGroupItem value={value} className="mt-0.5" />
      <div className="relative z-[1] min-w-0">
        <div className="text-sm font-semibold text-zinc-100">{title}</div>
        <p className="mt-0.5 text-xs leading-snug text-zinc-500">{desc}</p>
      </div>
    </label>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Label className="text-sm font-medium">{label}</Label>
        {hint && <div className="text-xs text-zinc-500">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/[0.04] py-2.5 text-sm last:border-b-0">
      <span className="shrink-0 text-zinc-500">{label}</span>
      <span className="max-w-[60%] truncate text-right text-xs font-medium text-zinc-200">
        {value ?? "—"}
      </span>
    </div>
  );
}
