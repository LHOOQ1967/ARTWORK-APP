
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdbtgjhbgswpdehqwjnn.supabase.co',
        pathname: '/storage/v1/object/public/artwork-images/**',
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
