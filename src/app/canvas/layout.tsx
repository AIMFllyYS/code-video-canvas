import type { ReactNode } from 'react'

/** 画布壳：全屏、无应用 chrome（React Flow 后续挂载于此）。 */
export default function CanvasLayout({ children }: { children: ReactNode }) {
  return <div className="h-screen w-screen overflow-hidden bg-gray-50">{children}</div>
}
