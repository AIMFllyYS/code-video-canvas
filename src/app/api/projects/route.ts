import { NextResponse } from 'next/server'
import { createProject, listProjects } from '@/features/canvas'

export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json({ projects: listProjects() })
}

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null)
  try {
    const project = createProject(body)
    return NextResponse.json({ ok: true, project }, { status: 201 })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : '创建失败' },
      { status: 400 },
    )
  }
}
