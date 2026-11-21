import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "512mb",
    },
    // Next.js 16 + middleware буферизує body (default 10MB). Без цього
    // великі ZIP (>10MB) обрізаються → req.formData() падає з
    // "Failed to parse body as FormData".
    proxyClientMaxBodySize: "600mb",
  },
  serverExternalPackages: ["node-ssh", "ssh2", "adm-zip", "bcryptjs"],
  // SECURITY: глобальні security headers. Preview-routes мають власну CSP
  // зі sandbox і повертають окремі заголовки, які перевизначають ці тут.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
