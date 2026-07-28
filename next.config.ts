import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // AlloPatronNFT metadata + artwork live on IPFS behind the ipfs.io gateway.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "ipfs.io",
        pathname: "/ipfs/**",
      },
    ],
  },
};

export default nextConfig;
