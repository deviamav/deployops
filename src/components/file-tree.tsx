"use client";

import { useMemo, useState } from "react";
import { ChevronRight, File as FileIcon, Folder, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FileTreeEntry {
  path: string;
  size?: number;
}

interface TreeNode {
  name: string;
  fullPath: string;
  children: Map<string, TreeNode>;
  isFile: boolean;
  size?: number;
}

function buildTree(entries: FileTreeEntry[]): TreeNode {
  const root: TreeNode = {
    name: "",
    fullPath: "",
    children: new Map(),
    isFile: false,
  };
  for (const e of entries) {
    const parts = e.path.split("/").filter(Boolean);
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isFile = i === parts.length - 1;
      const fullPath = parts.slice(0, i + 1).join("/");
      let child = node.children.get(name);
      if (!child) {
        child = {
          name,
          fullPath,
          children: new Map(),
          isFile,
          size: isFile ? e.size : undefined,
        };
        node.children.set(name, child);
      }
      node = child;
    }
  }
  return root;
}

interface Props {
  entries: FileTreeEntry[];
  activePath?: string | null;
  onSelect: (path: string) => void;
}

export function FileTree({ entries, activePath, onSelect }: Props) {
  const tree = useMemo(() => buildTree(entries), [entries]);
  return (
    <div className="text-sm">
      <TreeChildren node={tree} depth={0} activePath={activePath ?? null} onSelect={onSelect} />
    </div>
  );
}

function TreeChildren({
  node,
  depth,
  activePath,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  activePath: string | null;
  onSelect: (path: string) => void;
}) {
  const entries = Array.from(node.children.values()).sort((a, b) => {
    if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
  return (
    <ul className="space-y-0.5">
      {entries.map((c) =>
        c.isFile ? (
          <FileRow key={c.fullPath} node={c} depth={depth} activePath={activePath} onSelect={onSelect} />
        ) : (
          <FolderRow key={c.fullPath} node={c} depth={depth} activePath={activePath} onSelect={onSelect} />
        ),
      )}
    </ul>
  );
}

function FolderRow({
  node,
  depth,
  activePath,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  activePath: string | null;
  onSelect: (path: string) => void;
}) {
  const [open, setOpen] = useState(depth < 1);
  return (
    <li>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left text-zinc-300 hover:bg-white/5"
        style={{ paddingLeft: depth * 14 + 6 }}
      >
        <ChevronRight
          className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")}
        />
        {open ? (
          <FolderOpen className="h-3.5 w-3.5 text-amber-300" />
        ) : (
          <Folder className="h-3.5 w-3.5 text-amber-300" />
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {open && (
        <TreeChildren node={node} depth={depth + 1} activePath={activePath} onSelect={onSelect} />
      )}
    </li>
  );
}

function FileRow({
  node,
  depth,
  activePath,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  activePath: string | null;
  onSelect: (path: string) => void;
}) {
  const isActive = activePath === node.fullPath;
  return (
    <li>
      <button
        onClick={() => onSelect(node.fullPath)}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left",
          isActive
            ? "bg-lime-500/15 text-lime-100"
            : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200",
        )}
        style={{ paddingLeft: depth * 14 + 24 }}
      >
        <FileIcon className="h-3.5 w-3.5 text-zinc-500" />
        <span className="truncate">{node.name}</span>
      </button>
    </li>
  );
}
