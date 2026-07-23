export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { startDirectorQueue } = await import('@/features/director/queue-handler')
  startDirectorQueue()
}
