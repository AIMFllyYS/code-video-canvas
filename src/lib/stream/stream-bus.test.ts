import { describe, expect, it, vi } from 'vitest'
import { StreamBus, type StreamEvent } from './stream-bus'

vi.mock('server-only', () => ({}))

function collect(bus: StreamBus, key: string): StreamEvent[] {
  const events: StreamEvent[] = []
  bus.subscribe(key, (event) => events.push(event))
  return events
}

describe('StreamBus', () => {
  it('订阅立即回放快照，再广播后续 delta', () => {
    const bus = new StreamBus()
    bus.publish('p:n', '你好')
    const events = collect(bus, 'p:n')

    expect(events[0]).toEqual({
      type: 'snapshot',
      text: '你好',
      done: false,
      error: undefined,
      truncated: false,
    })

    bus.publish('p:n', '世界')
    expect(events[1]).toEqual({ type: 'delta', text: '世界' })
    expect(bus.getSnapshot('p:n').text).toBe('你好世界')
  })

  it('markDone 广播 done 并令 isActive 为 false', () => {
    const bus = new StreamBus()
    const events = collect(bus, 'p:n')
    bus.publish('p:n', 'a')
    bus.markDone('p:n')

    expect(bus.isActive('p:n')).toBe(false)
    expect(events.at(-1)).toEqual({ type: 'done' })
    expect(bus.getSnapshot('p:n').done).toBe(true)
  })

  it('markError 广播结构化错误并置为已结束', () => {
    const bus = new StreamBus()
    const events = collect(bus, 'p:n')
    bus.markError('p:n', { stage: 'INGEST', message: '模型失败' })

    expect(events.at(-1)).toEqual({
      type: 'error',
      error: { stage: 'INGEST', message: '模型失败' },
    })
    expect(bus.getSnapshot('p:n').error).toEqual({ stage: 'INGEST', message: '模型失败' })
    expect(bus.isActive('p:n')).toBe(false)
  })

  it('done 后再 publish 视为新一轮并重置累积', () => {
    const bus = new StreamBus()
    bus.publish('p:n', '第一轮')
    bus.markDone('p:n')
    bus.publish('p:n', '第二轮')

    expect(bus.getSnapshot('p:n').text).toBe('第二轮')
    expect(bus.getSnapshot('p:n').done).toBe(false)
    expect(bus.isActive('p:n')).toBe(true)
  })

  it('超出缓冲上限时截断并置 truncated', () => {
    const bus = new StreamBus()
    const big = 'x'.repeat(256 * 1024 + 10)
    bus.publish('p:n', big)

    const snap = bus.getSnapshot('p:n')
    expect(snap.truncated).toBe(true)
    expect(snap.text.length).toBe(256 * 1024)
  })

  it('空 delta 被忽略，不建立缓冲', () => {
    const bus = new StreamBus()
    bus.publish('p:n', '')
    expect(bus.has('p:n')).toBe(false)
  })

  it('退订后不再收到广播', () => {
    const bus = new StreamBus()
    const events: StreamEvent[] = []
    const unsubscribe = bus.subscribe('p:n', (event) => events.push(event))
    const countAfterSnapshot = events.length
    unsubscribe()
    bus.publish('p:n', '之后')

    expect(events.length).toBe(countAfterSnapshot)
  })

  it('按键隔离，互不串流', () => {
    const bus = new StreamBus()
    const a = collect(bus, 'p:a')
    const b = collect(bus, 'p:b')
    bus.publish('p:a', '仅A')

    expect(a.some((e) => e.type === 'delta' && e.text === '仅A')).toBe(true)
    expect(b.some((e) => e.type === 'delta')).toBe(false)
  })
})
