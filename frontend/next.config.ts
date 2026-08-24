import type { NextConfig } from "next";

function configuredImageCdn(): URL | null {
  const value = process.env.IMAGE_CDN_URL;
  if (!value) return null;
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("IMAGE_CDN_URL must be a credential-free HTTPS URL");
  }
  return url;
}

const imageCdn = configuredImageCdn();
const imageCdnPath = imageCdn
  ? `${imageCdn.pathname.replace(/\/$/, "") || ""}/**`
  : undefined;

const nextConfig: NextConfig = {
  // Vercel uses the regular Next.js output. Container builds opt into standalone
  // explicitly through NEXT_STANDALONE=1.
  output: process.env.NEXT_STANDALONE === "1" ? "standalone" : undefined,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      ...(imageCdn
        ? [
            {
              protocol: "https" as const,
              hostname: imageCdn.hostname,
              port: imageCdn.port,
              pathname: imageCdnPath,
            },
          ]
        : []),
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          {
            key: "Content-Security-Policy",
            value:
              `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://images.unsplash.com${imageCdn ? ` ${imageCdn.origin}` : ""}; font-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self' blob:; upgrade-insecure-requests`,
          },
        ],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      ...["/account/:path*", "/admin/:path*", "/operations/:path*", "/checkout", "/cart"].map((source) => ({
        source,
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      })),
    ];
  },
};

export default nextConfig;
