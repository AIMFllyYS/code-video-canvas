import Link from 'next/link'
import { PLAYBOOK_ENTRIES } from './registry'

const CATEGORIES = [
  { id: 'foundations', title: 'Foundations', desc: '设计 token：色板 / 字体 / 圆角 / 间距' },
  { id: 'ui', title: 'UI 原语', desc: 'Button / Card 等纯展示组件' },
  { id: 'icons', title: 'Icons', desc: 'SVG 图标组件' },
] as const

export default function PlaybookIndexPage() {
  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-bold">组件手册 · Playbook</h1>
      <p className="mt-2 text-sm text-gray-600">
        单一真源（SSOT）：所有基础组件在此展示，其他页面通过 import 复用。当前共{' '}
        {PLAYBOOK_ENTRIES.length} 个组件。
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {CATEGORIES.map((category) => (
          <Link
            key={category.id}
            href={`/playbook/${category.id}`}
            className="rounded-lg border border-gray-200 p-4 hover:bg-gray-50"
          >
            <div className="font-semibold">{category.title}</div>
            <div className="mt-1 text-sm text-gray-600">{category.desc}</div>
          </Link>
        ))}
      </div>
      <div className="mt-6">
        <Link href="/" className="text-sm text-gray-600 underline">
          返回首页
        </Link>
      </div>
    </main>
  )
}
