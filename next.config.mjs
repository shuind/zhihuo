import nextPwa from "next-pwa";
import runtimeCaching from "next-pwa/cache.js";

const withPwa = nextPwa({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  runtimeCaching: [
    {
      urlPattern: /^https?:\/\/.*\/v1\/.*/i,
      handler: "NetworkOnly",
      method: "GET",
      options: {
        cacheName: "api-network-only"
      }
    },
    ...runtimeCaching
  ]
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true
};

export default withPwa(nextConfig);
