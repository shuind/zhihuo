/** @type {import('next').NextConfig} */
const isMobileBuild = process.env.NEXT_PUBLIC_MOBILE_BUILD === "1";

const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true
  },
  typescript: {
    ignoreBuildErrors: true
  },
  ...(isMobileBuild
    ? {
        output: "export",
        images: {
          unoptimized: true
        },
        trailingSlash: true
      }
    : {})
};

let withPwa = (config) => config;

if (process.env.NODE_ENV !== "development") {
  try {
    const { default: nextPwa } = await import("next-pwa");
    const { default: runtimeCaching } = await import("next-pwa/cache.js");
    withPwa = nextPwa({
      dest: "public",
      disable: false,
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
  } catch (error) {
    console.warn("[pwa] next-pwa not available, fallback to non-PWA build.", error?.message ?? error);
  }
}

export default withPwa(nextConfig);
