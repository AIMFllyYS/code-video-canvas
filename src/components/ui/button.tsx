import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

/**
 * Shared styling for primary actions (buttons and link-styled buttons).
 * Exported so `next/link` anchors can reuse the exact same look.
 */
export const primaryActionClassName =
  'rounded bg-gray-900 px-4 py-2 text-white hover:bg-gray-800'

export function Button({
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={cn(primaryActionClassName, className)}
      {...props}
    />
  )
}
