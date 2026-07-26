import { configVideoSettingPatch } from './configVideoSettingsModel'
import type { CanvasNode } from './types'

type ConfigVideoSettingsProps = {
  node: CanvasNode
  onChange: (metadata: Partial<CanvasNode['metadata']>) => void
  onCaptureHistory: () => void
}

export function ConfigVideoSettings({ node, onChange, onCaptureHistory }: ConfigVideoSettingsProps) {
  if (node.metadata.generationMode !== 'video') return null

  return (
    <section className="config-video-settings" data-config-video-settings>
      <div className="config-inputs-header">
        <strong>视频参数</strong>
        <span>{node.metadata.seconds || '6'}s · {node.metadata.vquality || '720p'}</span>
      </div>
      <label>
        时长
        <input
          data-canvas-input
          value={node.metadata.seconds ?? '6'}
          onFocus={onCaptureHistory}
          onChange={(event) => onChange(configVideoSettingPatch('seconds', event.target.value))}
        />
      </label>
      <label>
        清晰度
        <input
          data-canvas-input
          value={node.metadata.vquality ?? '720p'}
          onFocus={onCaptureHistory}
          onChange={(event) => onChange(configVideoSettingPatch('resolution', event.target.value))}
        />
      </label>
      <label>
        生成声音
        <input
          data-canvas-input
          type="checkbox"
          checked={node.metadata.generateAudio ?? true}
          onFocus={onCaptureHistory}
          onChange={(event) => onChange(configVideoSettingPatch('generateAudio', event.currentTarget.checked))}
        />
      </label>
      <label>
        添加水印
        <input
          data-canvas-input
          type="checkbox"
          checked={node.metadata.watermark ?? false}
          onFocus={onCaptureHistory}
          onChange={(event) => onChange(configVideoSettingPatch('watermark', event.currentTarget.checked))}
        />
      </label>
    </section>
  )
}
