export interface FrameSpec {
  fps: number
  durationInFrames: number
  width: number
  height: number
}

export interface RenderJob {
  shotId: string
  html: string
  frames: FrameSpec
  seed?: number
}

export interface RenderResult {
  shotId: string
  /** 输出 mp4 的存储 key。 */
  outputKey: string
  contentHash: string
}
