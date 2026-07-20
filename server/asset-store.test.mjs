import { describe, expect, it } from 'vitest'
import { assetExtensionFromMimeType, createAssetKey, decodeDataUrlAsset, mimeTypeFromAssetKey } from './asset-store.mjs'

describe('asset store helpers', () => {
  it('decodes base64 data urls into mime typed bytes', () => {
    const asset = decodeDataUrlAsset('data:image/png;base64,aGVsbG8=')

    expect(asset.mimeType).toBe('image/png')
    expect(new TextDecoder().decode(asset.data)).toBe('hello')
    expect(asset.bytes).toBe(5)
  })

  it('creates safe asset keys from mime types', () => {
    expect(assetExtensionFromMimeType('image/svg+xml')).toBe('svg')
    expect(assetExtensionFromMimeType('video/mp4')).toBe('mp4')
    expect(createAssetKey('abc-123', 'image/webp')).toBe('abc-123.webp')
    expect(mimeTypeFromAssetKey('abc-123.webp')).toBe('image/webp')
  })
})
