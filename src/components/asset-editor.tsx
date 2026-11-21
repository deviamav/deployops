"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Code2,
  Download,
  ExternalLink,
  ImageIcon,
  Loader2,
  Save,
  Trash2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileTree, type FileTreeEntry } from "@/components/file-tree";
import { cn, formatBytes } from "@/lib/utils";

interface AssetMeta {
  id: string;
  name: string;
  originalFilename: string;
  sizeBytes: number;
}

interface Entry {
  path: string;
  size: number;
}

interface FilesResponse {
  asset: AssetMeta;
  entries: Entry[];
  indexEntry: string | null;
}

interface Props {
  kind: "templates" | "packs";
  id: string;
  canEdit: boolean;
  canDelete: boolean;
  canDownload: boolean;
}

const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg|ico)$/i;

export function AssetEditor({ kind, id, canEdit, canDelete, canDownload }: Props) {
  const router = useRouter();
  const [meta, setMeta] = useState<FilesResponse | null>(null);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [originalContent, setOriginalContent] = useState<string | null>(null);
  const [binarySize, setBinarySize] = useState<number | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [saving, setSaving] = useState(false);

  const apiRoot = `/api/${kind}/${id}`;

  const load = useCallback(async () => {
    const data = (await fetch(`${apiRoot}/files`).then((r) => r.json())) as FilesResponse;
    setMeta(data);
    if (!activePath && data.indexEntry) {
      setActivePath(data.indexEntry);
    } else if (!activePath && data.entries[0]) {
      setActivePath(data.entries[0].path);
    }
  }, [apiRoot, activePath]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!activePath) return;
    setLoadingFile(true);
    setContent(null);
    setOriginalContent(null);
    setBinarySize(null);
    fetch(`${apiRoot}/files/${encodeURIComponent(activePath).replace(/%2F/g, "/")}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.binary) {
          setBinarySize(d.size ?? null);
        } else if (typeof d?.content === "string") {
          setContent(d.content);
          setOriginalContent(d.content);
        }
      })
      .finally(() => setLoadingFile(false));
  }, [activePath, apiRoot]);

  async function save() {
    if (!activePath || content === null) return;
    setSaving(true);
    const res = await fetch(`${apiRoot}/files/${encodeURIComponent(activePath).replace(/%2F/g, "/")}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    setSaving(false);
    if (res.ok) {
      setOriginalContent(content);
      toast.success("Saved");
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err?.error ?? "Save failed");
    }
  }

  async function remove() {
    if (!confirm("Delete this ZIP asset permanently?")) return;
    const res = await fetch(`/api/${kind}/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Deleted");
      router.push(`/${kind}`);
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err?.error ?? "Error");
    }
  }

  const dirty = content !== null && content !== originalContent;
  const treeEntries: FileTreeEntry[] = useMemo(
    () => meta?.entries.map((e) => ({ path: e.path, size: e.size })) ?? [],
    [meta],
  );

  const ext = activePath?.match(/\.[^./\\]+$/)?.[0]?.toLowerCase() ?? "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            href={`/${kind}`}
            className="text-sm text-zinc-400 hover:text-zinc-200"
          >
            <ArrowLeft className="mr-1 inline h-3 w-3" /> back to {kind}
          </Link>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {meta?.asset.name ?? "…"}
          </h1>
          <p className="font-mono text-xs text-zinc-500">
            {meta?.asset.originalFilename}{" "}
            {meta && <span>· {formatBytes(meta.asset.sizeBytes)}</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="secondary">
            <a href={`${apiRoot}/preview/`} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-1 h-4 w-4" /> Open preview
            </a>
          </Button>
          {canDownload && (
            <Button asChild variant="secondary">
              <a href={`${apiRoot}/download`}>
                <Download className="mr-1 h-4 w-4" /> Download ZIP
              </a>
            </Button>
          )}
          {canDelete && (
            <Button variant="destructive" onClick={remove}>
              <Trash2 className="mr-1 h-4 w-4" /> Delete
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
        <Card className="p-3">
          <div className="flex items-center justify-between border-b border-white/5 px-1 pb-2 text-xs uppercase tracking-wider text-zinc-500">
            <span>Files</span>
            <Badge variant="secondary">{meta?.entries.length ?? 0}</Badge>
          </div>
          <div className="scrollbar-thin mt-2 h-[60vh] overflow-y-auto pr-1">
            <FileTree
              entries={treeEntries}
              activePath={activePath}
              onSelect={(p) => setActivePath(p)}
            />
          </div>
        </Card>

        <Card className="flex h-[calc(60vh+3rem)] flex-col overflow-hidden p-0">
          <div className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <Code2 className="h-4 w-4 text-zinc-500" />
              <span className="truncate font-mono text-sm">{activePath ?? "—"}</span>
              {dirty && <Badge variant="warning">modified</Badge>}
            </div>
            <div className="flex gap-2">
              {activePath && (
                <Button asChild variant="ghost" size="sm">
                  <a
                    href={`${apiRoot}/preview/${activePath}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="mr-1 h-3.5 w-3.5" /> Open file
                  </a>
                </Button>
              )}
              {canEdit && content !== null && (
                <Button onClick={save} disabled={!dirty || saving} size="sm">
                  {saving ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="mr-1 h-3.5 w-3.5" />
                  )}
                  Save
                </Button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-hidden">
            {loadingFile && (
              <div className="flex h-full items-center justify-center text-zinc-500">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> loading…
              </div>
            )}
            {!loadingFile && content !== null && (
              <textarea
                value={content}
                onChange={(e) => canEdit && setContent(e.target.value)}
                readOnly={!canEdit}
                spellCheck={false}
                className={cn(
                  "scrollbar-thin h-full w-full resize-none border-0 bg-black/70 px-4 py-3 font-mono text-xs leading-relaxed text-zinc-200 outline-none",
                  !canEdit && "opacity-90",
                )}
              />
            )}
            {!loadingFile && content === null && binarySize !== null && (
              <BinaryViewer
                kind={kind}
                id={id}
                path={activePath ?? ""}
                size={binarySize}
                ext={ext}
              />
            )}
            {!loadingFile && content === null && binarySize === null && (
              <div className="flex h-full items-center justify-center text-zinc-600">
                select a file on the left
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function BinaryViewer({
  kind,
  id,
  path,
  size,
  ext,
}: {
  kind: "templates" | "packs";
  id: string;
  path: string;
  size: number;
  ext: string;
}) {
  const isImage = IMAGE_RE.test(path);
  const src = `/api/${kind}/${id}/preview/${path}`;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center text-zinc-400">
      {isImage ? (
        <>
          <ImageIcon className="h-6 w-6 text-zinc-600" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={path}
            className="max-h-[55vh] max-w-full rounded-xl border border-white/5"
          />
        </>
      ) : (
        <>
          <ImageIcon className="h-6 w-6 text-zinc-600" />
          <p className="font-mono text-xs">
            Binary file ({ext || "?"}) · {formatBytes(size)}
          </p>
        </>
      )}
      <Button asChild variant="secondary" size="sm">
        <a href={src} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="mr-1 h-3.5 w-3.5" /> Open
        </a>
      </Button>
    </div>
  );
}
