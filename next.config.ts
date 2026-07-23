import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // 全栈模式（真实 Node server），非静态导出。
  // 原生依赖与平台二进制路径必须在运行时由 Node 解析，不能被 Turbopack
  // 重写成 /ROOT 占位路径。
  serverExternalPackages: ['better-sqlite3', 'ffmpeg-static'],
}

export default nextConfig
