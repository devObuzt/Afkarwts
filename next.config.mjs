/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    middlewareClientMaxBodySize: "64mb"
  },
  serverExternalPackages: []
};

export default nextConfig;
