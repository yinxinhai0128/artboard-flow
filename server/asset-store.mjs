const MIME_EXTENSIONS = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
  ['image/svg+xml', 'svg'],
  ['video/mp4', 'mp4'],
  ['video/webm', 'webm'],
  ['audio/mpeg', 'mp3'],
  ['audio/mp3', 'mp3'],
  ['audio/wav', 'wav'],
  ['audio/ogg', 'ogg'],
  ['text/plain', 'txt'],
])

const EXTENSION_MIME_TYPES = new Map(Array.from(MIME_EXTENSIONS, ([mimeType, extension]) => [extension, mimeType]))

export function decodeDataUrlAsset(value) {
  if (typeof value !== 'string') throw new Error('INVALID_ASSET_DATA_URL')
  const match = /^data:([^;,]+)?((?:;[^,]*)?),(.*)$/s.exec(value)
  if (!match) throw new Error('INVALID_ASSET_DATA_URL')

  const mimeType = match[1] || 'application/octet-stream'
  const metadata = match[2] || ''
  const payload = match[3] || ''
  const data = metadata.includes(';base64')
    ? Buffer.from(payload, 'base64')
    : Buffer.from(decodeURIComponent(payload))

  return { mimeType, data, bytes: data.length }
}

export function assetExtensionFromMimeType(mimeType) {
  return MIME_EXTENSIONS.get(mimeType) || 'bin'
}

export function mimeTypeFromAssetKey(key) {
  const extension = String(key).split('.').pop() || ''
  return EXTENSION_MIME_TYPES.get(extension) || 'application/octet-stream'
}

export function createAssetKey(id, mimeType) {
  return `${String(id).replace(/[^a-zA-Z0-9_-]/g, '')}.${assetExtensionFromMimeType(mimeType)}`
}

export function assetKindFromMimeType(mimeType) {
  if (typeof mimeType !== 'string') return 'file'
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (mimeType === 'text/plain') return 'text'
  return 'file'
}

export function assetRecordFromKey(key, stats) {
  const mimeType = mimeTypeFromAssetKey(key)
  const extension = String(key).split('.').pop() || 'bin'
  return {
    storageKey: key,
    url: `/api/assets/${key}`,
    mimeType,
    bytes: Number.isFinite(stats?.size) ? stats.size : 0,
    extension,
    kind: assetKindFromMimeType(mimeType),
    updatedAt: new Date(Number.isFinite(stats?.mtimeMs) ? stats.mtimeMs : Date.now()).toISOString(),
  }
}
