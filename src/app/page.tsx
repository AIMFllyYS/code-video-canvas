import Link from 'next/link'
import {
  Clapperboard,
  CirclePlus,
  Film,
  Folder,
  LayoutDashboard,
  Plus,
  Settings,
  Waypoints,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { NavItem } from '@/components/ui/nav-item'
import { ProjectCard } from '@/components/ui/project-card'
import { SearchField } from '@/components/ui/search-field'
import { listProjects } from '@/features/canvas'

const NAV_ITEMS = [
  { href: '/', label: '工作台', icon: LayoutDashboard, active: true },
  { href: '/projects', label: '项目', icon: Folder },
  { href: '/canvas', label: '画布', icon: Waypoints },
  { href: '/settings', label: '设置', icon: Settings },
] as const

export const dynamic = 'force-dynamic'

export default function HomePage() {
  const projects = listProjects()

  return (
    <main className="min-h-screen bg-bg text-label">
      <header className="flex h-16 items-center justify-between border-b border-separator bg-surface px-8">
        <Link href="/" className="flex items-center gap-2">
          <Clapperboard className="h-5 w-5 text-accent" />
          <span className="text-[17px] font-semibold">CodeVideoCanvas</span>
        </Link>
        <nav className="flex items-center gap-1" aria-label="主导航">
          {NAV_ITEMS.map((item) => (
            <NavItem key={item.href} {...item}>
              {item.label}
            </NavItem>
          ))}
        </nav>
      </header>

      <section className="flex flex-col items-center gap-4 px-20 py-16 text-center">
        <h1 className="text-[34px] font-bold leading-tight">把一段稿子，变成一支专业视频</h1>
        <p className="text-[15px] text-label-secondary">
          语义分镜 · 节点画布 · 逐镜代码视频 · 本机一键导出
        </p>
        <Button icon={Plus}>新建项目</Button>
      </section>

      <section className="px-20">
        <Button
          variant="gray"
          className="h-35 w-full flex-col gap-2 rounded-lg border border-separator bg-surface"
        >
          <CirclePlus className="h-7 w-7 text-accent" />
          <span className="text-[17px] text-label-secondary">粘贴一段文字稿，开始创作</span>
          <span className="text-xs font-normal text-label-tertiary">
            支持导入 .txt / .md，可选上传配音作为时间地基
          </span>
        </Button>
      </section>

      <section className="px-20 py-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[22px] font-semibold">我的项目</h2>
          <SearchField aria-label="搜索项目" placeholder="搜索项目" />
        </div>
        {projects.length > 0 ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
            {projects.map((project) => (
              <Link key={project.id} href={`/canvas?projectId=${project.id}`} className="w-fit">
                <ProjectCard title={project.title} meta="待生成" status="pending" />
              </Link>
            ))}
          </div>
        ) : (
          <div className="flex justify-center py-10">
            <EmptyState
              icon={Film}
              title="还没有项目"
              description="粘贴一段文字稿，开始创作"
              action={<Button icon={Plus}>新建项目</Button>}
            />
          </div>
        )}
      </section>

      {projects.length > 0 && (
        <section className="px-20 pb-12">
          <h2 className="mb-3 text-[13px] font-semibold text-label-secondary">最近渲染</h2>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {projects.slice(0, 4).map((project) => (
              <Link key={project.id} href={`/canvas?projectId=${project.id}`} className="shrink-0">
                <ProjectCard
                  title={project.title}
                  meta="待生成"
                  status="pending"
                  className="w-50"
                />
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}
