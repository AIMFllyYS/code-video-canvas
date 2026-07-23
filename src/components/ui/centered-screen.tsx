import type { ComponentPropsWithoutRef, ElementType } from 'react'
import { cn } from '@/lib/cn'

type CenteredScreenOwnProps = {
  as?: ElementType
  /** Stack children vertically (default) or lay them out in a row. */
  column?: boolean
  /** Apply the default `p-8` padding (default true). */
  padded?: boolean
}

type CenteredScreenProps<T extends ElementType> = CenteredScreenOwnProps &
  Omit<ComponentPropsWithoutRef<T>, keyof CenteredScreenOwnProps>

/**
 * Full-height flex container that centers its children on both axes.
 * Shared by the home page and the error/404/loading screens.
 */
export function CenteredScreen<T extends ElementType = 'div'>({
  as,
  column = true,
  padded = true,
  className,
  ...props
}: CenteredScreenProps<T>) {
  const Component = (as ?? 'div') as ElementType
  return (
    <Component
      className={cn(
        'flex min-h-screen items-center justify-center',
        column && 'flex-col',
        padded && 'p-8',
        className,
      )}
      {...props}
    />
  )
}
