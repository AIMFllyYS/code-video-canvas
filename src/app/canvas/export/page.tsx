import { notFound } from 'next/navigation'
import { ExportWorkspace } from './export-workspace'

export default async function ExportPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>
}) {
  const { projectId } = await searchParams
  if (!projectId) notFound()
  return <ExportWorkspace projectId={projectId} />
}
