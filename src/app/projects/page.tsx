import Link from 'next/link'
import { Card, CardBody, CardTitle } from '@/components/ui/card'
import { listProjects } from '@/features/canvas'

export const dynamic = 'force-dynamic'

export default function ProjectsPage() {
  const projects = listProjects()
  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-bold">项目</h1>
      <p className="mt-2 text-sm text-gray-600">共 {projects.length} 个项目（本地 SQLite）。</p>

      {projects.length === 0 ? (
        <p className="mt-6 text-sm text-gray-500">
          暂无项目。可通过 <code className="rounded bg-gray-100 px-1">POST /api/projects</code> 创建。
        </p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {projects.map((project) => (
            <Card key={project.id}>
              <CardTitle>{project.title}</CardTitle>
              <CardBody>{new Date(project.updatedAt).toLocaleString('zh-CN')}</CardBody>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-6">
        <Link href="/" className="text-sm text-gray-600 underline">
          返回首页
        </Link>
      </div>
    </main>
  )
}
