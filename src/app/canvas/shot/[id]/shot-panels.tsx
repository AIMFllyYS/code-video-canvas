'use client'

import { ChevronRight, FileCode } from 'lucide-react'
import { useState, type PointerEvent, type ReactNode } from 'react'
import { IconButton } from '@/components/ui/icon-button'
import { ResizeHandle } from '@/components/ui/resize-handle'
import { useMediaQuery } from '@/lib/hooks/use-media-query'
import { usePersistentToggle } from '@/lib/hooks/use-persistent-toggle'
import { useResizablePanel } from '@/lib/hooks/use-resizable-panel'
import {
  BP_SECONDARY_PANEL_COLLAPSE,
  SHOT_CODE_DEFAULT_WIDTH,
  SHOT_CODE_MAX_WIDTH,
  SHOT_CODE_MIN_WIDTH,
  SHOT_CONTRACT_DEFAULT_WIDTH,
  SHOT_CONTRACT_MAX_WIDTH,
  SHOT_CONTRACT_MIN_WIDTH,
} from '@/lib/layout/breakpoints'

export function useShotPanelState() {
  const autoCollapse = useMediaQuery(`(max-width: ${BP_SECONDARY_PANEL_COLLAPSE - 1}px)`)
  const veryNarrow = useMediaQuery('(max-width: 999px)')
  const [manualCodeCollapsed, setManualCodeCollapsed] = usePersistentToggle(
    'cvc:shot-code-collapsed',
    false,
  )
  const [manualContractCollapsed, setManualContractCollapsed] = usePersistentToggle(
    'cvc:shot-contract-collapsed',
    false,
  )
  const [codeOverlay, setCodeOverlay] = useState(false)
  const [contractOverlay, setContractOverlay] = useState(false)

  const code = useResizablePanel({
    storageKey: 'cvc:shot-code-width',
    defaultWidth: SHOT_CODE_DEFAULT_WIDTH,
    min: SHOT_CODE_MIN_WIDTH,
    max: SHOT_CODE_MAX_WIDTH,
    invert: true,
  })
  const contract = useResizablePanel({
    storageKey: 'cvc:shot-contract-width',
    defaultWidth: SHOT_CONTRACT_DEFAULT_WIDTH,
    min: SHOT_CONTRACT_MIN_WIDTH,
    max: SHOT_CONTRACT_MAX_WIDTH,
    invert: true,
  })

  const forceCodeCollapse = autoCollapse && veryNarrow
  const forceContractCollapse = autoCollapse
  const codeCollapsed = forceCodeCollapse || manualCodeCollapsed
  const contractCollapsed = forceContractCollapse || manualContractCollapsed

  return {
    code,
    contract,
    codeCollapsed,
    contractCollapsed,
    codeOverlay: codeCollapsed && codeOverlay,
    contractOverlay: contractCollapsed && contractOverlay,
    openCode() {
      if (forceCodeCollapse) setCodeOverlay(true)
      else setManualCodeCollapsed(false)
    },
    openContract() {
      if (forceContractCollapse) setContractOverlay(true)
      else setManualContractCollapsed(false)
    },
    closeCode() {
      setCodeOverlay(false)
      if (!forceCodeCollapse) setManualCodeCollapsed(true)
    },
    closeContract() {
      setContractOverlay(false)
      if (!forceContractCollapse) setManualContractCollapsed(true)
    },
    dismissCodeOverlay: () => setCodeOverlay(false),
    dismissContractOverlay: () => setContractOverlay(false),
  }
}

