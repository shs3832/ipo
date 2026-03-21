import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  sassOptions: {
    includePaths: [path.join(process.cwd(), "src/styles")],
  },
};

export default nextConfig;
