import { notFound } from 'next/navigation'
import { getLatestArtifact } from '@/features/artifacts'
import { getCanvasGraph } from '@/features/canvas'
import { ShotDetail } from './shot-detail'

export const dynamic = 'force-dynamic'

export default async function ShotDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ projectId?: string }>
}) {
  const [{ id }, { projectId }] = await Promise.all([params, searchParams])
  if (!projectId) notFound()
  const node = getCanvasGraph(projectId).nodes.find(({ id: nodeId }) => nodeId === id)
  if (!node || node.type !== 'shot-codegen') notFound()
  const preview = getLatestArtifact(projectId, id, 'director-fabricate')
  const previewUrl = preview
    ? `/api/artifacts/${preview.id}?projectId=${encodeURIComponent(projectId)}`
    : undefined
  return <ShotDetail projectId={projectId} nodeId={id} previewUrl={previewUrl} />
}
