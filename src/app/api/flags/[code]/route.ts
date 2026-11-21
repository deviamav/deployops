import { normalizeGeoCode } from "@/lib/geo-flag";

/** Проксі прапорів — картинка з нашого домену (same-origin). */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ code: string }> },
) {
  const { code } = await ctx.params;
  const iso = normalizeGeoCode(code);
  if (!iso) {
    return new Response("invalid code", { status: 400 });
  }

  const url = new URL(req.url);
  const requested = Number(url.searchParams.get("s") ?? 40);
  const w = requested >= 48 ? 160 : requested >= 32 ? 80 : requested >= 20 ? 40 : 20;

  const upstream = await fetch(`https://flagcdn.com/w${w}/${iso.toLowerCase()}.png`, {
    next: { revalidate: 86_400 },
  });
  if (!upstream.ok) {
    return new Response("flag unavailable", { status: 502 });
  }

  const buf = await upstream.arrayBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
