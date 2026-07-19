import type { CanvasConnection, CanvasNode, Point, Viewport } from './types'

export function screenToWorld(point: Point, viewport: Viewport): Point {
  return {
    x: (point.x - viewport.x) / viewport.k,
    y: (point.y - viewport.y) / viewport.k,
  }
}

export function worldToScreen(point: Point, viewport: Viewport): Point {
  return {
    x: point.x * viewport.k + viewport.x,
    y: point.y * viewport.k + viewport.y,
  }
}

export function sourcePort(node: CanvasNode): Point {
  return {
    x: node.position.x + node.width,
    y: node.position.y + node.height / 2,
  }
}

export function targetPort(node: CanvasNode): Point {
  return {
    x: node.position.x,
    y: node.position.y + node.height / 2,
  }
}

export function connectionPath(start: Point, end: Point): string {
  const distance = Math.max(80, Math.abs(end.x - start.x))
  const curve = distance * 0.45
  return `M ${start.x} ${start.y} C ${start.x + curve} ${start.y}, ${end.x - curve} ${end.y}, ${end.x} ${end.y}`
}

export function nodeMap(nodes: CanvasNode[]) {
  return new Map(nodes.map((node) => [node.id, node]))
}

export function connectionEndpoints(connection: CanvasConnection, nodes: CanvasNode[]) {
  const map = nodeMap(nodes)
  const from = map.get(connection.fromNodeId)
  const to = map.get(connection.toNodeId)
  if (!from || !to) return null
  return {
    start: sourcePort(from),
    end: targetPort(to),
  }
}

export function rectsIntersect(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}
