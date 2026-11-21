"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AmbientBackdrop } from "@/components/ambient-backdrop";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await signIn("credentials", { email, password, redirect: false });
      if (res?.error) {
        toast.error("Invalid email or password");
      } else {
        const raw = params.get("next") ?? "/";
        const isSafe =
          raw.startsWith("/") &&
          !raw.startsWith("//") &&
          !raw.startsWith("/\\") &&
          !raw.startsWith("\\");
        router.replace(isSafe ? raw : "/");
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-canvas relative grid min-h-screen lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      {/* Editorial panel */}
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-white/[0.08] bg-[#0c0c0e] p-10 lg:flex">
        <AmbientBackdrop />
        <div className="relative z-10 flex items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-md border border-lime-400/30 bg-lime-400/[0.08] text-lime-300">
            <BrandMark />
          </span>
          <span className="font-display text-sm font-semibold tracking-tight">
            Deploy<span className="text-lime-300">Ops</span>
          </span>
        </div>

        <div className="relative z-10 max-w-md">
          <p className="page-kicker">Operations console</p>
          <h2 className="mt-4 font-display text-[2.5rem] font-semibold leading-[1.08] tracking-[-0.03em] text-zinc-50">
            One console for every market you ship to.
          </h2>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-zinc-500">
            SSH inventory, templates, content packs and a guided deploy wizard — with role-based
            access and a full audit trail.
          </p>
        </div>

        <dl className="relative z-10 grid max-w-md grid-cols-3 gap-6 border-t border-white/[0.08] pt-5">
          {[
            ["Deploy", "Wizard + batch"],
            ["Access", "RBAC by group"],
            ["Trace", "Audit log"],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="page-kicker">{k}</dt>
              <dd className="mt-1 text-xs text-zinc-300">{v}</dd>
            </div>
          ))}
        </dl>
      </aside>

      {/* Form */}
      <main className="relative flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mb-10 flex items-center gap-2.5 lg:hidden">
          <span className="flex h-6 w-6 items-center justify-center rounded-md border border-lime-400/30 bg-lime-400/[0.08] text-lime-300">
            <BrandMark />
          </span>
          <span className="font-display text-sm font-semibold tracking-tight">
            Deploy<span className="text-lime-300">Ops</span>
          </span>
        </div>

        <form
          onSubmit={onSubmit}
          className="page-enter mx-auto w-full max-w-[340px] space-y-5"
        >
          <div className="space-y-1.5">
            <h1 className="font-display text-xl font-semibold tracking-tight text-zinc-50">
              Sign in
            </h1>
            <p className="text-[13px] text-zinc-500">Use your DeployOps account to continue.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs font-medium text-zinc-400">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="admin@example.com"
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs font-medium text-zinc-400">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="h-10"
            />
          </div>
          <Button type="submit" disabled={loading} className="h-10 w-full" size="lg">
            {loading ? "Signing in…" : "Continue"}
          </Button>
        </form>

        <p className="absolute bottom-6 left-0 right-0 text-center font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-700">
          Restricted access · activity is logged
        </p>
      </main>
    </div>
  );
}

function BrandMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" aria-hidden>
      <rect x="7" y="7" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
      <rect x="10.2" y="10.2" width="3.6" height="3.6" rx="0.6" fill="currentColor" />
      <path
        d="M9.5 3v2.5M14.5 3v2.5M9.5 18.5V21M14.5 18.5V21M3 9.5h2.5M3 14.5h2.5M18.5 9.5H21M18.5 14.5H21"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
