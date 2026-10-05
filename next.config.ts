import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Codespaces-proxyen sender `origin: localhost:3000` mens `x-forwarded-host`
      // er Codespace-adressen. Godta det bare når vi kjører i en Codespace.
      allowedOrigins: process.env.CODESPACE_NAME ? ["localhost:3000"] : [],
    },
  },
};

export default nextConfig;
