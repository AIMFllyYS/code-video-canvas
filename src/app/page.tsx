import Link from 'next/link'
import { LogoMark } from '@/components/icons/logo-mark'
import { PIPELINE } from '@/features/director'

const LINKS = [
  { href: '/canvas', title: '画布', desc: '节点式分镜画布' },
  { href: '/projects', title: '项目', desc: '本地项目列表' },
  { href: '/settings', title: '设置', desc: 'StepFun Key' },
  { href: '/playbook', title: '组件手册', desc: 'UI 组件 SSOT' },
]

export default function HomePage() {
  return (
    <main className="mx-auto max-w-4xl p-8">
      <div className="flex items-center gap-3">
        <LogoMark className="h-8 w-8" />
        <h1 className="text-3xl font-bold">code-video-canvas</h1>
      </div>
      <p className="mt-3 text-gray-600">基于自然语言的节点式 AIGC 短剧视频创作引擎 · 本地优先</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-lg border border-gray-200 p-4 hover:bg-gray-50"
          >
            <div className="font-semibold">{link.title}</div>
            <div className="mt-1 text-sm text-gray-600">{link.desc}</div>
          </Link>
        ))}
      </div>

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-gray-500">Pipeline</h2>
      <ol className="mt-3 flex flex-wrap gap-2 text-sm">
        {PIPELINE.map((stage) => (
          <li
            key={stage.id}
            className="rounded-full border border-gray-200 px-3 py-1"
            title={stage.description}
          >
            {stage.title}
          </li>
        ))}
      </ol>
    </main>
  )
}
