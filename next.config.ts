
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdbtgjhbgswpdehqwjnn.supabase.co',
        pathname: '/storage/v1/object/public/artwork-images/**',
      },
      {
        protocol: 'https',
        hostname: 'covers.openlibrary.org',
        pathname: '/b/isbn/**',
      },
    ],
  },
  // 🔥 IMPORTANT → empêche génération statique
  experimental: {
    workerThreads: false,
    cpus: 1,
  },
}

module.exports = nextConfig
