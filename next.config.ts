import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Workspace evidence is read at runtime and is not in public/, so it must be traced into the build.
  outputFileTracingIncludes: {
    '/api/challenges/[number]/workspace/files/[file]': ['./src/lib/workspace/files/**/*'],
  },
};

export default nextConfig;
