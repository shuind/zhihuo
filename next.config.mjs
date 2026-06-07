/** @type {import('next').NextConfig} */
const isMobileBuild = process.env.NEXT_PUBLIC_MOBILE_BUILD === "1";

const nextConfig = {
  reactStrictMode: true,
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

export default nextConfig;
