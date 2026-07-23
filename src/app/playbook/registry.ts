import type { ComponentType } from 'react'
import { LogoMarkDemo } from '@/components/icons/logo-mark.demo'
import { ButtonDemo } from '@/components/ui/button.demo'
import { CardDemo } from '@/components/ui/card.demo'

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
  { id: 'logo-mark', name: 'LogoMark', category: 'icons', Demo: LogoMarkDemo },
]

export function entriesByCategory(category: PlaybookCategory): PlaybookEntry[] {
  return PLAYBOOK_ENTRIES.filter((entry) => entry.category === category)
}
