import type { ReactNode } from 'react'
import { Search } from 'lucide-react'
import { Clapperboard } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SidebarProps {
  children?: ReactNode
  className?: string
}

/**
 * 侧边栏（SSOT）。
 * canvas.pen: 宽 60（240px）、glass-sidebar 底、右侧 separator 边框、
 * backdrop-blur-[20px]、垂直布局、gap-1、p-4。
 */
export function Sidebar({ children, className }: SidebarProps) {
  return (
    <aside
      className={cn(
        'flex h-full w-60 flex-col gap-1 border-r border-separator bg-glass-sidebar p-4 backdrop-blur-[20px]',
        className,
      )}
    >
      {children}
    </aside>
  )
}

export interface SidebarBrandProps {
  className?: string
}

export function SidebarBrand({ className }: SidebarBrandProps) {
  return (
    <div className={cn('flex items-center gap-2 px-2.5 py-1', className)}>
      <Clapperboard className="h-5 w-5 text-accent" />
      <span className="text-[17px] font-semibold font-sc text-label">CodeVideoCanvas</span>
    </div>
  )
}

export interface SidebarSearchProps {
  placeholder?: string
  className?: string
}

export function SidebarSearch({ placeholder = '搜索项目', className }: SidebarSearchProps) {
  return (
    <div
      className={cn(
        'flex h-7 items-center gap-1.5 rounded-md bg-fill px-2.5 text-label-tertiary',
        className,
      )}
    >
      <Search className="h-3.5 w-3.5 shrink-0" />
      <span className="text-[13px] font-sc">{placeholder}</span>
    </div>
  )
}

export interface SidebarSectionProps {
  children: ReactNode
  className?: string
}

export function SidebarSection({ children, className }: SidebarSectionProps) {
  return (
    <div className={cn('px-2.5 py-1 text-xs font-sc text-label-tertiary', className)}>
      {children}
    </div>
  )
}

export interface SidebarNavProps {
  children: ReactNode
  className?: string
}

export function SidebarNav({ children, className }: SidebarNavProps) {
  return <nav className={cn('flex flex-1 flex-col gap-0.5', className)}>{children}</nav>
}

export interface SidebarFooterProps {
  children: ReactNode
  className?: string
}

export function SidebarFooter({ children, className }: SidebarFooterProps) {
  return <div className={cn('mt-auto', className)}>{children}</div>
}

export interface SidebarLocalStatusProps {
  label?: string
  className?: string
}

export function SidebarLocalStatus({ label = '本地模式 · 数据不出本机', className }: SidebarLocalStatusProps) {
  return (
    <div className={cn('flex items-center gap-1.5 px-2.5 py-1', className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-success" />
      <span className="text-xs font-sc text-label-tertiary">{label}</span>
    </div>
  )
}

export function SidebarDivider({ className }: { className?: string }) {
  return <div className={cn('h-px w-full bg-separator', className)} />
}
