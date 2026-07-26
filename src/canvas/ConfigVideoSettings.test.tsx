import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ConfigVideoSettings } from './ConfigVideoSettings'
import { configVideoSettingPatch } from './configVideoSettingsModel'
import type { CanvasNode } from './types'

const configNode = (metadata: CanvasNode['metadata'] = {}): CanvasNode => ({
  id: 'config-1',
  type: 'config',
  title: '配置节点',
  position: { x: 0, y: 0 },
  width: 300,
  height: 300,
  metadata,
})

describe('config video settings', () => {
  it('renders video controls only for video generation configs', () => {
    const videoMarkup = renderToStaticMarkup(
      <ConfigVideoSettings node={configNode({ generationMode: 'video', seconds: '8', vquality: '1080p', generateAudio: true, watermark: false })} onChange={() => undefined} onCaptureHistory={() => undefined} />,
    )
    const imageMarkup = renderToStaticMarkup(
      <ConfigVideoSettings node={configNode({ generationMode: 'image' })} onChange={() => undefined} onCaptureHistory={() => undefined} />,
    )

    expect(videoMarkup).toContain('视频参数')
    expect(videoMarkup).toContain('时长')
    expect(videoMarkup).toContain('清晰度')
    expect(videoMarkup).toContain('生成声音')
    expect(videoMarkup).toContain('添加水印')
    expect(imageMarkup).toBe('')
  })

  it('maps video setting edits to config node metadata fields', () => {
    expect(configVideoSettingPatch('seconds', '10')).toEqual({ seconds: '10' })
    expect(configVideoSettingPatch('resolution', '1080p')).toEqual({ vquality: '1080p' })
    expect(configVideoSettingPatch('generateAudio', false)).toEqual({ generateAudio: false })
    expect(configVideoSettingPatch('watermark', true)).toEqual({ watermark: true })
  })
})
