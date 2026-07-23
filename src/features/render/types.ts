export interface FrameSpec {
  fps: number
  durationInFrames: number
  width: number
  height: number
}

export interface RenderJob {
  projectId: string
  nodeId: string
  shotId: string
  htmlKey: string
  frames: FrameSpec
  seed?: number
}

export interface RenderResult {
  shotId: string
  /** 输出 mp4 的存储 key。 */
  outputKey: string
  contentHash: string
}
