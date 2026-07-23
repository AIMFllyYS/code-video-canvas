import { notFound } from 'next/navigation'
import { getLatestArtifact } from '@/features/artifacts'
import { getCanvasGraph, listProjects, type CanvasGraphNode } from '@/features/canvas'
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
  const graph = getCanvasGraph(projectId)
  const node = graph.nodes.find(({ id: nodeId }) => nodeId === id)
  if (!node || node.type !== 'shot-codegen') notFound()
  const renderNodes = graph.nodes
    .filter((candidate) => candidate.type === 'shot-codegen')
    .sort((left, right) => (left.laneKey ?? '').localeCompare(right.laneKey ?? ''))
  const nodeIndex = renderNodes.findIndex((candidate) => candidate.id === id)
  const preview = getLatestArtifact(projectId, id, 'director-fabricate')
  const previewUrl = preview
    ? `/api/artifacts/${preview.id}?projectId=${encodeURIComponent(projectId)}`
    : undefined
  return (
    <ShotDetail
      projectId={projectId}
      projectTitle={listProjects().find((project) => project.id === projectId)?.title ?? '未命名项目'}
      nodeId={id}
      laneKey={node.laneKey ?? 'S000'}
      sourceText={sourceTextOf(node)}
      previousNodeId={renderNodes[nodeIndex - 1]?.id}
      nextNodeId={renderNodes[nodeIndex + 1]?.id}
      previewUrl={previewUrl}
    />
  )
}

function sourceTextOf(node: CanvasGraphNode): string {
  const sourceUnit = node.data.sourceUnit
  if (!sourceUnit || typeof sourceUnit !== 'object' || Array.isArray(sourceUnit)) {
    return '分镜内容待生成'
  }
  const text = (sourceUnit as Record<string, unknown>).text
  return typeof text === 'string' && text.trim() ? text.trim() : '分镜内容待生成'
}
