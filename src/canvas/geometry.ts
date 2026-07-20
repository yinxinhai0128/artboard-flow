import type { CanvasConnection, CanvasNode, Point, Viewport } from './types'

export const CANVAS_MIN_SCALE = 0.05
export const CANVAS_MAX_SCALE = 5
export type ResizeCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export function clampViewportScale(scale: number) {
  return Math.min(CANVAS_MAX_SCALE, Math.max(CANVAS_MIN_SCALE, scale))
}

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
  const curve = Math.max(Math.abs(end.x - start.x) * 0.5, 50)
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

export function visibleNodesInViewport(
  nodes: CanvasNode[],
  viewport: Viewport,
  viewportSize: { width: number; height: number },
  padding = 280,
) {
  const scale = clampViewportScale(viewport.k)
  const viewLeft = -viewport.x / scale - padding
  const viewTop = -viewport.y / scale - padding
  const viewRight = viewLeft + viewportSize.width / scale + padding * 2
  const viewBottom = viewTop + viewportSize.height / scale + padding * 2

  return nodes.filter(
    (node) =>
      node.position.x + node.width > viewLeft &&
      node.position.x < viewRight &&
      node.position.y + node.height > viewTop &&
      node.position.y < viewBottom,
  )
}

export function rectsIntersect(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

export function resizeNodeFrame(
  node: CanvasNode,
  corner: ResizeCorner,
  delta: Point,
  minimum = { width: 160, height: 110 },
): Pick<CanvasNode, 'position' | 'width' | 'height'> {
  const fromLeft = corner.includes('left')
  const fromTop = corner.includes('top')
  const startRight = node.position.x + node.width
  const startBottom = node.position.y + node.height
  let width = Math.max(minimum.width, node.width + (fromLeft ? -delta.x : delta.x))
  let height = Math.max(minimum.height, node.height + (fromTop ? -delta.y : delta.y))

  if ((node.type === 'image' || node.type === 'video') && !node.metadata.freeResize) {
    const ratio = (node.metadata.naturalWidth || node.width) / (node.metadata.naturalHeight || node.height || 1)
    if (Math.abs(delta.x) >= Math.abs(delta.y)) {
      height = width / ratio
    } else {
      width = height * ratio
    }
    if (height < minimum.height) {
      height = minimum.height
      width = height * ratio
    }
    if (width < minimum.width) {
      width = minimum.width
      height = width / ratio
    }
  }

  return {
    position: {
      x: fromLeft ? startRight - width : node.position.x,
      y: fromTop ? startBottom - height : node.position.y,
    },
    width,
    height,
  }
}
