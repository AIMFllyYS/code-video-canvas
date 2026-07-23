import type { RenderResult } from './types'

/** 渲染器接口：加载 shot HTML → 逐帧 seek 截帧 → 编码 mp4。 */
export interface Renderer {
  render(job: import('./types').RenderJob): Promise<RenderResult>
}

/**
 * HyperFrames 渲染器占位。
 * 真正实现（Playwright 自带 Chromium 逐帧 seek + CDP 截帧 → ffmpeg-static）在渲染步补齐。
 */
export class HyperframesRenderer implements Renderer {
  render(): Promise<RenderResult> {
    throw new Error('NotImplemented: HyperFrames 渲染器将在渲染步接入 Playwright + ffmpeg')
  }
}
