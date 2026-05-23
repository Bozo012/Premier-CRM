import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow writing/reading from public/uploads at runtime
  serverExternalPackages: ["@prisma/client", "prisma"],
};

export default nextConfig;
