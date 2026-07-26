import type { CanvasNode } from './types'

export type ConfigVideoSettingKey = 'seconds' | 'resolution' | 'generateAudio' | 'watermark'
export type ConfigVideoSettingValue = string | boolean

export function configVideoSettingPatch(key: ConfigVideoSettingKey, value: ConfigVideoSettingValue): Partial<CanvasNode['metadata']> {
  if (key === 'seconds') return { seconds: String(value).trim() }
  if (key === 'resolution') return { vquality: String(value).trim() }
  if (key === 'generateAudio') return { generateAudio: value === true }
  return { watermark: value === true }
}
