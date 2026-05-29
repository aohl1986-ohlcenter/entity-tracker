import type { NextConfig } from "next";
import path from "node:path";

const config: NextConfig = {
  typedRoutes: false,
  outputFileTracingRoot: path.join(__dirname),
};

export default config;
