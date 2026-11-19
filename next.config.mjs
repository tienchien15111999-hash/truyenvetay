/** @type {import('next').NextConfig} */
const nextConfig = {
  // đưa phông (dùng vẽ ảnh lá số Tử Vi) vào gói của hàm /api/laso
  outputFileTracingIncludes: {
    '/api/laso': ['./lib/fonts/**/*'],
  },
};
export default nextConfig;
