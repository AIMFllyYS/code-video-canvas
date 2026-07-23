import { getCanvasGraph } from '@/features/canvas'
import { SettingsForm } from './settings-form'

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>
}) {
  const { projectId } = await searchParams
  const rendererNodeId = projectId
    ? getCanvasGraph(projectId).nodes.find((node) => node.type === 'shot-codegen')?.id
    : undefined
  return <SettingsForm projectId={projectId} rendererNodeId={rendererNodeId} />
}
