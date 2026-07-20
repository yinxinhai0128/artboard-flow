import { describe, expect, it } from 'vitest'
import { appendReferenceToken, filterReferenceCandidates, hasReferenceToken, insertReferenceAtMention, parseReferenceTokens, removeReferenceToken } from './composerReferences'
import type { CanvasResourceReference } from './resourceReferences'

const references: CanvasResourceReference[] = [
  { id: 'text-1', nodeId: 'text-1', kind: 'text', label: '文本1', title: '分镜脚本', text: '雪山机械鸟', active: true },
  { id: 'image-1', nodeId: 'image-1', kind: 'image', label: '图片1', title: '角色参考图', previewUrl: 'data:image/png;base64,abc', active: true },
  { id: 'video-1', nodeId: 'video-1', kind: 'video', label: '视频1', title: '运镜参考', previewUrl: 'data:video/mp4;base64,abc', active: true },
]

describe('canvas composer references', () => {
  it('parses reference tokens from composer text', () => {
    expect(parseReferenceTokens('参考 @[node:image-1] 并结合 @[node:text-1]')).toEqual([
      { type: 'text', value: '参考 ' },
      { type: 'reference', nodeId: 'image-1', token: '@[node:image-1]' },
      { type: 'text', value: ' 并结合 ' },
      { type: 'reference', nodeId: 'text-1', token: '@[node:text-1]' },
    ])
  })

  it('appends and removes reference tokens without duplicating them', () => {
    const first = appendReferenceToken('生成电影感画面', 'image-1')
    const duplicate = appendReferenceToken(first, 'image-1')

    expect(first).toBe('生成电影感画面 @[node:image-1]')
    expect(duplicate).toBe(first)
    expect(hasReferenceToken(first, 'image-1')).toBe(true)
    expect(removeReferenceToken('生成  @[node:image-1]\n\n\n保留 @[node:text-1]', 'image-1')).toBe('生成\n\n保留 @[node:text-1]')
  })

  it('filters candidates by label, title, kind, and text', () => {
    expect(filterReferenceCandidates(references, '角色').map((item) => item.nodeId)).toEqual(['image-1'])
    expect(filterReferenceCandidates(references, '文本').map((item) => item.nodeId)).toEqual(['text-1'])
    expect(filterReferenceCandidates(references, '机械鸟').map((item) => item.nodeId)).toEqual(['text-1'])
    expect(filterReferenceCandidates(references, '').map((item) => item.nodeId)).toEqual(['text-1', 'image-1', 'video-1'])
  })

  it('replaces the active @ query before the caret when inserting a reference', () => {
    const result = insertReferenceAtMention('参考 @角 做成视频', 5, 'image-1')

    expect(result.value).toBe('参考 @[node:image-1] 做成视频')
    expect(result.caret).toBe('参考 @[node:image-1] '.length)
  })
})
