"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronRight,
  ExternalLink,
  File as FileIcon,
  Folder,
  Home,
  ImageIcon,
  Loader2,
  RefreshCcw,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, formatBytes } from "@/lib/utils";

interface RemoteEntry {
  name: string;
  path: string;
  isDir: boolean;
  isSymlink: boolean;
  size: number;
  mtime: string | null;
  mode: string;
  owner: string;
}

export default function ServerFilesPage() {
  return (
    <Suspense fallback={null}>
      <ServerFilesView />
    </Suspense>
  );
}

const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg|ico)$/i;

function ServerFilesView() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const [path, setPath] = useState<string>(params.get("path") || "/");
  const [entries, setEntries] = useState<RemoteEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileBinary, setFileBinary] = useState<{ size: number; mime: string } | null>(null);
  const [fileLoading, setFileLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${id}/browse?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "error");
        setEntries([]);
      } else {
        setEntries(data.entries);
      }
    } finally {
      setLoading(false);
    }
  }, [id, path]);

  useEffect(() => {
    load();
  }, [load]);

  // Sync the address bar (no reload)
  useEffect(() => {
    const qs = new URLSearchParams({ path }).toString();
    router.replace(`/servers/${id}/files?${qs}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  async function openFile(p: string) {
    setSelectedFile(p);
    setFileContent(null);
    setFileBinary(null);
    setFileLoading(true);
    try {
      const res = await fetch(`/api/servers/${id}/read?path=${encodeURIComponent(p)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "could not read file");
        return;
      }
      if (data.binary) {
        setFileBinary({ size: data.size, mime: data.mime });
      } else {
        setFileContent(data.content);
      }
    } finally {
      setFileLoading(false);
    }
  }

  const crumbs = pathCrumbs(path);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/servers" className="text-sm text-zinc-400 hover:text-zinc-200">
            <ArrowLeft className="mr-1 inline h-3 w-3" /> back to servers
          </Link>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Server files</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setPath("/")}>
            <Home className="mr-1 h-4 w-4" /> /
          </Button>
          <Button variant="secondary" onClick={load}>
            <RefreshCcw className="mr-1 h-4 w-4" /> Refresh
          </Button>
        </div>
      </div>

      <Breadcrumbs crumbs={crumbs} onNavigate={setPath} />

      {error && (
        <Card className="border-rose-500/30 bg-rose-500/5 py-3 text-sm text-rose-300">
          {error}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Mode</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {path !== "/" && (
                <TableRow
                  className="cursor-pointer"
                  onClick={() => setPath(parentPath(path))}
                >
                  <TableCell>
                    <Folder className="h-4 w-4 text-amber-300" />
                  </TableCell>
                  <TableCell colSpan={4} className="font-mono text-xs text-zinc-400">
                    ..
                  </TableCell>
                </TableRow>
              )}
              {loading && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-zinc-500">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> loading…
                  </TableCell>
                </TableRow>
              )}
              {!loading && entries.length === 0 && !error && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-zinc-500">
                    Empty
                  </TableCell>
                </TableRow>
              )}
              {entries.map((e) => (
                <TableRow
                  key={e.path}
                  className={cn(
                    "cursor-pointer",
                    selectedFile === e.path && "bg-lime-500/10",
                  )}
                  onClick={() => (e.isDir ? setPath(e.path) : openFile(e.path))}
                >
                  <TableCell>
                    {e.isDir ? (
                      <Folder className="h-4 w-4 text-amber-300" />
                    ) : IMAGE_RE.test(e.name) ? (
                      <ImageIcon className="h-4 w-4 text-lime-300" />
                    ) : (
                      <FileIcon className="h-4 w-4 text-zinc-500" />
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {e.name}
                    {e.isSymlink && (
                      <Badge variant="outline" className="ml-2">
                        link
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-zinc-400">
                    {e.isDir ? "—" : formatBytes(e.size)}
                  </TableCell>
                  <TableCell className="text-xs text-zinc-400">{e.owner}</TableCell>
                  <TableCell className="font-mono text-[11px] text-zinc-500">
                    {e.mode}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <Card className="flex h-[68vh] flex-col overflow-hidden p-0">
          <div className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <FileIcon className="h-4 w-4 text-zinc-500" />
              <span className="truncate font-mono text-xs">{selectedFile ?? "—"}</span>
            </div>
            {selectedFile && (
              <Button asChild size="sm" variant="ghost">
                <a
                  href={`/api/servers/${id}/read?path=${encodeURIComponent(selectedFile)}&raw=1`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="mr-1 h-3.5 w-3.5" /> Open raw
                </a>
              </Button>
            )}
          </div>
          <div className="flex-1 overflow-hidden">
            {fileLoading && (
              <div className="flex h-full items-center justify-center text-zinc-500">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> loading…
              </div>
            )}
            {!fileLoading && fileContent !== null && (
              <pre className="scrollbar-thin h-full overflow-auto whitespace-pre bg-black/70 p-4 font-mono text-xs text-zinc-200">
                {fileContent}
              </pre>
            )}
            {!fileLoading && fileBinary && selectedFile && (
              <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
                {IMAGE_RE.test(selectedFile) ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={`/api/servers/${id}/read?path=${encodeURIComponent(selectedFile)}&raw=1`}
                    alt={selectedFile}
                    className="max-h-[55vh] max-w-full rounded-xl border border-white/5"
                  />
                ) : (
                  <p className="font-mono text-xs text-zinc-400">
                    Binary file ({fileBinary.mime}) · {formatBytes(fileBinary.size)}
                  </p>
                )}
              </div>
            )}
            {!fileLoading && fileContent === null && !fileBinary && (
              <div className="flex h-full items-center justify-center text-zinc-600">
                click a file on the left to view it
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function pathCrumbs(p: string): { name: string; path: string }[] {
  if (p === "/" || !p) return [{ name: "/", path: "/" }];
  const parts = p.split("/").filter(Boolean);
  const out: { name: string; path: string }[] = [{ name: "/", path: "/" }];
  let acc = "";
  for (const part of parts) {
    acc += `/${part}`;
    out.push({ name: part, path: acc });
  }
  return out;
}

function parentPath(p: string): string {
  if (p === "/" || !p) return "/";
  const cut = p.replace(/\/+$/, "").lastIndexOf("/");
  return cut <= 0 ? "/" : p.slice(0, cut);
}

function Breadcrumbs({
  crumbs,
  onNavigate,
}: {
  crumbs: { name: string; path: string }[];
  onNavigate: (p: string) => void;
}) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto rounded-2xl border border-white/5 bg-zinc-900/50 px-3 py-2 font-mono text-xs">
      {crumbs.map((c, i) => (
        <span key={c.path} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3 w-3 text-zinc-600" />}
          <button
            onClick={() => onNavigate(c.path)}
            className="rounded px-1.5 py-0.5 text-zinc-300 hover:bg-white/5 hover:text-white"
          >
            {c.name}
          </button>
        </span>
      ))}
    </div>
  );
}
