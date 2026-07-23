import Link from 'next/link'
import { entriesByCategory } from '../registry'

export default function PlaybookUiPage() {
  const entries = entriesByCategory('ui')
  return (
    <main className="mx-auto max-w-4xl p-8">
      <Link href="/playbook" className="text-sm text-gray-600 underline">
        ← 组件手册
      </Link>
      <h1 className="mt-3 text-2xl font-bold">UI 原语</h1>
      <div className="mt-6 space-y-8">
        {entries.map(({ id, name, Demo }) => (
          <section key={id}>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
              {name}
            </h2>
            <div className="rounded-lg border border-gray-200 p-6">
              <Demo />
            </div>
          </section>
        ))}
      </div>
    </main>
  )
}
