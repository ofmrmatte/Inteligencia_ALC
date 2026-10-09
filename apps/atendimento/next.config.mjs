import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../..", import.meta.url));
const config = {
  turbopack: { root },
  outputFileTracingRoot: root,
  outputFileTracingIncludes: { "/api/evidence/*": ["../../node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf"] },
  transpilePackages: ["@alc/identity", "@alc/ui"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default config;
