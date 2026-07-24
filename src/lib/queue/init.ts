import 'server-only'
import { queue } from './index'

let initialized = false
let initializing: Promise<void> | null = null

/** 幂等地注册队列处理器并启动进程内队列。
 *
 * 在 dev 模式下 Next.js instrumentation 有时不会自动触发，
 * 因此 API 路由在首次请求时兜底调用本函数。
 */
export async function initQueue(): Promise<void> {
  if (initialized) return
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    initialized = true
    return
  }
  if (initializing) return initializing
  initializing = (async () => {
    const [directorMod, renderMod] = await Promise.all([
      import('@/features/director/queue-handler'),
      import('@/features/render/queue-handler'),
    ])
    if (typeof directorMod.registerDirectorStageHandler === 'function') {
      directorMod.registerDirectorStageHandler(queue)
    }
    if (typeof renderMod.registerRenderShotHandler === 'function') {
      renderMod.registerRenderShotHandler(queue)
    }
    queue.start()
    initialized = true
  })()
  return initializing
}
