"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Globe,
  History,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Server,
  Settings,
  Shield,
  Sparkles,
  Users,
  Wand2,
} from "lucide-react";
import type { Role } from "@prisma/client";
import { cn, roleLabel } from "@/lib/utils";
import { useSidebar } from "@/components/sidebar-context";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: Role[];
}

const PRIMARY: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/deploy", label: "New Deploy", icon: Wand2 },
  { href: "/domains", label: "Domains", icon: Globe },
  { href: "/packs", label: "Content Packs", icon: BarChart3 },
  { href: "/templates", label: "Templates", icon: Sparkles },
  { href: "/servers", label: "Servers", icon: Server, roles: ["admin"] },
  { href: "/history", label: "History", icon: History },
];

const ADMIN: NavItem[] = [
  { href: "/admin/users", label: "Users", icon: Users, roles: ["admin"] },
  { href: "/admin/groups", label: "Groups", icon: Users, roles: ["admin", "team_lead"] },
  { href: "/admin/setups", label: "Setups", icon: Settings, roles: ["admin"] },
  { href: "/admin/geos", label: "Markets", icon: Globe, roles: ["admin"] },
  { href: "/admin/scripts", label: "Entry Scripts", icon: Shield, roles: ["admin"] },
  { href: "/audit", label: "Audit", icon: ListChecks, roles: ["admin", "team_lead"] },
];

export function AppSidebar({
  role,
  email,
  name,
}: {
  role: Role;
  email: string;
  name: string | null;
}) {
  const pathname = usePathname();
  const { expanded, toggle } = useSidebar();
  const primary = PRIMARY.filter((i) => !i.roles || i.roles.includes(role));
  const admin = ADMIN.filter((i) => !i.roles || i.roles.includes(role));
  const initial = (name ?? email).slice(0, 1).toUpperCase();

  return (
    <>
      <aside
        className={cn(
          "sidebar-panel sticky top-0 hidden h-screen flex-shrink-0 flex-col self-start border-r border-white/[0.08] bg-[#0c0c0e] lg:flex",
          expanded ? "w-[224px]" : "w-[56px]",
        )}
      >
        {/* Brand */}
        <div
          className={cn(
            "flex h-12 items-center border-b border-white/[0.06] px-3",
            expanded ? "gap-2.5" : "justify-center px-0",
          )}
        >
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-lime-400/30 bg-lime-400/[0.08] text-lime-300">
            <BrandMark />
          </div>
          {expanded && (
            <div className="min-w-0 flex-1 truncate font-display text-[13px] font-semibold tracking-tight">
              Deploy<span className="text-lime-300">Ops</span>
            </div>
          )}
          {expanded && (
            <button
              type="button"
              onClick={toggle}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-zinc-600 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
              title="Collapse"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Nav */}
        <nav className="scrollbar-thin flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3">
          {primary.map((item) => (
            <NavRow
              key={item.href}
              item={item}
              active={isActive(pathname, item.href)}
              expanded={expanded}
            />
          ))}
          {admin.length > 0 && (
            <>
              {expanded ? (
                <div className="px-2.5 pb-1 pt-5 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-zinc-600">
                  Admin
                </div>
              ) : (
                <div className="mx-2 my-3 h-px bg-white/[0.06]" />
              )}
              {admin.map((item) => (
                <NavRow
                  key={item.href}
                  item={item}
                  active={isActive(pathname, item.href)}
                  expanded={expanded}
                />
              ))}
            </>
          )}
        </nav>

        {/* Account */}
        <div className="border-t border-white/[0.06] p-2">
          {!expanded && (
            <button
              type="button"
              onClick={toggle}
              title="Expand"
              className="mb-1 flex h-8 w-full items-center justify-center rounded-md text-zinc-600 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
          <div className={cn("flex items-center gap-2", !expanded && "flex-col")}>
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/[0.1] bg-[#17171a] text-[11px] font-semibold text-zinc-200">
              {initial}
            </div>
            {expanded && (
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium text-zinc-200">{name ?? email}</div>
                <div className="truncate font-mono text-[10px] text-zinc-500">{roleLabel(role)}</div>
              </div>
            )}
            <button
              type="button"
              title="Sign out"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
              onClick={async () => {
                await signOut({ redirect: false });
                window.location.replace("/login");
              }}
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-50 flex items-stretch justify-around border-t border-white/[0.08] bg-[#0c0c0e]/95 px-1 py-1 backdrop-blur lg:hidden">
        {primary.slice(0, 5).map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-w-[3.75rem] flex-1 flex-col items-center gap-0.5 rounded-md px-2 py-1.5 transition-colors",
                active ? "text-lime-300" : "text-zinc-500",
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="text-[10px] font-medium">{item.label.split(" ")[0]}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

function NavRow({
  item,
  active,
  expanded,
}: {
  item: NavItem;
  active: boolean;
  expanded: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      title={item.label}
      className={cn(
        "group relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors duration-150",
        active
          ? "bg-white/[0.07] text-zinc-50"
          : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100",
        !expanded && "justify-center px-0",
      )}
    >
      {active && (
        <span className="absolute -left-2 top-1.5 h-5 w-[2px] rounded-full bg-lime-400" aria-hidden />
      )}
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 transition-colors",
          active ? "text-lime-300" : "text-zinc-500 group-hover:text-zinc-300",
        )}
      />
      {expanded && <span className="truncate">{item.label}</span>}
    </Link>
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

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
