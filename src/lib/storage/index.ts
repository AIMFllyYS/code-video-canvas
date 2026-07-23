import 'server-only'
import { ARTIFACTS_DIR, ensureDataDirs } from '@/lib/config/paths'
import { LocalFsStorage } from './local-fs'

ensureDataDirs()

/** 进程内存储单例（本地 FS，根为 DATA_DIR/artifacts）。 */
export const storage = new LocalFsStorage(ARTIFACTS_DIR)

export { LocalFsStorage } from './local-fs'
export type { StorageAdapter } from './types'
