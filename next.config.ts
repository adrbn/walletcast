import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for Docker (see Dockerfile).
  output: "standalone",
  // Native/wasm or fs-heavy packages: load them from node_modules at runtime.
  serverExternalPackages: ["@electric-sql/pglite", "passkit-generator", "postgres"],
  // SQL migrations are read from disk at startup.
  outputFileTracingIncludes: {
    "/**": ["./src/lib/db/migrations/**/*"],
  },
  poweredByHeader: false,
  // Dev only: let an HTTPS tunnel (needed to test Apple Wallet on a real iPhone) load dev assets.
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok.app", "*.trycloudflare.com"],
};

export default nextConfig;
