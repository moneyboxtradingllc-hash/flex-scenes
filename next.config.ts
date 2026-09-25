import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  allowedDevOrigins: process.env.FLEX_SCENES_LAN_IP ? [process.env.FLEX_SCENES_LAN_IP] : [],
};

export default nextConfig;
