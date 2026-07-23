export type ClassValue =
  | string
  | number
  | null
  | false
  | undefined
  | ClassValue[]

/**
 * Merge conditional class names into a single space-separated string.
 * Falsy values are ignored and nested arrays are flattened.
 */
export function cn(...inputs: ClassValue[]): string {
  const classes: string[] = []

  for (const input of inputs) {
    if (!input) continue

    if (Array.isArray(input)) {
      const nested = cn(...input)
      if (nested) classes.push(nested)
    } else {
      classes.push(String(input))
    }
  }

  return classes.join(' ')
}
