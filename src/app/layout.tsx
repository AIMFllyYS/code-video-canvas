import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'code-video-canvas',
  description: '基于自然语言的代码视频创作工作流程-节点平台',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
