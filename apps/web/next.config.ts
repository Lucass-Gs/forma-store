import type { NextConfig } from "next";
const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: require("node:path").resolve(__dirname, "../.."),
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination:
          (process.env.API_UPSTREAM || "http://api:3000") + "/api/:path*",
      },
    ];
  },
};
export default config;
