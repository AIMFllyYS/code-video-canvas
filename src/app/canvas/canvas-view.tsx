'use client'

import { useMemo, useState } from 'react'
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { CanvasGraphEdge, CanvasGraphNode } from '@/features/canvas'
import { toFlowEdge, toFlowNode } from './flow-elements'

export interface CanvasViewProps {
  projectId: string
  nodes: CanvasGraphNode[]
  edges: CanvasGraphEdge[]
}

export function CanvasView({ projectId, nodes, edges }: CanvasViewProps) {
  const [collapsedLanes, setCollapsedLanes] = useState<Set<string>>(() => new Set())
  const laneKeys = useMemo(
    () => [...new Set(nodes.flatMap((node) => (node.laneKey ? [node.laneKey] : [])))].sort(),
    [nodes]
  )
  const hiddenNodeIds = useMemo(
    () =>
      new Set(
        nodes
          .filter(
            (node) =>
              node.laneKey &&
              collapsedLanes.has(node.laneKey) &&
              node.type !== 'shot-script'
          )
          .map((node) => node.id)
      ),
    [collapsedLanes, nodes]
  )
  const flowNodes = useMemo(
    () => nodes.map((node) => toFlowNode(node, hiddenNodeIds, collapsedLanes)),
    [collapsedLanes, hiddenNodeIds, nodes]
  )
  const flowEdges = useMemo(
    () => edges.map((edge) => toFlowEdge(edge, hiddenNodeIds)),
    [edges, hiddenNodeIds]
  )

  function toggleLane(laneKey: string): void {
    setCollapsedLanes((current) => {
      const next = new Set(current)
      if (next.has(laneKey)) next.delete(laneKey)
      else next.add(laneKey)
      return next
    })
  }

  return (
    <main className="relative h-full w-full bg-canvas-bg" data-project-id={projectId}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        fitView
        onlyRenderVisibleElements
        minZoom={0.05}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="var(--color-canvas-grid)" gap={20} size={1} />
        <MiniMap pannable zoomable className="!bg-surface !shadow-card" />
        <Controls className="!border-separator !bg-surface !shadow-card" />
      </ReactFlow>
      <LanePanel laneKeys={laneKeys} collapsedLanes={collapsedLanes} onToggle={toggleLane} />
    </main>
  )
}

interface LanePanelProps {
  laneKeys: string[]
  collapsedLanes: Set<string>
  onToggle: (laneKey: string) => void
}

function LanePanel({ laneKeys, collapsedLanes, onToggle }: LanePanelProps) {
  return (
    <aside className="absolute left-4 top-4 max-h-[calc(100%-8rem)] w-56 overflow-auto rounded-md border border-separator bg-glass p-3 shadow-float backdrop-blur-xl">
      <p className="mb-2 text-xs font-semibold text-label">分镜通道 · {laneKeys.length}</p>
      <div className="space-y-1">
        {laneKeys.map((laneKey) => {
          const collapsed = collapsedLanes.has(laneKey)
          return (
            <button
              key={laneKey}
              type="button"
              aria-pressed={collapsed}
              onClick={() => onToggle(laneKey)}
              className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-xs text-label hover:bg-fill"
            >
              <span className="truncate">{laneKey}</span>
              <span className="text-label-secondary">{collapsed ? '展开' : '折叠'}</span>
            </button>
          )
        })}
      </div>
    </aside>
  )
}
