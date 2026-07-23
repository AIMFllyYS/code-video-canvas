import type { ComponentType } from 'react'
import { LogoMarkDemo } from '@/components/icons/logo-mark.demo'
import { ButtonDemo } from '@/components/ui/button.demo'
import { CardDemo } from '@/components/ui/card.demo'
import { DialogDemo } from '@/components/ui/dialog.demo'
import { EmptyStateDemo } from '@/components/ui/empty-state.demo'
import { IconButtonDemo } from '@/components/ui/icon-button.demo'
import { ProgressBarDemo } from '@/components/ui/progress-bar.demo'
import { SearchFieldDemo } from '@/components/ui/search-field.demo'
import { SegmentedControlDemo } from '@/components/ui/segmented-control.demo'
import { StatusPillDemo } from '@/components/ui/status-pill.demo'
import { TextAreaDemo } from '@/components/ui/text-area.demo'
import { TextFieldDemo } from '@/components/ui/text-field.demo'
import { ToastDemo } from '@/components/ui/toast.demo'
import { ToggleDemo } from '@/components/ui/toggle.demo'
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
  { id: 'button', name: 'Button', category: 'ui', Demo: ButtonDemo },
  { id: 'card', name: 'Card', category: 'ui', Demo: CardDemo },
  { id: 'dialog', name: 'Dialog', category: 'ui', Demo: DialogDemo },
  { id: 'empty-state', name: 'EmptyState', category: 'ui', Demo: EmptyStateDemo },
  { id: 'icon-button', name: 'IconButton', category: 'ui', Demo: IconButtonDemo },
  { id: 'progress-bar', name: 'ProgressBar', category: 'ui', Demo: ProgressBarDemo },
  { id: 'search-field', name: 'SearchField', category: 'ui', Demo: SearchFieldDemo },
  { id: 'segmented-control', name: 'SegmentedControl', category: 'ui', Demo: SegmentedControlDemo },
  { id: 'status-pill', name: 'StatusPill', category: 'ui', Demo: StatusPillDemo },
  { id: 'text-area', name: 'TextArea', category: 'ui', Demo: TextAreaDemo },
  { id: 'text-field', name: 'TextField', category: 'ui', Demo: TextFieldDemo },
  { id: 'toast', name: 'Toast', category: 'ui', Demo: ToastDemo },
  { id: 'toggle', name: 'Toggle', category: 'ui', Demo: ToggleDemo },
  { id: 'tooltip', name: 'Tooltip', category: 'ui', Demo: TooltipDemo },
  { id: 'logo-mark', name: 'LogoMark', category: 'icons', Demo: LogoMarkDemo },
]

export function entriesByCategory(category: PlaybookCategory): PlaybookEntry[] {
  return PLAYBOOK_ENTRIES.filter((entry) => entry.category === category)
}
