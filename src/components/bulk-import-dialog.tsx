"use client";

import { useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { UploadCloud } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface ParsedRow {
  raw: string;
  lineNo: number;
  error?: string;
  [k: string]: any;
}

export interface BulkImportDialogProps<T extends ParsedRow> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  parse: (text: string) => T[];
  columns: { key: keyof T; label: string }[];
  /** Викликається при «Import» — повертає { created, errors? } для toast. */
  onImport: (text: string) => Promise<{ created?: number; createdDomains?: number; errors?: any[] } | void>;
  /** Кастомний slot перед кнопкою «Import» — для додаткових селектів. */
  controls?: React.ReactNode;
  textareaPlaceholder?: string;
}

export function BulkImportDialog<T extends ParsedRow>({
  open,
  onOpenChange,
  title,
  description,
  parse,
  columns,
  onImport,
  controls,
  textareaPlaceholder,
}: BulkImportDialogProps<T>) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const rows = text ? parse(text) : [];
  const validCount = rows.filter((r) => !r.error).length;
  const invalidCount = rows.length - validCount;

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    multiple: false,
    accept: { "text/plain": [".txt"] },
    onDrop: async (files) => {
      const f = files[0];
      if (!f) return;
      setText(await f.text());
    },
  });

  async function handleImport() {
    if (validCount === 0) {
      toast.error("No valid rows to import");
      return;
    }
    setLoading(true);
    try {
      const res = await onImport(text);
      const created = res?.created ?? 0;
      const createdDomains = res?.createdDomains ?? 0;
      toast.success(
        createdDomains
          ? `Imported ${created} servers and ${createdDomains} domains`
          : `Imported ${created} records`,
      );
      onOpenChange(false);
      setText("");
    } catch (e: any) {
      toast.error(e?.message ?? "Import failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-4">
          <div
            {...getRootProps()}
            className={`flex cursor-pointer items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-white/10 px-6 py-4 text-sm text-zinc-400 transition hover:border-lime-500/40 ${
              isDragActive ? "border-lime-500/50 bg-lime-500/5" : ""
            }`}
          >
            <input {...getInputProps()} />
            <UploadCloud className="h-5 w-5" />
            <span>
              Drop a <code className="text-zinc-200">.txt</code> file or click to browse
            </span>
          </div>

          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={textareaPlaceholder ?? "paste file contents…"}
            className="min-h-[160px] font-mono text-xs"
          />

          {rows.length > 0 && (
            <div className="rounded-2xl border border-white/5 bg-zinc-950/40">
              <div className="flex items-center justify-between border-b border-white/5 px-4 py-2 text-xs text-zinc-400">
                <span>
                  Parsed {rows.length} rows · valid{" "}
                  <span className="text-emerald-300">{validCount}</span> · errors{" "}
                  <span className="text-rose-300">{invalidCount}</span>
                </span>
              </div>
              <div className="max-h-72 overflow-y-auto scrollbar-thin">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      {columns.map((c) => (
                        <TableHead key={String(c.key)}>{c.label}</TableHead>
                      ))}
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow
                        key={r.lineNo}
                        className={r.error ? "bg-rose-500/5" : "bg-emerald-500/5"}
                      >
                        <TableCell className="text-xs text-zinc-500">{r.lineNo}</TableCell>
                        {columns.map((c) => (
                          <TableCell key={String(c.key)} className="font-mono text-xs">
                            {formatCell(r[c.key])}
                          </TableCell>
                        ))}
                        <TableCell>
                          {r.error ? (
                            <Badge variant="destructive">{r.error}</Badge>
                          ) : (
                            <Badge variant="success">ok</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {controls}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={loading || validCount === 0}>
            Import {validCount} rows
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatCell(v: unknown) {
  if (Array.isArray(v)) return v.join(" ");
  if (v === undefined || v === null) return "—";
  return String(v);
}
