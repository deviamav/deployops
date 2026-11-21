import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { HttpError } from "./rbac";

const UPLOAD_MAX_MB = Number(process.env.UPLOAD_MAX_SIZE_MB ?? 512);

/** Безпечний парсинг multipart/form-data з зрозумілою помилкою при обрізаному body. */
export async function parseRequestFormData(req: Request): Promise<FormData> {
  try {
    return await req.formData();
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    if (/formdata|multipart|boundary/i.test(msg)) {
      throw new HttpError(
        413,
        `Не вдалось прочитати завантаження (multipart). Перевір розмір архіву (макс. ${UPLOAD_MAX_MB} MB) і що nginx має client_max_body_size ≥600m. Деталі: ${msg}`,
      );
    }
    throw e;
  }
}

export function badRequest(message: string, extras?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extras }, { status: 400 });
}

export function notFound(message = "not-found") {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function ok<T>(payload: T, init?: ResponseInit) {
  return NextResponse.json(payload, init);
}

/**
 * SECURITY: безпечно формує Content-Disposition: attachment.
 * - вирізає CRLF/control-символи (захист від header-injection)
 * - використовує RFC 5987 `filename*=UTF-8''...` для не-ASCII
 * - fallback `filename="..."` з escape для старих клієнтів
 */
export function contentDispositionAttachment(filename: string): string {
  const clean = String(filename ?? "")
    .replace(/[\r\n\u0000-\u001f\u007f]/g, "")
    .replace(/[\\]/g, "_")
    .slice(0, 200) || "download.bin";
  const asciiFallback = clean.replace(/["%*<>?]/g, "_").replace(/[^\x20-\x7e]/g, "_");
  const utf8Encoded = encodeURIComponent(clean);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${utf8Encoded}`;
}

export function handleError(e: unknown) {
  if (e instanceof HttpError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  if (e instanceof ZodError) {
    return NextResponse.json(
      { error: "validation", issues: e.flatten() },
      { status: 422 },
    );
  }
  console.error(e);
  const msg = (e as any)?.message ?? "internal";
  return NextResponse.json({ error: msg }, { status: 500 });
}
