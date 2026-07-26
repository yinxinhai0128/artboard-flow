import { describe, expect, it } from 'vitest'
import { canPersistConnection } from './project-rules.mjs'

describe('server project persistence rules', () => {
  it('allows config nodes to persist ordinary output connections while blocking config-config and groups', () => {
    const config = { id: 'config', type: 'config', metadata: {} }
    const configTarget = { id: 'config-target', type: 'config', metadata: {} }
    const group = { id: 'group', type: 'group', metadata: {} }
    const image = { id: 'image', type: 'image', metadata: {} }
    const task = {
      id: 'task',
      type: 'image',
      metadata: {
        generationPayload: {
          mode: 'image',
          model: 'image-model',
          size: '1024x1024',
          count: 1,
          prompt: 'robot bird',
          summary: { text: 0, image: 0, video: 0, audio: 0 },
          inputs: [],
          createdAt: '2026-07-19T00:00:00.000Z',
        },
      },
    }

    expect(canPersistConnection(config, image)).toBe(true)
    expect(canPersistConnection(config, task)).toBe(true)
    expect(canPersistConnection(config, configTarget)).toBe(false)
    expect(canPersistConnection(group, image)).toBe(false)
    expect(canPersistConnection(image, group)).toBe(false)
    expect(canPersistConnection(image, config)).toBe(true)
  })
})
