import { createHash } from 'node:crypto'

export const UUID_NAMESPACE_DNS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
export const UUID_NAMESPACE_URL = '6ba7b811-9dad-11d1-80b4-00c04fd430c8'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** RFC 4122 UUIDv5 without a runtime UUID dependency. */
export function uuidV5(name: string, namespaceUuid: string): string {
  if (!name) throw new Error('UUIDv5 name is required')
  if (!UUID_PATTERN.test(namespaceUuid)) {
    throw new Error('UUIDv5 namespace must be a canonical UUID')
  }
  const digest = createHash('sha1')
    .update(uuidToBytes(namespaceUuid))
    .update(Buffer.from(name, 'utf8'))
    .digest()
    .subarray(0, 16)
  digest[6] = (digest[6]! & 0x0f) | 0x50
  digest[8] = (digest[8]! & 0x3f) | 0x80
  return bytesToUuid(digest)
}

/** All legacy public IDs are namespaced by an explicit stable migration scope. */
export function legacyIdToUuid(scope: string, legacyId: string): string {
  if (!scope) throw new Error('legacy UUID scope is required')
  if (!legacyId) throw new Error('legacyId is required')
  return uuidV5(`cvc:v3:${scope}:${legacyId}`, UUID_NAMESPACE_URL)
}

function uuidToBytes(uuid: string): Buffer {
  return Buffer.from(uuid.replaceAll('-', ''), 'hex')
}

function bytesToUuid(bytes: Uint8Array): string {
  const hex = Buffer.from(bytes).toString('hex')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-')
}
