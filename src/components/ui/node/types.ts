export type NodeStage =
  | 'ingest'
  | 'direct'
  | 'shotspec'
  | 'shot'
  | 'audio'
  | 'assemble'
  | 'finalize'

export type NodeStatus = 'pending' | 'running' | 'success' | 'failed'
