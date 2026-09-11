/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@libsql/client", "pdf-parse"],
  experimental: {
    proxyClientMaxBodySize: "100mb",
    serverActions: {
      bodySizeLimit: "100mb",
    },
  },
  async headers() {
    const noStore = [
      { key: "Cache-Control", value: "private, no-store, no-cache, must-revalidate" },
      { key: "CDN-Cache-Control", value: "no-store" },
      { key: "Netlify-CDN-Cache-Control", value: "no-store" },
    ];
    return [
      { source: "/login", headers: noStore },
      { source: "/signup", headers: noStore },
    ];
  },
};

export default nextConfig;
