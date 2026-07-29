import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV === "development";

function configuredSupabaseUrl(): URL | null {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

const supabaseUrl = configuredSupabaseUrl();
const connectSources = new Set([
  "'self'",
  "https://*.supabase.co",
  "wss://*.supabase.co",
  "https://*.supabase.in",
  "wss://*.supabase.in",
]);

if (supabaseUrl) {
  connectSources.add(supabaseUrl.origin);
  const websocketUrl = new URL(supabaseUrl.origin);
  websocketUrl.protocol = supabaseUrl.protocol === "https:" ? "wss:" : "ws:";
  connectSources.add(websocketUrl.origin);
}

const imageSources = new Set([
  "'self'",
  "blob:",
  "data:",
  "https://*.supabase.co",
  "https://*.supabase.in",
]);
if (supabaseUrl) imageSources.add(supabaseUrl.origin);

const imageRemotePatterns: Array<{
  protocol: "http" | "https";
  hostname: string;
  port?: string;
  pathname: string;
}> = [
  { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" },
  { protocol: "https", hostname: "*.supabase.in", pathname: "/storage/v1/object/public/**" },
];

if (supabaseUrl) {
  imageRemotePatterns.push({
    protocol: supabaseUrl.protocol === "http:" ? "http" : "https",
    hostname: supabaseUrl.hostname,
    port: supabaseUrl.port || undefined,
    pathname: "/storage/v1/object/public/**",
  });
}

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src ${Array.from(imageSources).join(" ")}`,
  "font-src 'self'",
  `connect-src ${Array.from(connectSources).join(" ")}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(!isDevelopment ? ["upgrade-insecure-requests"] : []),
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    serverActions: {
      bodySizeLimit: "45mb",
    },
    proxyClientMaxBodySize: "45mb",
  },
  images: {
    remotePatterns: imageRemotePatterns,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          ...(!isDevelopment ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
        ],
      },
    ];
  },
};

export default nextConfig;
