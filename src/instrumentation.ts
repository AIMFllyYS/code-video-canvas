export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const [{ queue }, { registerDirectorStageHandler }, { registerRenderShotHandler }] =
    await Promise.all([
      import('@/lib/queue'),
      import('@/features/director/queue-handler'),
      import('@/features/render/queue-handler'),
    ])
  registerDirectorStageHandler(queue)
  registerRenderShotHandler(queue)
  queue.start()
}
