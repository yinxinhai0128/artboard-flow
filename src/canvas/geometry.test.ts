import { describe, expect, it } from 'vitest'
import { CANVAS_MAX_SCALE, CANVAS_MIN_SCALE, clampViewportScale, connectionEndpoints, connectionPath, screenToWorld, sourcePort, targetPort, visibleNodesInViewport, worldToScreen } from './geometry'
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

  it('clamps viewport scale to the canvas zoom range', () => {
    expect(CANVAS_MIN_SCALE).toBe(0.05)
    expect(CANVAS_MAX_SCALE).toBe(5)
    expect(clampViewportScale(0.01)).toBe(CANVAS_MIN_SCALE)
    expect(clampViewportScale(2.5)).toBe(2.5)
    expect(clampViewportScale(8)).toBe(CANVAS_MAX_SCALE)
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

  it('filters nodes to the padded viewport bounds', () => {
    const nodes = [
      node('visible', 50, 50),
      node('padded', 360, 50),
      node('outside', 700, 50),
      node('left-edge', -80, 50),
    ]

    expect(visibleNodesInViewport(nodes, { x: 0, y: 0, k: 1 }, { width: 320, height: 240 }, 100).map((item) => item.id)).toEqual([
      'visible',
      'padded',
      'left-edge',
    ])
  })

  it('creates a cubic bezier path for a connection', () => {
    expect(connectionPath({ x: 10, y: 20 }, { x: 210, y: 80 })).toBe('M 10 20 C 110 20, 110 80, 210 80')
    expect(connectionPath({ x: 10, y: 20 }, { x: 50, y: 80 })).toBe('M 10 20 C 60 20, 0 80, 50 80')
  })
})
