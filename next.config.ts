import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'i.pravatar.cc',
      },
      {
        protocol: 'https',
        hostname: 'api.thefactory23.com',
      },
      {
        protocol: 'https',
        hostname: 'factory23-storage.lon1.cdn.digitaloceanspaces.com',
      },
      {
        protocol: 'https',
        hostname: 'factory23-storage.lon1.digitaloceanspaces.com',
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
      {
        // Agent APK — never let CDN/browsers keep a stale package for hours.
        source: "/downloads/:path*.apk",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
          {
            key: "Content-Type",
            value: "application/vnd.android.package-archive",
          },
          {
            key: "Content-Disposition",
            value: 'attachment; filename="factory23-agent.apk"',
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: '/dashboard/projects',
        destination: '/projects',
        permanent: false,
      },
      {
        source: '/dashboard/projects/:path*',
        destination: '/projects/:path*',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
