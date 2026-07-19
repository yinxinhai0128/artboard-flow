export type NodeKind = 'text' | 'image' | 'video' | 'audio' | 'config'

export type CanvasGenerationMode = 'image' | 'video' | 'text'

export type CanvasGenerationPayload = {
  mode: CanvasGenerationMode
  model: string
  size: string
  count: number
  prompt: string
  summary: Record<Exclude<NodeKind, 'config'>, number>
  inputs: Array<{
    nodeId: string
    type: Exclude<NodeKind, 'config'>
    title: string
    text?: string
    media?: {
      url: string
      mimeType?: string
      bytes?: number
      width?: number
      height?: number
    }
  }>
  createdAt: string
}

export type CanvasGenerationJobStatus = 'queued' | 'running' | 'succeeded' | 'failed'

export type CanvasGenerationJobResult = {
  content: string
  mimeType?: string
  bytes?: number
  naturalWidth?: number
  naturalHeight?: number
  outputs?: CanvasGenerationJobResult[]
}

export type CanvasGenerationJob = {
  id: string
  projectId: string
  nodeId: string
  status: CanvasGenerationJobStatus
  createdAt: string
  updatedAt: string
  payload: CanvasGenerationPayload
  result: CanvasGenerationJobResult | null
  error?: string
}

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
    generationPayload?: CanvasGenerationPayload
    generationOutputs?: CanvasGenerationJobResult[]
    activeOutputIndex?: number
    splitSourceNodeId?: string
    splitOutputIndex?: number
    splitChildrenCollapsed?: boolean
    generationJobId?: string
    generationJobStatus?: CanvasGenerationJobStatus
    submittedAt?: string
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
  blockedNodeId?: string | null
}

export type Snapshot = Pick<CanvasProject, 'nodes' | 'connections' | 'backgroundMode' | 'viewport'>
