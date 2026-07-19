import { describe, expect, it } from 'vitest'
import { normalizeGenerationJobPayload, normalizeGenerationJobResult, normalizeGenerationJobStatus, parseGenerationJob } from './generation-adapter.mjs'

describe('generation adapter normalization', () => {
  it('normalizes payloads for adapter job submission', () => {
    const payload = normalizeGenerationJobPayload({
      mode: 'video',
      model: ' seedance ',
      size: '1280x720',
      count: 99,
      prompt: 'make it cinematic',
      inputs: [
        { nodeId: 'text-1', type: 'text', title: 'Prompt', text: 'story' },
        { nodeId: 'image-1', type: 'image', title: 'Reference', media: { url: 'data:image/png;base64,abc', mimeType: 'image/png', width: 12, height: 8 } },
        { nodeId: 'audio-1', type: 'audio', title: 'Voice', media: { url: 'data:audio/mpeg;base64,abc', mimeType: 'audio/mpeg' } },
      ],
    })

    expect(payload).toMatchObject({
      mode: 'video',
      model: 'seedance',
      size: '1280x720',
      count: 15,
      prompt: 'make it cinematic',
      summary: { text: 1, image: 1, video: 0, audio: 1 },
    })
    expect(payload.inputs).toHaveLength(3)
  })

  it('normalizes job statuses and external results', () => {
    expect(normalizeGenerationJobStatus('running')).toBe('running')
    expect(normalizeGenerationJobStatus('unknown')).toBe('queued')
    expect(normalizeGenerationJobResult({ url: 'https://cdn/result.png', mimeType: 'image/png', width: 640, height: 480 })).toEqual({
      content: 'https://cdn/result.png',
      mimeType: 'image/png',
      bytes: undefined,
      naturalWidth: 640,
      naturalHeight: 480,
    })
  })

  it('parses persisted rows into API jobs', () => {
    const job = parseGenerationJob({
      id: 'job-1',
      project_id: 'project-1',
      node_id: 'node-1',
      status: 'queued',
      created_at: '2026-07-19T00:00:00.000Z',
      updated_at: '2026-07-19T00:00:00.000Z',
      payload_json: '{"prompt":"hello"}',
      result_json: null,
      error: null,
    })

    expect(job).toMatchObject({
      id: 'job-1',
      projectId: 'project-1',
      nodeId: 'node-1',
      status: 'queued',
      payload: { prompt: 'hello' },
      result: null,
    })
  })
})
