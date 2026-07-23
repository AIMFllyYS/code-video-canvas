import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // 全栈模式（真实 Node server），非静态导出。
  // 原生依赖不进打包；后续渲染步再补 playwright / ffmpeg-static。
  serverExternalPackages: ['better-sqlite3'],
}

export default nextConfig
