import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

const PUBLIC_PATHS = ["/login", "/api/auth"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Прод-only редірект http→https.
  if (
    process.env.NODE_ENV === "production" &&
    req.headers.get("x-forwarded-proto") === "http"
  ) {
    const url = req.nextUrl.clone();
    url.protocol = "https:";
    return NextResponse.redirect(url, 308);
  }

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p)) || pathname.startsWith("/api/flags/")) {
    return NextResponse.next();
  }

  // У production cookies мають префікс `__Secure-` (HTTPS). Без явного
  // `secureCookie`/`cookieName` getToken дивиться на `authjs.session-token` і
  // повертає null, навіть якщо токен валідний — звідси 307/401 у проді.
  const isHttps =
    req.nextUrl.protocol === "https:" ||
    req.headers.get("x-forwarded-proto") === "https" ||
    process.env.NODE_ENV === "production";
  const cookieName = isHttps
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
    secureCookie: isHttps,
    cookieName,
    salt: cookieName,
  });

  if (!token) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // RBAC на /admin/* і /servers — лише admin.
  // Деякі довідникові GET-и доступні всім авторизованим (потрібні в селекторах майстра).
  const isSafeAdminGet =
    req.method === "GET" &&
    (pathname.startsWith("/api/admin/scripts") ||
      pathname.startsWith("/api/admin/geos") ||
      pathname.startsWith("/api/admin/setups") ||
      pathname.startsWith("/api/admin/groups") ||
      // /api/admin/users теж читаємо як «довідник власників» — сам API
      // обмежує payload, повертаючи мінімум для tl/buyer.
      pathname === "/api/admin/users");

  const adminOnly =
    (pathname.startsWith("/admin") ||
      pathname.startsWith("/api/admin") ||
      pathname === "/servers" ||
      pathname.startsWith("/servers/")) &&
    !isSafeAdminGet;

  if (adminOnly) {
    if ((token as any).role !== "admin") {
      if (pathname.startsWith("/api")) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  // Захищені сторінки не повинні зберігатися в bfcache/disk-cache після logout.
  const res = NextResponse.next();
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

export const config = {
  matcher: [
    /*
     * Виключаємо статичні файли + _next + favicon.
     */
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|manifest.webmanifest).*)",
  ],
};
