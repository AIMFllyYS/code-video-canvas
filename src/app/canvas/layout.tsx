import type { ReactNode } from 'react'

/** 画布壳：全屏、无应用 chrome。 */
export default function CanvasLayout({ children }: { children: ReactNode }) {
  return <div className="h-screen w-screen overflow-hidden bg-canvas-bg">{children}</div>
}
