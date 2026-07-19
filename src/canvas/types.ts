export type NodeKind = 'text' | 'image' | 'video' | 'config'

export type Point = {
  x: number
  y: number
}

export type Viewport = {
  x: number
  y: number
  k: number
}

export type BackgroundMode = 'dots' | 'lines' | 'blank'

export type CanvasNode = {
  id: string
  type: NodeKind
  title: string
  position: Point
  width: number
  height: number
  metadata: {
    content?: string
    prompt?: string
    status?: 'idle' | 'success' | 'loading' | 'error'
    model?: string
    size?: string
    count?: number
    naturalWidth?: number
    naturalHeight?: number
    mimeType?: string
    bytes?: number
  }
}

export type CanvasConnection = {
  id: string
  fromNodeId: string
  toNodeId: string
}

export type CanvasProject = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  nodes: CanvasNode[]
  connections: CanvasConnection[]
  backgroundMode: BackgroundMode
  viewport: Viewport
}

export type SelectionBox = {
  start: Point
  current: Point
  additive: boolean
  initialIds: string[]
}

export type ConnectionDraft = {
  fromNodeId: string
  to: Point
  startScreen: Point
}

export type Snapshot = Pick<CanvasProject, 'nodes' | 'connections' | 'backgroundMode' | 'viewport'>
