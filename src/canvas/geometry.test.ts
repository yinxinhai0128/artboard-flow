import { describe, expect, it } from 'vitest'
import { connectionEndpoints, connectionPath, screenToWorld, sourcePort, targetPort, worldToScreen } from './geometry'
import type { CanvasConnection, CanvasNode, Viewport } from './types'

const node = (id: string, x: number, y: number, width = 100, height = 80): CanvasNode => ({
  id,
  type: 'text',
  title: id,
  position: { x, y },
  width,
  height,
  metadata: {},
})

describe('canvas geometry', () => {
  it('converts between screen and world coordinates', () => {
    const viewport: Viewport = { x: 100, y: 50, k: 2 }

    expect(screenToWorld({ x: 300, y: 250 }, viewport)).toEqual({ x: 100, y: 100 })
    expect(worldToScreen({ x: 100, y: 100 }, viewport)).toEqual({ x: 300, y: 250 })
  })

  it('derives left and right node ports from node geometry', () => {
    const subject = node('a', 40, 60, 240, 160)

    expect(targetPort(subject)).toEqual({ x: 40, y: 140 })
    expect(sourcePort(subject)).toEqual({ x: 280, y: 140 })
  })

  it('returns connection endpoints only when both nodes exist', () => {
    const nodes = [node('a', 0, 0), node('b', 300, 100)]
    const connection: CanvasConnection = { id: 'edge-1', fromNodeId: 'a', toNodeId: 'b' }

    expect(connectionEndpoints(connection, nodes)).toEqual({
      start: { x: 100, y: 40 },
      end: { x: 300, y: 140 },
    })
    expect(connectionEndpoints({ ...connection, toNodeId: 'missing' }, nodes)).toBeNull()
  })

  it('creates a cubic bezier path for a connection', () => {
    expect(connectionPath({ x: 10, y: 20 }, { x: 210, y: 80 })).toBe('M 10 20 C 100 20, 120 80, 210 80')
  })
})
