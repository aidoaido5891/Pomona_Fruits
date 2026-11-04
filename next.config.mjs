/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // The photos are already web-sized, so they are served as they are.
  images: { unoptimized: true },
};

export default nextConfig;
