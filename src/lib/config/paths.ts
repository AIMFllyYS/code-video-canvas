import { mkdirSync } from 'node:fs'
import path from 'node:path'

/**
 * 本地数据根目录（SQLite + 渲染产物）。
 * 可用环境变量 DATA_DIR 覆盖；默认 <cwd>/.data。
 * 说明：本模块仅在服务端 / 脚本 / 测试中使用（依赖 node:fs）。
 */
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), '.data')

/** SQLite 数据库文件路径。 */
export const DB_PATH = path.join(DATA_DIR, 'app.db')

/** 二进制产物目录（mp4 / 抽帧 / 音频 / html 等）。 */
export const ARTIFACTS_DIR = path.join(DATA_DIR, 'artifacts')

/** 确保本地数据目录存在（幂等）。 */
export function ensureDataDirs(): void {
  mkdirSync(DATA_DIR, { recursive: true })
  mkdirSync(ARTIFACTS_DIR, { recursive: true })
}
