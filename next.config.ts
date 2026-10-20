import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // The HEIC converter loads its own WebAssembly, so it runs from node_modules rather than the bundle.
  serverExternalPackages: ["heic-decode", "libheif-js"],
};

export default nextConfig;
