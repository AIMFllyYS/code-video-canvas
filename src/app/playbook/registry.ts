import type { ComponentType } from 'react'
import { LogoMarkDemo } from '@/components/icons/logo-mark.demo'
import { ArtifactChipDemo } from '@/components/ui/artifact-chip.demo'
import { ButtonDemo } from '@/components/ui/button.demo'
import { CardDemo } from '@/components/ui/card.demo'
import { DialogDemo } from '@/components/ui/dialog.demo'
import { EmptyStateDemo } from '@/components/ui/empty-state.demo'
import { IconButtonDemo } from '@/components/ui/icon-button.demo'
import { NavItemDemo } from '@/components/ui/nav-item.demo'
import { SidebarDemo } from '@/components/ui/sidebar.demo'
import { TopBarDemo } from '@/components/ui/top-bar.demo'
import { ProgressBarDemo } from '@/components/ui/progress-bar.demo'
import { ContactSheetThumbDemo } from '@/components/ui/contact-sheet-thumb.demo'
import { ProjectCardDemo } from '@/components/ui/project-card.demo'
import { QueueStatusBarDemo } from '@/components/ui/queue-status-bar.demo'
import { SearchFieldDemo } from '@/components/ui/search-field.demo'
import { SegmentedControlDemo } from '@/components/ui/segmented-control.demo'
import { SettingsGroupDemo } from '@/components/ui/settings-group.demo'
import { SettingsRowDemo } from '@/components/ui/settings-row.demo'
import { TimelineTrackDemo } from '@/components/ui/timeline-track.demo'
import { StatusPillDemo } from '@/components/ui/status-pill.demo'
import { TextAreaDemo } from '@/components/ui/text-area.demo'
import { TextFieldDemo } from '@/components/ui/text-field.demo'
import { ToastDemo } from '@/components/ui/toast.demo'
import { ToggleDemo } from '@/components/ui/toggle.demo'
import { AudioNodeDemo } from '@/components/ui/node/audio-node.demo'
import { ExportNodeDemo } from '@/components/ui/node/export-node.demo'
import { StageNodeDemo } from '@/components/ui/node/stage-node.demo'
import { ShotNodeDemo } from '@/components/ui/node/shot-node.demo'
import { TooltipDemo } from '@/components/ui/tooltip.demo'

export type PlaybookCategory = 'ui' | 'icons'

export interface PlaybookEntry {
  id: string
  name: string
  category: PlaybookCategory
  Demo: ComponentType
}

/**
 * 组件手册登记表：新增组件只需加一条（并新建对应 *.demo.tsx）。
 * 这是「活文档」的单一来源，页面据此聚合渲染。
 */
export const PLAYBOOK_ENTRIES: PlaybookEntry[] = [
  { id: 'artifact-chip', name: 'ArtifactChip', category: 'ui', Demo: ArtifactChipDemo },
  { id: 'audio-node', name: 'AudioNode', category: 'ui', Demo: AudioNodeDemo },
  { id: 'button', name: 'Button', category: 'ui', Demo: ButtonDemo },
  { id: 'card', name: 'Card', category: 'ui', Demo: CardDemo },
  { id: 'contact-sheet-thumb', name: 'ContactSheetThumb', category: 'ui', Demo: ContactSheetThumbDemo },
  { id: 'export-node', name: 'ExportNode', category: 'ui', Demo: ExportNodeDemo },
  { id: 'dialog', name: 'Dialog', category: 'ui', Demo: DialogDemo },
  { id: 'empty-state', name: 'EmptyState', category: 'ui', Demo: EmptyStateDemo },
  { id: 'icon-button', name: 'IconButton', category: 'ui', Demo: IconButtonDemo },
  { id: 'nav-item', name: 'NavItem', category: 'ui', Demo: NavItemDemo },
  { id: 'sidebar', name: 'Sidebar', category: 'ui', Demo: SidebarDemo },
  { id: 'top-bar', name: 'TopBar', category: 'ui', Demo: TopBarDemo },
  { id: 'progress-bar', name: 'ProgressBar', category: 'ui', Demo: ProgressBarDemo },
  { id: 'project-card', name: 'ProjectCard', category: 'ui', Demo: ProjectCardDemo },
  { id: 'queue-status-bar', name: 'QueueStatusBar', category: 'ui', Demo: QueueStatusBarDemo },
  { id: 'search-field', name: 'SearchField', category: 'ui', Demo: SearchFieldDemo },
  { id: 'segmented-control', name: 'SegmentedControl', category: 'ui', Demo: SegmentedControlDemo },
  { id: 'settings-group', name: 'SettingsGroup', category: 'ui', Demo: SettingsGroupDemo },
  { id: 'settings-row', name: 'SettingsRow', category: 'ui', Demo: SettingsRowDemo },
  { id: 'shot-node', name: 'ShotNode', category: 'ui', Demo: ShotNodeDemo },
  { id: 'stage-node', name: 'StageNode', category: 'ui', Demo: StageNodeDemo },
  { id: 'status-pill', name: 'StatusPill', category: 'ui', Demo: StatusPillDemo },
  { id: 'text-area', name: 'TextArea', category: 'ui', Demo: TextAreaDemo },
  { id: 'text-field', name: 'TextField', category: 'ui', Demo: TextFieldDemo },
  { id: 'timeline-track', name: 'TimelineTrack', category: 'ui', Demo: TimelineTrackDemo },
  { id: 'toast', name: 'Toast', category: 'ui', Demo: ToastDemo },
  { id: 'toggle', name: 'Toggle', category: 'ui', Demo: ToggleDemo },
  { id: 'tooltip', name: 'Tooltip', category: 'ui', Demo: TooltipDemo },
  { id: 'logo-mark', name: 'LogoMark', category: 'icons', Demo: LogoMarkDemo },
]

export function entriesByCategory(category: PlaybookCategory): PlaybookEntry[] {
  return PLAYBOOK_ENTRIES.filter((entry) => entry.category === category)
}
