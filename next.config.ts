/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@libsql/client", "pdf-parse"],
  ...(process.env.COMMIT_REF || process.env.DEPLOY_ID
    ? { deploymentId: process.env.COMMIT_REF || process.env.DEPLOY_ID }
    : {}),
  experimental: {
    proxyClientMaxBodySize: "100mb",
    serverActions: {
      bodySizeLimit: "100mb",
    },
    staleTimes: {
      dynamic: 0,
      static: 30,
    },
  },
  async headers() {
    const noStore = [
      { key: "Cache-Control", value: "private, no-store, no-cache, must-revalidate" },
      { key: "CDN-Cache-Control", value: "no-store" },
      { key: "Netlify-CDN-Cache-Control", value: "no-store" },
    ];
    return [
      {
        source: "/((?!_next/static|_next/image|favicon.ico).*)",
        headers: noStore,
      },
    ];
  },
};

export default nextConfig;
