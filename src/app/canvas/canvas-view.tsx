'use client'

import Link from 'next/link'
import { Download, Play } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Button } from '@/components/ui/button'
import { QueueStatusBar } from '@/components/ui/queue-status-bar'
import { TopBar } from '@/components/ui/top-bar'
import type { CanvasGraphEdge, CanvasGraphNode } from '@/features/canvas'
import { AppShell } from '@/features/navigation/app-shell'
import { CanvasInspector } from './canvas-inspector'
import { toFlowEdge, toFlowNode } from './flow-elements'

export interface CanvasViewProps {
  projectId: string
  projectTitle: string
  nodes: CanvasGraphNode[]
  edges: CanvasGraphEdge[]
}

export function CanvasView({ projectId, projectTitle, nodes, edges }: CanvasViewProps) {
  const router = useRouter()
  const [collapsedLanes, setCollapsedLanes] = useState<Set<string>>(() => new Set())
  const [selectedNodeId, setSelectedNodeId] = useState(nodes[0]?.id)
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
  const selectedNode = nodes.find(({ id }) => id === selectedNodeId)
  const completed = nodes.filter(({ status }) => status === 'success').length
  const rendererNodeId = nodes.find(({ type }) => type === 'shot-codegen')?.id

  useEffect(() => {
    if (!nodes.some(({ status }) => status === 'pending' || status === 'running')) return
    const timeout = window.setTimeout(() => router.refresh(), 1500)
    return () => window.clearTimeout(timeout)
  }, [nodes, router])

  function toggleLane(laneKey: string): void {
    setCollapsedLanes((current) => {
      const next = new Set(current)
      if (next.has(laneKey)) next.delete(laneKey)
      else next.add(laneKey)
      return next
    })
  }

  return (
    <AppShell
      active="canvas"
      projectId={projectId}
      rendererNodeId={rendererNodeId}
      className="bg-canvas-bg"
      contentClassName="flex"
    >
      <section className="flex min-w-0 flex-1 flex-col">
        <TopBar
          title={projectTitle}
          meta={`${nodes.length} 节点 · 已自动保存`}
          actions={
            <>
              <Button variant="gray" size="sm" icon={Play} disabled>全部渲染</Button>
              <Link href={`/canvas/export?projectId=${projectId}`}>
                <Button size="sm" icon={Download}>导出 MP4</Button>
              </Link>
            </>
          }
        />
        <div className="relative min-h-0 flex-1">
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            fitView
            onlyRenderVisibleElements
            minZoom={0.05}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
          >
            <Background color="var(--color-canvas-grid)" gap={20} size={1} />
            <MiniMap pannable zoomable className="!bg-surface !shadow-card" />
            <Controls className="!border-separator !bg-surface !shadow-card" />
          </ReactFlow>
          <LanePanel laneKeys={laneKeys} collapsedLanes={collapsedLanes} onToggle={toggleLane} />
        </div>
        <QueueStatusBar completed={completed} total={nodes.length} />
      </section>
      <CanvasInspector projectId={projectId} node={selectedNode} onQueued={() => router.refresh()} />
    </AppShell>
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
            <Button
              key={laneKey}
              variant="gray"
              size="sm"
              aria-pressed={collapsed}
              onClick={() => onToggle(laneKey)}
              className="w-full justify-between"
            >
              <span className="truncate">{laneKey}</span>
              <span className="text-label-secondary">{collapsed ? '展开' : '折叠'}</span>
            </Button>
          )
        })}
      </div>
    </aside>
  )
}
