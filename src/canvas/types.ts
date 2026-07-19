export type NodeKind = 'text' | 'image' | 'video' | 'config'

export type CanvasGenerationMode = 'image' | 'video' | 'text'

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
    errorDetails?: string
    generationMode?: CanvasGenerationMode
    composerContent?: string
    generatedAt?: string
    outputNodeId?: string
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
  schemaVersion?: number
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
  nodeId: string
  handleType: 'source' | 'target'
  to: Point
  startScreen: Point
  targetNodeId?: string | null
}

export type Snapshot = Pick<CanvasProject, 'nodes' | 'connections' | 'backgroundMode' | 'viewport'>
