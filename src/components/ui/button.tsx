import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/**
 * 设计系统 4 变体（见 design-system-inventory §4 B1）：
 * - primary: 主 CTA（accent 底 + on-accent 字）
 * - tinted: 次主操作（accent-fill 底 + accent 字）
 * - gray: 取消 / 次级（fill 底 + label 字）
 * - destructive: 破坏性（danger 底 + on-accent 字）
 */
type Variant = 'primary' | 'tinted' | 'gray' | 'destructive'
type Size = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent hover:opacity-90',
  tinted: 'bg-accent-fill text-accent hover:opacity-80',
  gray: 'bg-fill text-label hover:bg-fill-strong',
  destructive: 'bg-danger text-on-accent hover:opacity-90',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] rounded-md',
  md: 'h-10 px-4 text-[15px] rounded-md',
  lg: 'h-12 px-6 text-[17px] rounded-lg',
}

/**
 * 基础按钮原语（SSOT：全应用统一从此处 import）。
 * 属应用 UI —— 允许 hover / transition 等交互动效（不受视频确定性红线约束）。
 */
export function Button({ variant = 'primary', size = 'md', className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  )
}
