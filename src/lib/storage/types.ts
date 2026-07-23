/** 二进制产物存储适配器。Demo 用本地 FS；未来可换 S3 / COS / MinIO。 */
export interface StorageAdapter {
  /** 写入内容，返回存储键（相对路径）。 */
  put(key: string, data: Buffer | Uint8Array | string): Promise<string>
  /** 读取内容。 */
  get(key: string): Promise<Buffer>
  /** 是否存在。 */
  exists(key: string): Promise<boolean>
  /** 解析为本机绝对路径（供 ffmpeg / 下载等使用）。 */
  localPath(key: string): string
  /** 删除。 */
  delete(key: string): Promise<void>
}
