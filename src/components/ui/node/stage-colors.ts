import type { NodeStage } from './types'

export function stageColorToken(stage: NodeStage): string {
  const map: Record<NodeStage, string> = {
    ingest: 'text-stage-ingest border-stage-ingest',
    direct: 'text-stage-direct border-stage-direct',
    shotspec: 'text-stage-shotspec border-stage-shotspec',
    shot: 'text-stage-shot border-stage-shot',
    audio: 'text-stage-audio border-stage-audio',
    assemble: 'text-stage-assemble border-stage-assemble',
    finalize: 'text-stage-finalize border-stage-finalize',
  }
  return map[stage]
}

export function stageFillClass(stage: NodeStage): string {
  const map: Record<NodeStage, string> = {
    ingest: 'bg-stage-ingest',
    direct: 'bg-stage-direct',
    shotspec: 'bg-stage-shotspec',
    shot: 'bg-stage-shot',
    audio: 'bg-stage-audio',
    assemble: 'bg-stage-assemble',
    finalize: 'bg-stage-finalize',
  }
  return map[stage]
}
