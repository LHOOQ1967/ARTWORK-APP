
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
}

module.exports = nextConfig
