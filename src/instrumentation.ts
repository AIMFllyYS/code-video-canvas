export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { initQueue } = await import('@/lib/queue/init')
  initQueue()
}