export function ShotPanelChrome({
  panels,
  codeContent,
  contractContent,
  player,
}: {
  panels: ReturnType<typeof useShotPanelState>
  codeContent: ReactNode
  contractContent: ReactNode
  player: ReactNode
}) {
  const codeCol = panels.codeCollapsed ? '0px' : `${panels.code.width}px`
  const contractCol = panels.contractCollapsed ? '0px' : `${panels.contract.width}px`

  return (
    <section className="relative min-h-0 flex-1 overflow-hidden">
      <div
        className="grid h-full min-h-0 gap-0 overflow-auto p-6"
        style={{ gridTemplateColumns: `minmax(0,1fr) ${codeCol} ${contractCol}` }}
      >
        <div className="min-w-0 pr-4">{player}</div>
        {!panels.codeCollapsed && (
          <InlinePanel
            dragging={panels.code.isDragging}
            onPointerDown={panels.code.handlePointerDown}
            onKeyAdjust={(delta) => panels.code.setWidth(panels.code.width - delta)}
            onCollapse={panels.closeCode}
            ariaLabel="调节代码列宽度"
            collapseLabel="收起代码列"
          >
            {codeContent}
          </InlinePanel>
        )}
        {!panels.contractCollapsed && (
          <InlinePanel
            dragging={panels.contract.isDragging}
            onPointerDown={panels.contract.handlePointerDown}
            onKeyAdjust={(delta) => panels.contract.setWidth(panels.contract.width - delta)}
            onCollapse={panels.closeContract}
            ariaLabel="调节合同列宽度"
            collapseLabel="收起合同列"
          >
            {contractContent}
          </InlinePanel>
        )}
      </div>

      {(panels.codeCollapsed || panels.contractCollapsed) && (
        <div className="absolute right-3 top-3 z-20 flex flex-col gap-2">
          {panels.codeCollapsed && !panels.codeOverlay && (
            <IconButton
              icon={ChevronRight}
              aria-label="展开代码列"
              className="shadow-float [&>svg]:rotate-180"
              onClick={panels.openCode}
            />
          )}
          {panels.contractCollapsed && !panels.contractOverlay && (
            <IconButton
              icon={FileCode}
              aria-label="展开合同列"
              className="shadow-float"
              onClick={panels.openContract}
            />
          )}
        </div>
      )}

      {panels.codeOverlay && (
        <OverlayPanel
          width={panels.code.width}
          dragging={panels.code.isDragging}
          onPointerDown={panels.code.handlePointerDown}
          onKeyAdjust={(delta) => panels.code.setWidth(panels.code.width - delta)}
          onDismiss={panels.dismissCodeOverlay}
          ariaLabel="调节代码列宽度"
        >
          {codeContent}
        </OverlayPanel>
      )}
      {panels.contractOverlay && (
        <OverlayPanel
          width={panels.contract.width}
          dragging={panels.contract.isDragging}
          onPointerDown={panels.contract.handlePointerDown}
          onKeyAdjust={(delta) => panels.contract.setWidth(panels.contract.width - delta)}
          onDismiss={panels.dismissContractOverlay}
          ariaLabel="调节合同列宽度"
        >
          {contractContent}
        </OverlayPanel>
      )}
    </section>
  )
}

function InlinePanel({
  children,
  dragging,
  onPointerDown,
  onKeyAdjust,
  onCollapse,
  ariaLabel,
  collapseLabel,
}: {
  children: ReactNode
  dragging: boolean
  onPointerDown: (event: PointerEvent<HTMLElement>) => void
  onKeyAdjust: (delta: number) => void
  onCollapse: () => void
  ariaLabel: string
  collapseLabel: string
}) {
  return (
    <div className="relative flex min-w-0 flex-col border-l border-separator pl-4">
      <ResizeHandle
        className="absolute inset-y-0 left-0"
        isDragging={dragging}
        onPointerDown={onPointerDown}
        onKeyAdjust={onKeyAdjust}
        aria-label={ariaLabel}
      />
      <div className="mb-2 flex justify-end">
        <IconButton icon={ChevronRight} aria-label={collapseLabel} onClick={onCollapse} />
      </div>
      {children}
    </div>
  )
}

function OverlayPanel({
  width,
  children,
  dragging,
  onPointerDown,
  onKeyAdjust,
  onDismiss,
  ariaLabel,
}: {
  width: number
  children: ReactNode
  dragging: boolean
  onPointerDown: (event: PointerEvent<HTMLElement>) => void
  onKeyAdjust: (delta: number) => void
  onDismiss: () => void
  ariaLabel: string
}) {
  return (
    <>
      <button
        type="button"
        aria-label="关闭面板遮罩"
        className="fixed inset-0 z-40 bg-scrim"
        onClick={onDismiss}
      />
      <div
        className="fixed inset-y-0 right-0 z-50 flex bg-surface shadow-float"
        style={{ width }}
      >
        <ResizeHandle
          isDragging={dragging}
          onPointerDown={onPointerDown}
          onKeyAdjust={onKeyAdjust}
          aria-label={ariaLabel}
        />
        <div className="min-w-0 flex-1 overflow-auto p-4">{children}</div>
      </div>
    </>
  )
}
