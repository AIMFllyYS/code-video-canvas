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

/** artifacts.kind：分镜静态帧缩略图（PNG）。 */
export const FRAME_THUMBNAIL_KIND = 'frame-thumbnail' as const

/** 缩略图生成的可信上下文，由 RenderRepository 从已成功渲染的 shot-codegen 节点派生。 */
export interface ThumbnailContext {
  projectId: string
  nodeId: string
  htmlKey: string
  frames: FrameSpec
}

/** 已登记缩略图 artifact 的最小指针（供缓存命中判断）。 */
export interface ThumbnailArtifactRecord {
  artifactId: string
  path: string
  contentHash: string
}

/**
 * 缩略图 PNG 的确定性存储 key（也用作 artifact.path 寻址键）。
 * 与 `thumbnail.ts`（写入）、`repository.ts`（查找）共享，放在类型模块避免二者循环依赖。
 */
export function thumbnailOutputPath(
  projectId: string,
  nodeId: string,
  sourceKey: string,
  frame: number
): string {
  return `thumbnails/${projectId}/${nodeId}/${sourceKey}/frame-${String(frame).padStart(8, '0')}.png`
}

/** 目标时间点：[0, 1] 区间的时间百分比，如 0.25。 */
export interface ThumbnailTarget {
  fraction: number
}

/** 单个缩略图的生成结果，指向已登记的 frame-thumbnail artifact。 */
export interface ThumbnailResult {
  fraction: number
  frame: number
  artifactId: string
  contentHash: string
}
