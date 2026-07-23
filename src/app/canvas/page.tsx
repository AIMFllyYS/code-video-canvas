import Link from 'next/link'

export default function CanvasPage() {
  return (
    <main className="flex h-full flex-col items-center justify-center p-8 text-center">
      <h1 className="text-2xl font-bold">画布</h1>
      <p className="mt-2 max-w-md text-sm text-gray-600">
        节点式分镜画布（React Flow）将在后续步骤通过 next/dynamic 挂载。此处为占位壳。
      </p>
      <Link href="/" className="mt-6 text-sm text-gray-600 underline">
        返回首页
      </Link>
    </main>
  )
}
