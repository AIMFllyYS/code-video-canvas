export interface Project {
  id: string
  title: string
  script: string
  createdAt: Date
  updatedAt: Date
}

export type CanvasNodeType =
  | 'ingest'
  | 'direct'
  | 'shot-spec'
  | 'shot'
  | 'assemble'
  | 'finalize'

export interface CanvasNode {
  id: string
  projectId: string
  type: CanvasNodeType | string
  stage?: string | null
  position: { x: number; y: number }
  data: Record<string, unknown>
}

export interface CanvasEdge {
  id: string
  projectId: string
  source: string
  target: string
}
