import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Compass, Copy, Download, Eye, FileJson, Group, HelpCircle, Image, Info, Link2, Lock, LockOpen, Minus, MousePointer2, Music2, Play, Plus, Redo2, RotateCcw, Settings2, SquarePen, Trash2, Type, Undo2, Upload, Video } from 'lucide-react'
import { CANVAS_MAX_SCALE, CANVAS_MIN_SCALE, clampViewportScale, connectionEndpoints, connectionPath, resizeNodeFrame, screenToWorld, sourcePort, targetPort, visibleNodesInViewport, worldToScreen, type ResizeCorner } from './geometry'
import type { CanvasGenerationJobResult, CanvasNode, CanvasProject, ConnectionDraft, NodeKind, Point, SelectionBox } from './types'
import { useCanvasController } from './useCanvasController'
import { applyGenerationJobToProject, buildCanvasGenerationContext, buildCanvasGenerationPayload, metadataFromGenerationJob, serializeCanvasGenerationPayload, type CanvasGenerationContext } from './generation'
import { canvasApi } from './api'
import { appendReferenceToken, filterReferenceCandidates, hasReferenceToken, insertReferenceAtMention, mentionQueryBeforeCaret, removeReferenceToken } from './composerReferences'
import { expandNodeIdsForMovement, findConnectionDropTarget, findGroupDropTarget, getConnectionNodePair, getNodeRelations, isHiddenSplitChild, isSplitConnectionHidden, nextNodeSelection, parseCanvasClipboardText, resolveConnectionToNode, serializeCanvasClipboard, type CanvasClipboard, type ConnectionNodePair, type NodeRelations } from './document'
import { downloadCanvasClipboard, readCanvasClipboardFile } from './export'
import { relationCountsForProject } from './graph'
import { promoteSplitOutputInProject, splitGenerationOutputsInProject } from './outputSplit'
import { buildNodeMentionReferences, type CanvasResourceReference } from './resourceReferences'

type CanvasWorkspaceProps = {
  project: CanvasProject
  onProjectChange: (project: CanvasProject) => void
  onBack: () => void
  onExport: (project: CanvasProject) => void
}

type DragState =
  | { type: 'pan'; start: Point; viewportStart: Point; historyCaptured: boolean }
  | { type: 'node'; start: Point; nodeIds: string[]; historyCaptured: boolean }
  | { type: 'resize'; start: Point; node: CanvasNode; corner: ResizeCorner; historyCaptured: boolean }
  | null

type CanvasContextMenu =
  | { type: 'node'; nodeId: string; screen: Point }
  | { type: 'connection'; connectionId: string; screen: Point }
  | null

type PendingConnectionCreate = {
  nodeId: string
  handleType: 'source' | 'target'
  position: Point
} | null

const nodeIcons = {
  text: Type,
  image: Image,
  video: Video,
  audio: Music2,
  config: Settings2,
  group: Group,
}

const nodeKindLabels: Record<NodeKind, string> = {
  text: '文本',
  image: '图片',
  video: '视频',
  audio: '音频',
  config: '配置',
  group: '组',
}

const resizeCorners: ResizeCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']

async function canvasNodeFromFile(file: File, position: Point): Promise<Partial<CanvasNode> & { type: NodeKind; position: Point }> {
  if (file.type.startsWith('image/')) {
    const content = await readFileAsDataUrl(file)
    const size = await readImageSize(content)
    const asset = await canvasApi.uploadAsset(content)
    const fit = fitMediaSize(size.width, size.height, 360, 280)
    return {
      type: 'image',
      title: file.name || '图片节点',
      position,
      width: fit.width,
      height: fit.height + 42,
      metadata: {
        content: asset.url,
        status: 'success',
        mimeType: asset.mimeType || file.type,
        bytes: asset.bytes || file.size,
        storageKey: asset.storageKey,
        naturalWidth: size.width,
        naturalHeight: size.height,
      },
    }
  }
  if (file.type.startsWith('video/')) {
    const content = await readFileAsDataUrl(file)
    const asset = await canvasApi.uploadAsset(content)
    return {
      type: 'video',
      title: file.name || '视频节点',
      position,
      width: 360,
      height: 260,
      metadata: {
        content: asset.url,
        status: 'success',
        mimeType: asset.mimeType || file.type,
        bytes: asset.bytes || file.size,
        storageKey: asset.storageKey,
      },
    }
  }
  if (isAudioFile(file)) {
    const content = await readFileAsDataUrl(file)
    const asset = await canvasApi.uploadAsset(content)
    return {
      type: 'audio',
      title: file.name || '音频节点',
      position,
      width: 300,
      height: 170,
      metadata: {
        content: asset.url,
        status: 'success',
        mimeType: asset.mimeType || file.type || 'audio/mpeg',
        bytes: asset.bytes || file.size,
        storageKey: asset.storageKey,
      },
    }
  }
  const content = await file.text()
  return {
    type: 'text',
    title: file.name || '文本节点',
    position,
    metadata: { content, status: 'success', mimeType: file.type || 'text/plain', bytes: file.size },
  }
}

function isAudioFile(file: File) {
  return file.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(file.name)
}

function isUploadableMediaNode(node: CanvasNode) {
  return node.type === 'image' || node.type === 'video' || node.type === 'audio'
}

function mediaUploadAccept(node: CanvasNode) {
  if (node.type === 'image') return 'image/*'
  if (node.type === 'video') return 'video/*'
  if (node.type === 'audio') return 'audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac'
  return ''
}

function fileMatchesMediaNode(file: File, node: CanvasNode) {
  if (node.type === 'image') return file.type.startsWith('image/')
  if (node.type === 'video') return file.type.startsWith('video/')
  if (node.type === 'audio') return isAudioFile(file)
  return false
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function readImageSize(src: string) {
  return new Promise<{ width: number; height: number }>((resolve) => {
    const image = new window.Image()
    image.onload = () => resolve({ width: image.naturalWidth || 280, height: image.naturalHeight || 180 })
    image.onerror = () => resolve({ width: 280, height: 180 })
    image.src = src
  })
}

function fitMediaSize(width: number, height: number, maxWidth: number, maxHeight: number) {
  const scale = Math.min(maxWidth / Math.max(width, 1), maxHeight / Math.max(height, 1), 1)
  return {
    width: Math.max(180, Math.round(width * scale)),
    height: Math.max(130, Math.round(height * scale)),
  }
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function mediaInfoParts(node: CanvasNode) {
  const parts: string[] = []
  const width = node.metadata.naturalWidth
  const height = node.metadata.naturalHeight
  if (typeof width === 'number' && typeof height === 'number' && Number.isFinite(width) && Number.isFinite(height)) parts.push(`${Math.round(width)} × ${Math.round(height)}`)
  else if (node.width && node.height) parts.push(`${Math.round(node.width)} × ${Math.round(node.height)}`)
  if (node.metadata.mimeType) parts.push(node.metadata.mimeType)
  if (typeof node.metadata.bytes === 'number' && Number.isFinite(node.metadata.bytes)) parts.push(formatBytes(node.metadata.bytes))
  return parts
}

function nodePreview(node: CanvasNode) {
  if (node.type === 'text') return node.metadata.content || '空文本节点'
  if (node.type === 'config') return `${node.metadata.model || '默认模型'} · ${node.metadata.size || '1024x1024'} · ${node.metadata.count || 1} 张`
  if (node.metadata.mimeType) return node.metadata.mimeType
  return node.metadata.content ? '已载入内容' : `空${nodeKindLabels[node.type]}节点`
}

const statusLabels: Record<NonNullable<CanvasNode['metadata']['status']>, string> = {
  idle: '待接入',
  loading: '运行中',
  success: '已完成',
  error: '失败',
}

const jobStatusLabels: Partial<Record<NonNullable<CanvasNode['metadata']['generationJobStatus']>, string>> = {
  queued: '已提交',
  running: '运行中',
  succeeded: '已完成',
  failed: '失败',
}

const activeGenerationJobStatuses = new Set<NonNullable<CanvasNode['metadata']['generationJobStatus']>>(['queued', 'running'])

function isActiveGenerationJob(node: CanvasNode) {
  const status = node.metadata.generationJobStatus
  return Boolean(node.metadata.generationJobId && status && activeGenerationJobStatuses.has(status))
}

function hasGenerationMetadataChanged(current: CanvasNode['metadata'], next: Partial<CanvasNode['metadata']>) {
  return (
    current.status !== next.status ||
    current.generationJobStatus !== next.generationJobStatus ||
    current.content !== next.content ||
    current.mimeType !== next.mimeType ||
    current.bytes !== next.bytes ||
    current.naturalWidth !== next.naturalWidth ||
    current.naturalHeight !== next.naturalHeight ||
    current.activeOutputIndex !== next.activeOutputIndex ||
    JSON.stringify(current.generationOutputs ?? []) !== JSON.stringify(next.generationOutputs ?? []) ||
    current.generatedAt !== next.generatedAt ||
    current.errorDetails !== next.errorDetails
  )
}

function payloadModeLabel(mode: CanvasGenerationContext['mode']) {
  if (mode === 'video') return '生视频'
  if (mode === 'text') return '生文本'
  return '生图'
}

function canDownloadNode(node: CanvasNode) {
  return Boolean(node.metadata.content && (node.type === 'text' || node.type === 'image' || node.type === 'video' || node.type === 'audio'))
}

function canPreviewNode(node: CanvasNode) {
  return Boolean(node.metadata.content && (node.type === 'text' || node.type === 'image' || node.type === 'video' || node.type === 'audio'))
}

function safeFileName(name: string) {
  return (name.trim() || 'canvas-node')
    .split('')
    .map((char) => (char.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(char) ? '-' : char))
    .join('')
    .slice(0, 80)
}

function downloadNodeContent(node: CanvasNode) {
  const content = node.metadata.content
  if (!content) return
  const anchor = document.createElement('a')
  if (node.type === 'text') {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    anchor.href = URL.createObjectURL(blob)
    anchor.download = `${safeFileName(node.title)}.txt`
    anchor.click()
    URL.revokeObjectURL(anchor.href)
    return
  }
  anchor.href = content
  const extension = node.type === 'video' ? 'mp4' : node.type === 'audio' ? node.metadata.mimeType?.split('/')[1]?.split(';')[0] || 'mp3' : node.metadata.mimeType?.split('/')[1]?.split(';')[0] || 'png'
  anchor.download = `${safeFileName(node.title)}.${extension}`
  anchor.click()
}

function nodeCopyPayload(node: CanvasNode) {
  if (node.type === 'config') return node.metadata.composerContent || node.metadata.prompt || (node.metadata.generationPayload ? serializeCanvasGenerationPayload(node.metadata.generationPayload) : '')
  if (node.type === 'text') return node.metadata.content || node.metadata.prompt || ''
  return node.metadata.prompt || node.metadata.content || ''
}

function canCopyNodePayload(node: CanvasNode) {
  return Boolean(nodeCopyPayload(node).trim())
}

async function copyTextToClipboard(text: string) {
  if (!text.trim()) return
  try {
    await navigator.clipboard.writeText(text)
    return
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    textarea.style.top = '0'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    document.execCommand('copy')
    textarea.remove()
  }
}

function copyNodePayload(node: CanvasNode) {
  return copyTextToClipboard(nodeCopyPayload(node))
}

function isCanvasFragmentFile(file: File) {
  const name = file.name.toLowerCase()
  return name.endsWith('.artboard-flow-fragment.zip') || name.endsWith('.artboard-flow-fragment.json')
}

export function CanvasWorkspace({ project, onProjectChange, onBack, onExport }: CanvasWorkspaceProps) {
  const controller = useCanvasController(project, onProjectChange)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const mediaUploadInputRef = useRef<HTMLInputElement | null>(null)
  const mediaUploadTargetNodeIdRef = useRef<string | null>(null)
  const dragRef = useRef<DragState>(null)
  const connectionDraftRef = useRef<ConnectionDraft | null>(null)
  const focusAnimationRef = useRef<number | null>(null)
  const pasteHandledAtRef = useRef(0)
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null)
  const [connectionDraft, setConnectionDraft] = useState<ConnectionDraft | null>(null)
  const [pendingConnectionCreate, setPendingConnectionCreate] = useState<PendingConnectionCreate>(null)
  const [nodeCreatePosition, setNodeCreatePosition] = useState<Point | null>(null)
  const [contextMenu, setContextMenu] = useState<CanvasContextMenu>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 720 })
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(project.title)
  const [sidePanelOpen, setSidePanelOpen] = useState(false)
  const [sidePanelQuery, setSidePanelQuery] = useState('')
  const [sidePanelType, setSidePanelType] = useState<NodeKind | 'all'>('all')
  const [toolbarNodeId, setToolbarNodeId] = useState<string | null>(null)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [dropTargetGroupId, setDropTargetGroupId] = useState<string | null>(null)
  const [infoNodeId, setInfoNodeId] = useState<string | null>(null)
  const [previewNodeId, setPreviewNodeId] = useState<string | null>(null)

  const setActiveConnectionDraft = useCallback((draft: ConnectionDraft | null) => {
    connectionDraftRef.current = draft
    setConnectionDraft(draft)
  }, [])
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [miniMapOpen, setMiniMapOpen] = useState(true)
  const [mediaUploadInputAccept, setMediaUploadInputAccept] = useState('image/*,video/*,audio/*')
  const [spacePressed, setSpacePressed] = useState(false)
  const nodesById = useMemo(() => new Map(controller.project.nodes.map((node) => [node.id, node])), [controller.project.nodes])
  const renderableNodes = useMemo(
    () => controller.project.nodes.filter((node) => !isHiddenSplitChild(node, controller.project.nodes)),
    [controller.project.nodes],
  )
  const renderableConnections = useMemo(
    () => controller.project.connections.filter((connection) => !isSplitConnectionHidden(connection, controller.project.nodes)),
    [controller.project.connections, controller.project.nodes],
  )
  const visibleNodes = useMemo(
    () => visibleNodesInViewport(renderableNodes, controller.project.viewport, canvasSize),
    [canvasSize, controller.project.viewport, renderableNodes],
  )
  const relationCounts = useMemo(() => relationCountsForProject(controller.project), [controller.project])
  const splitOutputCounts = useMemo(() => {
    const counts = new Map<string, number>()
    controller.project.nodes.forEach((node) => {
      const sourceId = node.metadata.splitSourceNodeId
      if (sourceId) counts.set(sourceId, (counts.get(sourceId) ?? 0) + 1)
    })
    return counts
  }, [controller.project.nodes])
  const generationContextByConfigId = useMemo(() => {
    const contexts = new Map<string, CanvasGenerationContext>()
    controller.project.nodes.forEach((node) => {
      if (node.type === 'config') contexts.set(node.id, buildCanvasGenerationContext(node.id, controller.project.nodes, controller.project.connections))
    })
    return contexts
  }, [controller.project.connections, controller.project.nodes])
  const mentionReferencesByNodeId = useMemo(() => {
    const references = new Map<string, CanvasResourceReference[]>()
    controller.project.nodes.forEach((node) => {
      references.set(node.id, buildNodeMentionReferences(node, controller.project.nodes, controller.project.connections))
    })
    return references
  }, [controller.project.connections, controller.project.nodes])
  const selectedSingleNodeId = controller.selectedNodeIds.length === 1 ? controller.selectedNodeIds[0] : null
  const hasMultiSelection = controller.selectedNodeIds.length > 1
  const toolbarNode = hasMultiSelection ? null : (selectedSingleNodeId ? nodesById.get(selectedSingleNodeId) : null) ?? (toolbarNodeId ? nodesById.get(toolbarNodeId) : null) ?? null
  const activeRelationNodeId = controller.selectedNodeIds.length > 1 ? null : hoveredNodeId ?? selectedSingleNodeId
  const relatedHighlight = useMemo(() => {
    const nodeIds = new Set<string>()
    const connectionIds = new Set<string>()
    if (!activeRelationNodeId) return { nodeIds, connectionIds }
    nodeIds.add(activeRelationNodeId)
    renderableConnections.forEach((connection) => {
      if (connection.fromNodeId !== activeRelationNodeId && connection.toNodeId !== activeRelationNodeId) return
      connectionIds.add(connection.id)
      nodeIds.add(connection.fromNodeId)
      nodeIds.add(connection.toNodeId)
    })
    return { nodeIds, connectionIds }
  }, [activeRelationNodeId, renderableConnections])
  const infoNode = infoNodeId ? nodesById.get(infoNodeId) ?? null : null
  const previewNode = previewNodeId ? nodesById.get(previewNodeId) ?? null : null
  const selectionToolbarPosition = useMemo(() => {
    if (!hasMultiSelection || selectionBox || controller.selectedNodes.length === 0) return null
    const left = Math.min(...controller.selectedNodes.map((node) => node.position.x))
    const top = Math.min(...controller.selectedNodes.map((node) => node.position.y))
    const right = Math.max(...controller.selectedNodes.map((node) => node.position.x + node.width))
    const anchor = worldToScreen({ x: (left + right) / 2, y: top }, controller.project.viewport)
    return {
      x: Math.min(Math.max(anchor.x, 190), Math.max(canvasSize.width - 190, 190)),
      y: Math.max(anchor.y - 56, 16),
    }
  }, [canvasSize.width, controller.project.viewport, controller.selectedNodes, hasMultiSelection, selectionBox])
  const infoNodeRelations = useMemo(
    () => infoNode ? getNodeRelations(controller.project, infoNode.id) : { incoming: [], outgoing: [] },
    [controller.project, infoNode],
  )
  const contextConnectionPair = useMemo(
    () => contextMenu?.type === 'connection' ? getConnectionNodePair(controller.project, contextMenu.connectionId) : null,
    [contextMenu, controller.project],
  )
  const contextNode = contextMenu?.type === 'node' ? nodesById.get(contextMenu.nodeId) ?? null : null

  const clientPoint = useCallback((event: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) }
  }, [])

  const clientWorld = useCallback(
    (event: { clientX: number; clientY: number }) => screenToWorld(clientPoint(event), controller.project.viewport),
    [clientPoint, controller.project.viewport],
  )

  useEffect(() => {
    connectionDraftRef.current = connectionDraft
  }, [connectionDraft])

  useEffect(() => {
    if (!editingTitle) setTitleDraft(controller.project.title)
  }, [controller.project.title, editingTitle])

  useEffect(() => {
    if (!editingTitle) return
    titleInputRef.current?.focus()
    titleInputRef.current?.select()
  }, [editingTitle])

  useEffect(() => {
    const element = canvasRef.current
    if (!element) return
    const updateSize = () => {
      const rect = element.getBoundingClientRect()
      setCanvasSize({ width: rect.width, height: rect.height })
    }
    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const findConnectionDropTargetFromEvent = useCallback(
    (event: { clientX: number; clientY: number }, draft: Pick<ConnectionDraft, 'nodeId' | 'handleType'>) => {
      const projectForHitTesting = { ...controller.project, nodes: renderableNodes, connections: renderableConnections }
      return findConnectionDropTarget(projectForHitTesting, clientWorld(event), draft, controller.project.viewport.k)
    },
    [clientWorld, controller.project, renderableConnections, renderableNodes],
  )

  const zoomAt = useCallback(
    (screen: Point, nextScale: number) => {
      const viewport = controller.project.viewport
      const k = clampViewportScale(nextScale)
      const world = screenToWorld(screen, viewport)
      controller.setViewport({ x: screen.x - world.x * k, y: screen.y - world.y * k, k })
    },
    [controller],
  )

  const canvasCenterScreen = useCallback(
    () => ({ x: canvasSize.width / 2, y: canvasSize.height / 2 }),
    [canvasSize.height, canvasSize.width],
  )

  const resetViewport = useCallback(() => {
    const center = canvasCenterScreen()
    controller.setViewport({ x: center.x, y: center.y, k: 1 }, true)
    setContextMenu(null)
  }, [canvasCenterScreen, controller])

  const addNodeNearCenter = useCallback(
    (type: NodeKind) => {
      const rect = canvasRef.current?.getBoundingClientRect()
      const screen = { x: (rect?.width ?? 1200) / 2, y: (rect?.height ?? 800) / 2 }
      const world = screenToWorld(screen, controller.project.viewport)
      const index = controller.project.nodes.length
      controller.addNode(type, { x: world.x + index * 340, y: world.y + (index % 2) * 54 })
    },
    [controller],
  )

  const canvasCenterWorld = useCallback(() => {
    const rect = canvasRef.current?.getBoundingClientRect()
    const screen = { x: (rect?.width ?? 1200) / 2, y: (rect?.height ?? 720) / 2 }
    return screenToWorld(screen, controller.project.viewport)
  }, [controller.project.viewport])

  const addClipboardFileNode = useCallback(
    async (file: File) => {
      const node = await canvasNodeFromFile(file, canvasCenterWorld())
      controller.addNode(node.type, node.position, node)
    },
    [canvasCenterWorld, controller],
  )

  const addClipboardTextNode = useCallback(
    (text: string) => {
      const content = text.trim()
      if (!content) return false
      controller.addNode('text', canvasCenterWorld(), { title: '剪贴板文本', metadata: { content, status: 'success', mimeType: 'text/plain', bytes: new Blob([content]).size } })
      return true
    },
    [canvasCenterWorld, controller],
  )

  const pasteCanvasClipboardText = useCallback(
    (text: string) => {
      const clipboard = parseCanvasClipboardText(text)
      return Boolean(clipboard && controller.pasteClipboard(clipboard, canvasCenterWorld()))
    },
    [canvasCenterWorld, controller],
  )

  const pasteCanvasClipboardFile = useCallback(
    async (file: File, targetCenter = canvasCenterWorld()) => {
      if (!isCanvasFragmentFile(file)) return false
      try {
        const clipboard = await readCanvasClipboardFile(file)
        return controller.pasteClipboard(clipboard, targetCenter)
      } catch {
        return false
      }
    },
    [canvasCenterWorld, controller],
  )

  const writeCanvasClipboardText = useCallback((clipboard: CanvasClipboard | null) => {
    const text = serializeCanvasClipboard(clipboard)
    if (!text) return
    void navigator.clipboard?.writeText?.(text).catch(() => undefined)
  }, [])

  const copySelectionToClipboard = useCallback(() => {
    const clipboard = controller.copySelection()
    writeCanvasClipboardText(clipboard)
  }, [controller, writeCanvasClipboardText])

  const exportSelectionFragment = useCallback(() => {
    const clipboard = controller.copySelection()
    void downloadCanvasClipboard(clipboard, `ArtboardFlow-节点片段-${clipboard?.nodes.length ?? 0}个`)
  }, [controller])

  const pasteClipboardData = useCallback(
    async (clipboardData: DataTransfer | null) => {
      if (!clipboardData) return false
      const text = clipboardData.getData('text/plain')
      if (pasteCanvasClipboardText(text)) return true
      const files = [
        ...Array.from(clipboardData.files),
        ...Array.from(clipboardData.items)
          .filter((item) => item.kind === 'file')
          .map((item) => item.getAsFile())
          .filter((file): file is File => Boolean(file)),
      ]
      const uniqueFiles = Array.from(new Map(files.map((file) => [`${file.name}:${file.type}:${file.size}`, file])).values())
      if (uniqueFiles.length) {
        for (const file of uniqueFiles) {
          if (await pasteCanvasClipboardFile(file)) continue
          await addClipboardFileNode(file)
        }
        return true
      }
      return addClipboardTextNode(text)
    },
    [addClipboardFileNode, addClipboardTextNode, pasteCanvasClipboardFile, pasteCanvasClipboardText],
  )

  const pasteSystemClipboard = useCallback(async () => {
    try {
      if ('clipboard' in navigator && 'read' in navigator.clipboard) {
        const items = await navigator.clipboard.read()
        for (const item of items) {
          const imageType = item.types.find((type) => type.startsWith('image/'))
          if (!imageType) continue
          const blob = await item.getType(imageType)
          const file = new File([blob], 'clipboard-image.png', { type: imageType })
          await addClipboardFileNode(file)
          return true
        }
      }
    } catch {
      // 浏览器可能因为权限拒绝图片剪贴板读取；继续尝试纯文本。
    }
    try {
      const text = (await navigator.clipboard?.readText?.())?.trim()
      if (!text) return false
      if (pasteCanvasClipboardText(text)) return true
      return addClipboardTextNode(text)
    } catch {
      return false
    }
  }, [addClipboardFileNode, addClipboardTextNode, pasteCanvasClipboardText])

  const openMediaUpload = useCallback((node: CanvasNode) => {
    if (!isUploadableMediaNode(node)) return
    mediaUploadTargetNodeIdRef.current = node.id
    setMediaUploadInputAccept(mediaUploadAccept(node))
    window.requestAnimationFrame(() => {
      if (mediaUploadInputRef.current) {
        mediaUploadInputRef.current.value = ''
        mediaUploadInputRef.current.click()
      }
    })
  }, [])

  const handleMediaUploadChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0]
      event.currentTarget.value = ''
      const nodeId = mediaUploadTargetNodeIdRef.current
      mediaUploadTargetNodeIdRef.current = null
      if (!file || !nodeId) return

      const node = controller.project.nodes.find((item) => item.id === nodeId)
      if (!node || !fileMatchesMediaNode(file, node)) {
        window.alert('请选择与当前节点类型匹配的媒体文件。')
        return
      }

      const imported = await canvasNodeFromFile(file, node.position)
      controller.updateNode(node.id, {
        title: imported.title ?? node.title,
        width: imported.width ?? node.width,
        height: imported.height ?? node.height,
        metadata: {
          ...imported.metadata,
          errorDetails: '',
        },
      })
      setToolbarNodeId(node.id)
    },
    [controller],
  )

  const saveTitle = () => {
    controller.renameProject(titleDraft)
    setTitleDraft(titleDraft.trim() || controller.project.title)
    setEditingTitle(false)
  }

  const handleCanvasPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const isPrimaryButton = event.button === 0
    const isMiddleButton = event.button === 1
    if (!isPrimaryButton && !isMiddleButton) return
    const target = event.target as HTMLElement
    if (target.closest('[data-toolbar], [data-minimap], [data-canvas-input]')) return
    if (isPrimaryButton && target.closest('[data-node-id], [data-connection-id]')) return
    event.preventDefault()
    setContextMenu(null)
    setToolbarNodeId(null)
    setNodeCreatePosition(null)
    setPendingConnectionCreate(null)
    if (connectionDraftRef.current) {
      return
    }
    const startWorld = clientWorld(event)
    if (isPrimaryButton && (event.ctrlKey || event.metaKey)) {
      setSelectionBox({
        start: startWorld,
        current: startWorld,
        additive: event.shiftKey,
        initialIds: controller.selectedNodeIds,
      })
      return
    }
    dragRef.current = { type: 'pan', start: { x: event.clientX, y: event.clientY }, viewportStart: { x: controller.project.viewport.x, y: controller.project.viewport.y }, historyCaptured: false }
    if (isPrimaryButton) controller.clearSelection()
  }

  const handleCanvasDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (target.closest('[data-node-id], [data-connection-id], [data-toolbar], [data-minimap]')) return
    setContextMenu(null)
    setPendingConnectionCreate(null)
    setNodeCreatePosition(clientWorld(event))
  }

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (target.closest('[data-canvas-input]')) return
    event.preventDefault()
    const factor = Math.pow(1.1, -event.deltaY / 100)
    zoomAt(clientPoint(event), controller.project.viewport.k * factor)
  }

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const target = event.target as HTMLElement
    if (target.closest('[data-node-id], [data-toolbar], [data-minimap]')) return
    setContextMenu(null)
    setPendingConnectionCreate(null)
    setNodeCreatePosition(null)
    const world = clientWorld(event)
    const files = Array.from(event.dataTransfer.files)
    if (files.length) {
      for (const [index, file] of files.entries()) {
        const position = { x: world.x + index * 36, y: world.y + index * 36 }
        if (await pasteCanvasClipboardFile(file, position)) continue
        const node = await canvasNodeFromFile(file, position)
        controller.addNode(node.type, node.position, node)
      }
      return
    }
    const text = event.dataTransfer.getData('text/plain').trim()
    if (text) {
      controller.addNode('text', world, { title: '拖入文本', metadata: { content: text, status: 'idle' } })
    }
  }

  const handleNodePointerDown = (event: React.PointerEvent<HTMLElement>, node: CanvasNode) => {
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest('[data-node-control]')) return
    if (node.type !== 'group' && target.closest('[data-canvas-input]')) return
    event.stopPropagation()
    const additive = event.shiftKey || event.ctrlKey || event.metaKey
    const nodeIds = nextNodeSelection(controller.selectedNodeIds, node.id, additive)
    controller.selectNode(node.id, additive)
    if (!nodeIds.includes(node.id)) return
    dragRef.current = { type: 'node', start: { x: event.clientX, y: event.clientY }, nodeIds: expandNodeIdsForMovement(controller.project.nodes, nodeIds), historyCaptured: false }
  }

  const selectNodeFromInput = (event: React.PointerEvent<HTMLElement>, node: CanvasNode) => {
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    if (!target.closest('[data-canvas-input]') || target.closest('[data-node-control]')) return
    const additive = event.shiftKey || event.ctrlKey || event.metaKey
    controller.selectNode(node.id, additive)
    setContextMenu(null)
    setToolbarNodeId(node.id)
    setHoveredNodeId(node.id)
  }

  const handleResizePointerDown = (event: React.PointerEvent<HTMLButtonElement>, node: CanvasNode, corner: ResizeCorner) => {
    event.preventDefault()
    event.stopPropagation()
    dragRef.current = { type: 'resize', start: { x: event.clientX, y: event.clientY }, node, corner, historyCaptured: false }
  }

  const startConnection = (event: React.PointerEvent<HTMLButtonElement>, nodeId: string, handleType: 'source' | 'target') => {
    event.preventDefault()
    event.stopPropagation()
    setPendingConnectionCreate(null)
    setNodeCreatePosition(null)
    setContextMenu(null)
    setActiveConnectionDraft({ nodeId, handleType, to: clientWorld(event), startScreen: { x: event.clientX, y: event.clientY } })
  }

  const finishConnectionToNode = useCallback(
    (toNodeId: string) => {
      const draft = connectionDraftRef.current
      if (!draft || !resolveConnectionToNode(controller.project, draft, toNodeId)) return false
      controller.connectNodes(draft.nodeId, toNodeId, draft.handleType)
      setActiveConnectionDraft(null)
      return true
    },
    [controller, setActiveConnectionDraft],
  )

  const finishConnection = (event: React.PointerEvent<HTMLButtonElement>, toNodeId: string) => {
    event.preventDefault()
    event.stopPropagation()
    finishConnectionToNode(toNodeId)
  }

  const startConnectionFromToolbar = useCallback(
    (node: CanvasNode) => {
      if (node.type === 'config' || node.type === 'group') return
      const anchor = sourcePort(node)
      setPendingConnectionCreate(null)
      setNodeCreatePosition(null)
      setContextMenu(null)
      setActiveConnectionDraft({
        nodeId: node.id,
        handleType: 'source',
        to: anchor,
        startScreen: worldToScreen(anchor, controller.project.viewport),
      })
      setToolbarNodeId(node.id)
    },
    [controller, setActiveConnectionDraft],
  )

  useEffect(() => {
    const move = (event: PointerEvent | MouseEvent) => {
      const drag = dragRef.current
      if (connectionDraft) {
        setConnectionDraft((value) => {
          if (!value) return value
          const dropTarget = findConnectionDropTargetFromEvent(event, value)
          const targetNodeId = dropTarget.nodeId
          const targetNode = targetNodeId ? nodesById.get(targetNodeId) : null
          const to = targetNode ? (value.handleType === 'source' ? targetPort(targetNode) : sourcePort(targetNode)) : clientWorld(event)
          const next = { ...value, targetNodeId, blockedNodeId: dropTarget.blockedNodeId, to }
          connectionDraftRef.current = next
          return next
        })
      }
      if (selectionBox) {
        const next = { ...selectionBox, current: clientWorld(event) }
        setSelectionBox(next)
        controller.applySelectionBox(next)
      }
      if (!drag) return
      if (drag.type === 'pan') {
        const changed = event.clientX !== drag.start.x || event.clientY !== drag.start.y
        if (changed && !drag.historyCaptured) {
          controller.captureHistory()
          dragRef.current = { ...drag, historyCaptured: true }
        }
        controller.setViewport({
          ...controller.project.viewport,
          x: drag.viewportStart.x + event.clientX - drag.start.x,
          y: drag.viewportStart.y + event.clientY - drag.start.y,
        })
      }
      if (drag.type === 'node') {
        const delta = {
          x: (event.clientX - drag.start.x) / controller.project.viewport.k,
          y: (event.clientY - drag.start.y) / controller.project.viewport.k,
        }
        const changed = delta.x !== 0 || delta.y !== 0
        if (changed && !drag.historyCaptured) {
          controller.captureHistory()
        }
        controller.moveNodes(drag.nodeIds, {
          x: delta.x,
          y: delta.y,
        })
        const previewNodes = controller.project.nodes.map((node) =>
          drag.nodeIds.includes(node.id) ? { ...node, position: { x: node.position.x + delta.x, y: node.position.y + delta.y } } : node,
        )
        setDropTargetGroupId(findGroupDropTarget(previewNodes, drag.nodeIds)?.id ?? null)
        dragRef.current = { ...drag, start: { x: event.clientX, y: event.clientY }, historyCaptured: drag.historyCaptured || changed }
      }
      if (drag.type === 'resize') {
        const dx = (event.clientX - drag.start.x) / controller.project.viewport.k
        const dy = (event.clientY - drag.start.y) / controller.project.viewport.k
        const changed = dx !== 0 || dy !== 0
        const frame = resizeNodeFrame(drag.node, drag.corner, { x: dx, y: dy })
        if (changed && !drag.historyCaptured) {
          controller.captureHistory()
          dragRef.current = { ...drag, historyCaptured: true }
        }
        controller.updateNode(drag.node.id, frame, false)
      }
    }
    const up = (event: PointerEvent | MouseEvent) => {
      const drag = dragRef.current
      const draft = connectionDraftRef.current
      if (draft) {
        const dropTarget = draft.targetNodeId ? { nodeId: draft.targetNodeId, isNearNode: true, blockedNodeId: null } : findConnectionDropTargetFromEvent(event, draft)
        const dx = event.clientX - draft.startScreen.x
        const dy = event.clientY - draft.startScreen.y
        const isClickArmed = Math.hypot(dx, dy) < 6
        if (isClickArmed) {
          setActiveConnectionDraft({ ...draft, to: clientWorld(event), targetNodeId: undefined, blockedNodeId: undefined })
        } else if (dropTarget.nodeId && dropTarget.nodeId !== draft.nodeId) {
          controller.connectNodes(draft.nodeId, dropTarget.nodeId, draft.handleType)
          setActiveConnectionDraft(null)
        } else if (dropTarget.isNearNode) {
          setActiveConnectionDraft(null)
        } else {
          setPendingConnectionCreate({ nodeId: draft.nodeId, handleType: draft.handleType, position: clientWorld(event) })
          setActiveConnectionDraft(null)
        }
      }
      if (drag?.type === 'node') {
        controller.syncDraggedNodeGroups(drag.nodeIds)
      }
      setDropTargetGroupId(null)
      dragRef.current = null
      setSelectionBox(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  }, [clientWorld, connectionDraft, controller, findConnectionDropTargetFromEvent, nodesById, selectionBox, setActiveConnectionDraft])

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null
      const editing = Boolean(target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.closest("[contenteditable='true'], [data-canvas-no-zoom]")))
      if (editing) return
      if (event.code === 'Space') {
        setSpacePressed(true)
        return
      }
      const mod = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()
      if (mod && !event.altKey && key === 'a') {
        event.preventDefault()
        controller.clearSelection()
        controller.project.nodes.forEach((node) => controller.selectNode(node.id, true))
        return
      }
      if (mod && !event.altKey && key === 'c') {
        event.preventDefault()
        copySelectionToClipboard()
        return
      }
      if (mod && !event.altKey && key === 'v') {
        event.preventDefault()
        if (controller.pasteSelection(canvasCenterWorld())) {
          return
        }
        window.setTimeout(() => {
          if (Date.now() - pasteHandledAtRef.current > 250) void pasteSystemClipboard()
        }, 80)
        return
      }
      if (mod && !event.altKey && key === 'z' && !event.shiftKey) {
        event.preventDefault()
        controller.undo()
        return
      }
      if ((mod && !event.altKey && key === 'y') || (mod && !event.altKey && event.shiftKey && key === 'z')) {
        event.preventDefault()
        controller.redo()
        return
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        controller.deleteSelection()
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setActiveConnectionDraft(null)
        setPendingConnectionCreate(null)
        setNodeCreatePosition(null)
        setContextMenu(null)
        setToolbarNodeId(null)
        setInfoNodeId(null)
        setShortcutsOpen(false)
        controller.clearSelection()
        return
      }
    }
    const keyup = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpacePressed(false)
    }
    window.addEventListener('keydown', keydown)
    window.addEventListener('keyup', keyup)
    return () => {
      window.removeEventListener('keydown', keydown)
      window.removeEventListener('keyup', keyup)
    }
  }, [canvasCenterWorld, controller, copySelectionToClipboard, pasteSystemClipboard, setActiveConnectionDraft])

  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement
      if (['INPUT', 'TEXTAREA'].includes(target.tagName)) return
      if (!event.clipboardData) return
      event.preventDefault()
      void pasteClipboardData(event.clipboardData).then((handled) => {
        if (handled) pasteHandledAtRef.current = Date.now()
      })
    }
    window.addEventListener('paste', paste)
    return () => window.removeEventListener('paste', paste)
  }, [pasteClipboardData])

  const selectionRect = selectionBox
    ? {
        x: Math.min(selectionBox.start.x, selectionBox.current.x),
        y: Math.min(selectionBox.start.y, selectionBox.current.y),
        width: Math.abs(selectionBox.current.x - selectionBox.start.x),
        height: Math.abs(selectionBox.current.y - selectionBox.start.y),
      }
    : null
  const gridSize = 48 * controller.project.viewport.k
  const canvasStageStyle = {
    '--grid-size': `${gridSize}px`,
    '--grid-x': `${controller.project.viewport.x % gridSize}px`,
    '--grid-y': `${controller.project.viewport.y % gridSize}px`,
  } as React.CSSProperties
  const filteredPanelNodes = useMemo(() => {
    const query = sidePanelQuery.trim().toLowerCase()
    return controller.project.nodes.filter((node) => {
      if (sidePanelType !== 'all' && node.type !== sidePanelType) return false
      if (!query) return true
      return [node.title, node.type, node.metadata.content, node.metadata.model, node.metadata.mimeType]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query)
    })
  }, [controller.project.nodes, sidePanelQuery, sidePanelType])

  const focusNode = useCallback(
    (node: CanvasNode) => {
      const nodeScale = Math.min((canvasSize.width * 0.6) / node.width, (canvasSize.height * 0.6) / node.height)
      const nextScale = clampViewportScale(Math.min(Math.max(nodeScale, 0.05), 1.5))
      const target = {
        x: canvasSize.width / 2 - (node.position.x + node.width / 2) * nextScale,
        y: canvasSize.height / 2 - (node.position.y + node.height / 2) * nextScale,
        k: nextScale,
      }
      const start = { ...controller.project.viewport }
      const duration = 450
      const easeOutCubic = (value: number) => 1 - Math.pow(1 - value, 3)
      let startTime: number | null = null

      if (focusAnimationRef.current) cancelAnimationFrame(focusAnimationRef.current)
      controller.selectNode(node.id, false)
      controller.captureHistory()
      setContextMenu(null)
      const step = (now: number) => {
        if (startTime === null) startTime = now
        const progress = Math.min((now - startTime) / duration, 1)
        const eased = easeOutCubic(progress)
        controller.setViewport({
          x: start.x + (target.x - start.x) * eased,
          y: start.y + (target.y - start.y) * eased,
          k: start.k + (target.k - start.k) * eased,
        })
        focusAnimationRef.current = progress < 1 ? requestAnimationFrame(step) : null
      }
      focusAnimationRef.current = requestAnimationFrame(step)
    },
    [canvasSize.height, canvasSize.width, controller],
  )

  useEffect(
    () => () => {
      if (focusAnimationRef.current) cancelAnimationFrame(focusAnimationRef.current)
    },
    [],
  )

  const splitGenerationOutputs = useCallback(
    (node: CanvasNode) => {
      const result = splitGenerationOutputsInProject(controller.project, node.id, () => crypto.randomUUID())
      if (result) {
        controller.replaceProject(result.project)
        setToolbarNodeId(node.id)
        return
      }
      const outputs = generationOutputsForNode(node)
      if (outputs.length <= 1 || node.type === 'config' || node.type === 'text') return
      const existingIndexes = new Set(
        controller.project.nodes
          .filter((item) => item.metadata.splitSourceNodeId === node.id)
          .map((item) => item.metadata.splitOutputIndex)
          .filter((index): index is number => Number.isInteger(index)),
      )
      outputs.forEach((output, index) => {
        if (existingIndexes.has(index)) return
        const yOffset = index * Math.min(node.height + 36, 240)
        controller.addConnectedNode(
          node.type,
          node.id,
          'source',
          { x: node.position.x + node.width + 120, y: node.position.y + yOffset },
          {
            title: `${node.title || nodeKindLabels[node.type]} · 结果 ${index + 1}`,
            width: node.width,
            height: node.height,
            metadata: {
              content: output.content,
              status: 'success',
              prompt: node.metadata.prompt,
              mimeType: output.mimeType,
              bytes: output.bytes,
              naturalWidth: output.naturalWidth,
              naturalHeight: output.naturalHeight,
              splitSourceNodeId: node.id,
              splitOutputIndex: index,
              model: node.metadata.model,
              size: node.metadata.size,
              count: node.metadata.count,
              generatedAt: node.metadata.generatedAt,
            },
          },
        )
      })
      setToolbarNodeId(node.id)
    },
    [controller],
  )

  const toggleSplitOutputs = useCallback(
    (node: CanvasNode) => {
      if (!splitOutputCounts.get(node.id)) return
      controller.updateNode(node.id, { metadata: { splitChildrenCollapsed: !node.metadata.splitChildrenCollapsed } })
      setToolbarNodeId(node.id)
    },
    [controller, splitOutputCounts],
  )

  const promoteSplitOutput = useCallback(
    (node: CanvasNode) => {
      const result = promoteSplitOutputInProject(controller.project, node.id)
      if (!result) return
      controller.replaceProject(result)
      setToolbarNodeId(node.metadata.splitSourceNodeId ?? node.id)
    },
    [controller],
  )

  const toggleMediaFreeResize = useCallback(
    (node: CanvasNode) => {
      if (node.type !== 'image' && node.type !== 'video') return
      const freeResize = !node.metadata.freeResize
      const ratio = (node.metadata.naturalWidth || node.width) / (node.metadata.naturalHeight || node.height || 1)
      const lockedPatch = freeResize
        ? {}
        : {
            height: node.width / ratio,
            position: {
              ...node.position,
              y: node.position.y + node.height / 2 - node.width / ratio / 2,
            },
          }
      controller.updateNode(node.id, {
        ...lockedPatch,
        metadata: { freeResize },
      })
      setToolbarNodeId(node.id)
    },
    [controller],
  )

  const createGenerationTaskNode = useCallback(
    (configNodeId: string) => {
      const configNode = nodesById.get(configNodeId)
      if (!configNode) return
      const context = buildCanvasGenerationContext(configNodeId, controller.project.nodes, controller.project.connections)
      if (!context.ready) {
        controller.updateNode(configNodeId, {
          metadata: {
            status: 'error',
            errorDetails: context.warnings[0],
          },
        })
        return
      }

      const outputType = context.mode === 'video' ? 'video' : context.mode === 'text' ? 'text' : 'image'
      const outputTitle = context.mode === 'video' ? '视频生成任务' : context.mode === 'text' ? '文本生成任务' : '图片生成任务'
      const generatedAt = new Date().toISOString()
      const generationPayload = buildCanvasGenerationPayload(context, generatedAt)
      const outputNode = controller.addConnectedNode(
        outputType,
        configNodeId,
        'source',
        { x: configNode.position.x + configNode.width + 120, y: configNode.position.y + 24 },
        {
          title: outputTitle,
          width: outputType === 'text' ? 320 : outputType === 'video' ? 360 : 320,
          height: outputType === 'text' ? 220 : outputType === 'video' ? 250 : 240,
          metadata: {
            status: 'idle',
            prompt: context.prompt,
            content: '',
            generationPayload,
            model: context.model,
            size: context.size,
            count: context.count,
          },
        },
      )
      controller.updateNode(configNodeId, {
        metadata: {
          status: 'success',
          errorDetails: '',
          generatedAt,
          generationPayload,
          outputNodeId: outputNode.id,
        },
      }, false)
    },
    [controller, nodesById],
  )

  const retryGenerationTaskNode = useCallback(
    (taskNodeId: string) => {
      const sourceConfigId = controller.project.connections.find((connection) => connection.toNodeId === taskNodeId && nodesById.get(connection.fromNodeId)?.type === 'config')?.fromNodeId
      if (!sourceConfigId) {
        controller.updateNode(taskNodeId, {
          metadata: {
            status: 'error',
            errorDetails: '找不到这个任务节点对应的配置节点，请从配置节点重新创建任务。',
          },
        })
        return
      }
      createGenerationTaskNode(sourceConfigId)
    },
    [controller, createGenerationTaskNode, nodesById],
  )

  const submitGenerationTaskNode = useCallback(
    async (taskNodeId: string) => {
      const taskNode = nodesById.get(taskNodeId)
      const payload = taskNode?.metadata.generationPayload
      if (!payload) return
      try {
        const job = await canvasApi.submitGenerationJob(controller.project.id, taskNodeId, payload)
        controller.updateProject((current) => applyGenerationJobToProject(current, taskNodeId, job, () => crypto.randomUUID()))
      } catch (error) {
        controller.updateNode(taskNodeId, {
          metadata: {
            status: 'error',
            errorDetails: error instanceof Error ? error.message : '提交生成任务失败',
          },
        })
      }
    },
    [controller, nodesById],
  )

  const refreshGenerationTaskNode = useCallback(
    async (taskNodeId: string) => {
      const taskNode = nodesById.get(taskNodeId)
      const jobId = taskNode?.metadata.generationJobId
      if (!jobId) return
      try {
        const job = await canvasApi.getGenerationJob(jobId)
        controller.updateProject((current) => applyGenerationJobToProject(current, taskNodeId, job, () => crypto.randomUUID()))
      } catch (error) {
        controller.updateNode(taskNodeId, {
          metadata: {
            status: 'error',
            errorDetails: error instanceof Error ? error.message : '刷新生成任务状态失败',
          },
        })
      }
    },
    [controller, nodesById],
  )

  const cancelGenerationTaskNode = useCallback(
    async (taskNodeId: string) => {
      const taskNode = nodesById.get(taskNodeId)
      const jobId = taskNode?.metadata.generationJobId
      if (!jobId) return
      try {
        const job = await canvasApi.cancelGenerationJob(jobId)
        controller.updateProject((current) => applyGenerationJobToProject(current, taskNodeId, job, () => crypto.randomUUID()))
      } catch (error) {
        controller.updateNode(taskNodeId, {
          metadata: {
            status: 'error',
            errorDetails: error instanceof Error ? error.message : '停止生成任务失败',
          },
        })
      }
    },
    [controller, nodesById],
  )

  useEffect(() => {
    const activeTasks = controller.project.nodes.filter(isActiveGenerationJob)
    if (!activeTasks.length) return

    let cancelled = false
    const refreshActiveTasks = async () => {
      await Promise.all(
        activeTasks.map(async (taskNode) => {
          const jobId = taskNode.metadata.generationJobId
          if (!jobId) return
          try {
            const job = await canvasApi.getGenerationJob(jobId)
            if (cancelled) return
            const latestNode = nodesById.get(taskNode.id)
            if (!latestNode) return
            const metadata = metadataFromGenerationJob(job, latestNode.metadata)
            if (hasGenerationMetadataChanged(latestNode.metadata, metadata)) {
              controller.updateProject((current) => applyGenerationJobToProject(current, taskNode.id, job, () => crypto.randomUUID()), false)
            }
          } catch {
            // 自动轮询不把临时网络错误写成节点失败；用户仍可手动刷新查看详细错误。
          }
        }),
      )
    }

    const intervalId = window.setInterval(() => {
      void refreshActiveTasks()
    }, 2500)
    void refreshActiveTasks()

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [controller, controller.project.nodes, nodesById])

  return (
    <div className="workspace">
      <header className="topbar">
        <button className="ghost-button" onClick={onBack}>
          我的画布
        </button>
        <div className="topbar-title">
          {editingTitle ? (
            <input
              ref={titleInputRef}
              value={titleDraft}
              autoFocus
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={saveTitle}
              onKeyDown={(event) => {
                if (event.key === 'Enter') saveTitle()
                if (event.key === 'Escape') {
                  setTitleDraft(controller.project.title)
                  setEditingTitle(false)
                }
              }}
            />
          ) : (
            <button title="双击重命名画布" onDoubleClick={() => setEditingTitle(true)}>
              <h1>{controller.project.title}</h1>
            </button>
          )}
          <p>
            {controller.project.nodes.length} 个节点 · {controller.project.connections.length} 条连线
          </p>
        </div>
        <div className="topbar-actions">
          <button className="ghost-button" onClick={() => setSidePanelOpen((value) => !value)}>
            {sidePanelOpen ? '收起节点面板' : '节点面板'}
          </button>
          <button className="icon-button" title="撤销" disabled={!controller.canUndo} onClick={controller.undo}>
            <Undo2 size={17} />
          </button>
          <button className="icon-button" title="重做" disabled={!controller.canRedo} onClick={controller.redo}>
            <Redo2 size={17} />
          </button>
          <button className="ghost-button" onClick={() => onExport(controller.project)}>
            <FileJson size={16} /> 导出
          </button>
        </div>
      </header>

      <div className="canvas-shell">
        <input
          ref={mediaUploadInputRef}
          className="visually-hidden"
          type="file"
          accept={mediaUploadInputAccept}
          onChange={(event) => void handleMediaUploadChange(event)}
        />
        {sidePanelOpen ? (
          <aside className="node-side-panel" data-toolbar>
            <div className="node-side-panel-header">
              <div>
                <strong>画布节点</strong>
                <span>{filteredPanelNodes.length} / {controller.project.nodes.length}</span>
              </div>
              <button onClick={() => setSidePanelOpen(false)}>收起</button>
            </div>
            <div className="node-side-panel-controls">
              <input
                value={sidePanelQuery}
                placeholder="搜索标题、内容或类型"
                onChange={(event) => setSidePanelQuery(event.target.value)}
              />
              <select value={sidePanelType} onChange={(event) => setSidePanelType(event.target.value as NodeKind | 'all')}>
                <option value="all">全部类型</option>
                {(['text', 'image', 'video', 'audio', 'config'] as const).map((type) => (
                  <option key={type} value={type}>{nodeKindLabels[type]}</option>
                ))}
              </select>
            </div>
            <div className="node-side-panel-list">
              {filteredPanelNodes.length ? (
                filteredPanelNodes.map((node) => {
                  const counts = relationCounts.get(node.id) ?? { incoming: 0, outgoing: 0 }
                  const selected = controller.selectedNodeIds.includes(node.id)
                  return (
                    <button key={node.id} className={`node-list-item ${selected ? 'active' : ''}`} onClick={() => focusNode(node)}>
                      <span className={`node-list-icon ${node.type}`}>{nodeKindLabels[node.type].slice(0, 1)}</span>
                      <span className="node-list-main">
                        <span className="node-list-title">{node.title || '未命名节点'}</span>
                        <span className="node-list-preview">{nodePreview(node)}</span>
                        <span className="node-list-relations">
                          输入 {counts.incoming} · 输出 {counts.outgoing}
                        </span>
                      </span>
                    </button>
                  )
                })
              ) : (
                <div className="node-side-empty">没有匹配的节点</div>
              )}
            </div>
          </aside>
        ) : null}

        <aside className={`canvas-toolbar ${sidePanelOpen ? 'with-side-panel' : ''}`} data-toolbar>
          <button title="选择工具">
            <MousePointer2 size={18} />
          </button>
          <button title="文本节点" onClick={() => addNodeNearCenter('text')}>
            <Type size={18} />
          </button>
          <button title="图片节点" onClick={() => addNodeNearCenter('image')}>
            <Image size={18} />
          </button>
          <button title="视频节点" onClick={() => addNodeNearCenter('video')}>
            <Video size={18} />
          </button>
          <button title="音频节点" onClick={() => addNodeNearCenter('audio')}>
            <Music2 size={18} />
          </button>
          <button title="配置节点" onClick={() => addNodeNearCenter('config')}>
            <Settings2 size={18} />
          </button>
          <span />
          <button title="删除选中" onClick={controller.deleteSelection}>
            <Trash2 size={18} />
          </button>
        </aside>

        <div
          ref={canvasRef}
          className={`canvas-stage ${controller.project.backgroundMode} ${spacePressed ? 'space-pan' : ''}`}
          style={canvasStageStyle}
          onPointerDown={handleCanvasPointerDown}
          onAuxClick={(event) => event.preventDefault()}
          onDoubleClick={handleCanvasDoubleClick}
          onWheel={handleWheel}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => void handleDrop(event)}
        >
          <ConnectionGuide draft={connectionDraft} nodesById={nodesById} />
          <div
            className="world"
            style={{
              transform: `translate(${controller.project.viewport.x}px, ${controller.project.viewport.y}px) scale(${controller.project.viewport.k})`,
            }}
          >
            <svg className="connections-layer" viewBox="-50000 -50000 100000 100000">
              {renderableConnections.map((connection) => {
                const endpoints = connectionEndpoints(connection, renderableNodes)
                if (!endpoints) return null
                const related = relatedHighlight.connectionIds.has(connection.id)
                const selected = controller.selectedConnectionId === connection.id
                const path = connectionPath(endpoints.start, endpoints.end)
                return (
                  <g key={connection.id}>
                    <path
                      data-connection-id={connection.id}
                      className="connection-hit"
                      d={path}
                      onPointerDown={(event) => {
                        event.stopPropagation()
                        controller.selectConnection(connection.id)
                        setContextMenu(null)
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        controller.selectConnection(connection.id)
                        setContextMenu({ type: 'connection', connectionId: connection.id, screen: { x: event.clientX, y: event.clientY } })
                      }}
                    />
                    <path
                      className={`connection-path ${related ? 'related' : ''} ${selected ? 'selected' : ''}`}
                      d={path}
                    />
                  </g>
                )
              })}
              {connectionDraft ? (
                <path
                  className="connection-path draft"
                  d={
                    connectionDraft.handleType === 'source'
                      ? connectionPath(sourcePort(nodesById.get(connectionDraft.nodeId)!), connectionDraft.to)
                      : connectionPath(connectionDraft.to, targetPort(nodesById.get(connectionDraft.nodeId)!))
                  }
                />
              ) : null}
              {selectionRect ? <rect className="selection-box" {...selectionRect} /> : null}
            </svg>

            {visibleNodes.map((node) => (
              <CanvasNodeView
                key={node.id}
                node={node}
                selected={controller.selectedNodeIds.includes(node.id)}
                related={relatedHighlight.nodeIds.has(node.id)}
                onPointerDown={handleNodePointerDown}
                onInputPointerDown={selectNodeFromInput}
                onResizePointerDown={handleResizePointerDown}
                onStartConnection={startConnection}
                onFinishConnection={finishConnection}
                onUpdate={controller.updateNode}
                onCaptureHistory={controller.captureHistory}
                generationContext={node.type === 'config' ? generationContextByConfigId.get(node.id) ?? null : null}
                onCreateGenerationTask={createGenerationTaskNode}
                onRetryGenerationTask={retryGenerationTaskNode}
                onSubmitGenerationTask={submitGenerationTaskNode}
                onRefreshGenerationTask={refreshGenerationTaskNode}
                onCancelGenerationTask={cancelGenerationTaskNode}
                mentionReferences={mentionReferencesByNodeId.get(node.id) ?? []}
                showImageInfo={Boolean(controller.project.showImageInfo)}
                splitOutputCount={splitOutputCounts.get(node.id) ?? 0}
                onSplitGenerationOutputs={splitGenerationOutputs}
                onToggleSplitOutputs={toggleSplitOutputs}
                onHoverStart={(nodeId) => {
                  setToolbarNodeId(nodeId)
                  setHoveredNodeId(nodeId)
                }}
                onHoverEnd={(nodeId) => setHoveredNodeId((current) => (current === nodeId ? null : current))}
                onFinishConnectionToNode={finishConnectionToNode}
                isConnecting={Boolean(connectionDraft)}
                connectionOrigin={connectionDraft?.nodeId === node.id}
                groupDropTarget={dropTargetGroupId === node.id}
                connectionTargetState={
                  connectionDraft?.targetNodeId === node.id
                    ? 'valid'
                    : connectionDraft?.blockedNodeId === node.id
                      ? 'blocked'
                      : null
                }
                onContextMenu={(event, nodeId) => {
                  event.preventDefault()
                  event.stopPropagation()
                  controller.selectNode(nodeId, false)
                  setContextMenu({ type: 'node', nodeId, screen: { x: event.clientX, y: event.clientY } })
                }}
              />
            ))}
            {pendingConnectionCreate ? (
              <NodeCreateMenu
                title="创建并连接"
                variant="connection"
                position={pendingConnectionCreate.position}
                onCreate={(type) => {
                  controller.addConnectedNode(type, pendingConnectionCreate.nodeId, pendingConnectionCreate.handleType, pendingConnectionCreate.position)
                  setPendingConnectionCreate(null)
                }}
                onClose={() => setPendingConnectionCreate(null)}
              />
            ) : null}
            {nodeCreatePosition ? (
              <NodeCreateMenu
                title="新建节点"
                variant="standalone"
                position={nodeCreatePosition}
                onCreate={(type) => {
                  controller.addNode(type, nodeCreatePosition)
                  setNodeCreatePosition(null)
                }}
                onClose={() => setNodeCreatePosition(null)}
              />
            ) : null}
          </div>

          <div className="zoom-panel" data-toolbar>
            <button
              className={miniMapOpen ? 'active' : ''}
              title={miniMapOpen ? '关闭小地图' : '打开小地图'}
              onClick={() => setMiniMapOpen((value) => !value)}
            >
              <Compass size={16} />
            </button>
            <button onClick={() => zoomAt(canvasCenterScreen(), controller.project.viewport.k - 0.1)}>
              <Minus size={16} />
            </button>
            <input
              aria-label="缩放"
              type="range"
              min={CANVAS_MIN_SCALE}
              max={CANVAS_MAX_SCALE}
              step="0.01"
              value={controller.project.viewport.k}
              onChange={(event) => zoomAt(canvasCenterScreen(), Number(event.target.value))}
            />
            <button onClick={() => zoomAt(canvasCenterScreen(), controller.project.viewport.k + 0.1)}>
              <Plus size={16} />
            </button>
            <button
              title="重置视图"
              onClick={resetViewport}
            >
              <RotateCcw size={16} />
            </button>
            <button title="快捷键" onClick={() => setShortcutsOpen(true)}>
              <HelpCircle size={16} />
            </button>
            <span>{Math.round(controller.project.viewport.k * 100)}%</span>
          </div>

          <div className="background-panel" data-toolbar>
            {(['dots', 'lines', 'blank'] as const).map((mode) => (
              <button key={mode} className={controller.project.backgroundMode === mode ? 'active' : ''} onClick={() => controller.setBackgroundMode(mode)}>
                {mode === 'dots' ? '点阵' : mode === 'lines' ? '网格' : '空白'}
              </button>
            ))}
            <button
              className={controller.project.showImageInfo ? 'active' : ''}
              title={controller.project.showImageInfo ? '隐藏媒体信息' : '显示媒体信息'}
              onClick={() => controller.setShowImageInfo(!controller.project.showImageInfo)}
            >
              信息
            </button>
          </div>

          {miniMapOpen ? (
            <MiniMap
              nodes={renderableNodes}
              connections={renderableConnections}
              selectedNodeIds={controller.selectedNodeIds}
              viewport={controller.project.viewport}
              viewportSize={canvasSize}
              onViewportChange={controller.setViewport}
            />
          ) : null}
          <SelectionToolbar
            position={selectionToolbarPosition}
            count={controller.selectedNodeIds.length}
            onDeselect={controller.clearSelection}
            onGroup={controller.groupSelection}
            onCopy={copySelectionToClipboard}
            onExport={exportSelectionFragment}
            onDuplicate={() => {
              controller.copySelection()
              controller.pasteSelection()
            }}
            onDelete={controller.deleteSelection}
          />
          <NodeHoverToolbar
            node={toolbarNode}
            viewport={controller.project.viewport}
            onInfo={(node) => setInfoNodeId(node.id)}
            onPreview={(node) => setPreviewNodeId(node.id)}
            onCreateGenerationTask={(node) => createGenerationTaskNode(node.id)}
            onRetryGenerationTask={(node) => retryGenerationTaskNode(node.id)}
            onStartConnection={startConnectionFromToolbar}
            onPromoteSplitOutput={promoteSplitOutput}
            onDuplicate={(node) => controller.duplicateNode(node.id)}
            onCopyContent={(node) => void copyNodePayload(node)}
            onUpload={openMediaUpload}
            onDownload={downloadNodeContent}
            onToggleFreeResize={toggleMediaFreeResize}
            onDelete={(node) => {
              controller.deleteNode(node.id)
              setToolbarNodeId(null)
              if (infoNodeId === node.id) setInfoNodeId(null)
              if (previewNodeId === node.id) setPreviewNodeId(null)
            }}
            onKeep={(nodeId) => setToolbarNodeId(nodeId)}
          />
        </div>
      </div>
      <NodeInfoModal
        node={infoNode}
        relationCounts={infoNode ? relationCounts.get(infoNode.id) ?? { incoming: 0, outgoing: 0 } : { incoming: 0, outgoing: 0 }}
        relations={infoNodeRelations}
        onFocusNode={(node) => {
          focusNode(node)
          setInfoNodeId(null)
        }}
        onDeleteConnection={controller.deleteConnection}
        onClose={() => setInfoNodeId(null)}
      />
      <MediaPreviewModal node={previewNode} onClose={() => setPreviewNodeId(null)} />
      <ShortcutHelpModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      {contextMenu ? (
        <CanvasContextMenuView
          menu={contextMenu}
          node={contextNode}
          connectionPair={contextConnectionPair}
          onClose={() => setContextMenu(null)}
          onDuplicate={() => {
            if (contextMenu.type === 'node') controller.duplicateNode(contextMenu.nodeId)
            setContextMenu(null)
          }}
          onPreview={() => {
            if (contextNode) setPreviewNodeId(contextNode.id)
            setContextMenu(null)
          }}
          onCopyContent={() => {
            if (contextNode) void copyNodePayload(contextNode)
            setContextMenu(null)
          }}
          onPromoteSplitOutput={() => {
            if (contextNode) promoteSplitOutput(contextNode)
            setContextMenu(null)
          }}
          onFocusNode={(node) => {
            focusNode(node)
            setContextMenu(null)
          }}
          onDelete={() => {
            if (contextMenu.type === 'connection') controller.deleteConnection(contextMenu.connectionId)
            if (contextMenu.type === 'node') controller.deleteNode(contextMenu.nodeId)
            setContextMenu(null)
          }}
        />
      ) : null}
    </div>
  )
}

function ShortcutHelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  return (
    <div className="shortcut-help-backdrop" data-toolbar onPointerDown={onClose}>
      <section className="shortcut-help-modal" onPointerDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span>画布操作</span>
            <h2>快捷键</h2>
          </div>
          <button onClick={onClose}>关闭</button>
        </header>
        <div className="shortcut-help-list">
          <ShortcutHelpRow keys={['拖动画布', '中键拖动']} value="平移视图" />
          <ShortcutHelpRow keys={['滚轮', '缩放滑杆']} value="缩放画布" />
          <ShortcutHelpRow keys={['Ctrl / Cmd', '拖动']} value="框选多个节点" />
          <ShortcutHelpRow keys={['Shift / Ctrl / Cmd', '点击']} value="追加选择节点" />
          <ShortcutHelpRow keys={['工具条', '连线']} value="从当前节点开始连线，适合节点重叠时使用" />
          <ShortcutHelpRow keys={['Ctrl / Cmd', 'A']} value="全选节点" />
          <ShortcutHelpRow keys={['Ctrl / Cmd', 'C / V']} value="复制 / 粘贴节点，或粘贴剪贴板文本/图片" />
          <ShortcutHelpRow keys={['Ctrl / Cmd', 'Z']} value="撤销" />
          <ShortcutHelpRow keys={['Ctrl / Cmd', 'Shift', 'Z']} value="重做" />
          <ShortcutHelpRow keys={['Ctrl / Cmd', 'Y']} value="重做" />
          <ShortcutHelpRow keys={['Delete / Backspace']} value="删除选中" />
          <ShortcutHelpRow keys={['Esc']} value="取消选择并关闭浮层" />
          <ShortcutHelpRow keys={['拖入图片/视频/文件']} value="上传到画布生成节点" />
        </div>
      </section>
    </div>
  )
}

function ShortcutHelpRow({ keys, value }: { keys: string[]; value: string }) {
  return (
    <div className="shortcut-help-row">
      <div>
        {keys.map((key) => (
          <kbd key={key}>{key}</kbd>
        ))}
      </div>
      <span>{value}</span>
    </div>
  )
}

function ConnectionGuide({ draft, nodesById }: { draft: ConnectionDraft | null; nodesById: Map<string, CanvasNode> }) {
  if (!draft) return null
  const originNode = nodesById.get(draft.nodeId)
  const targetNode = draft.targetNodeId ? nodesById.get(draft.targetNodeId) : null
  const blockedNode = draft.blockedNodeId ? nodesById.get(draft.blockedNodeId) : null
  const status = targetNode ? `松手连接到「${targetNode.title || nodeKindLabels[targetNode.type]}」` : blockedNode ? '这个节点不能这样连接' : '拖到目标节点连接，拖到空白处新建并连接'

  return (
    <div className="connection-guide" data-toolbar>
      <Link2 size={15} />
      <strong>{originNode ? `从「${originNode.title || nodeKindLabels[originNode.type]}」连线` : '正在连线'}</strong>
      <span>{status}</span>
      <kbd>Esc</kbd>
      <span>取消</span>
    </div>
  )
}

function CanvasNodeView({
  node,
  selected,
  related,
  onPointerDown,
  onInputPointerDown,
  onResizePointerDown,
  onStartConnection,
  onFinishConnection,
  onUpdate,
  onCaptureHistory,
  generationContext,
  onCreateGenerationTask,
  onRetryGenerationTask,
  onSubmitGenerationTask,
  onRefreshGenerationTask,
  onCancelGenerationTask,
  mentionReferences,
  showImageInfo,
  splitOutputCount,
  onSplitGenerationOutputs,
  onToggleSplitOutputs,
  onHoverStart,
  onHoverEnd,
  onFinishConnectionToNode,
  isConnecting,
  connectionOrigin,
  groupDropTarget,
  connectionTargetState,
  onContextMenu,
}: {
  node: CanvasNode
  selected: boolean
  related: boolean
  onPointerDown: (event: React.PointerEvent<HTMLElement>, node: CanvasNode) => void
  onInputPointerDown: (event: React.PointerEvent<HTMLElement>, node: CanvasNode) => void
  onResizePointerDown: (event: React.PointerEvent<HTMLButtonElement>, node: CanvasNode, corner: ResizeCorner) => void
  onStartConnection: (event: React.PointerEvent<HTMLButtonElement>, nodeId: string, handleType: 'source' | 'target') => void
  onFinishConnection: (event: React.PointerEvent<HTMLButtonElement>, nodeId: string) => void
  onUpdate: (id: string, patch: Partial<CanvasNode>, recordHistory?: boolean) => void
  onCaptureHistory: () => void
  generationContext: CanvasGenerationContext | null
  onCreateGenerationTask: (nodeId: string) => void
  onRetryGenerationTask: (nodeId: string) => void
  onSubmitGenerationTask: (nodeId: string) => void
  onRefreshGenerationTask: (nodeId: string) => void
  onCancelGenerationTask: (nodeId: string) => void
  mentionReferences: CanvasResourceReference[]
  showImageInfo: boolean
  splitOutputCount: number
  onSplitGenerationOutputs: (node: CanvasNode) => void
  onToggleSplitOutputs: (node: CanvasNode) => void
  onHoverStart: (nodeId: string) => void
  onHoverEnd: (nodeId: string) => void
  onFinishConnectionToNode: (nodeId: string) => boolean
  isConnecting: boolean
  connectionOrigin: boolean
  groupDropTarget: boolean
  connectionTargetState: 'valid' | 'blocked' | null
  onContextMenu: (event: React.MouseEvent<HTMLElement>, nodeId: string) => void
}) {
  const Icon = nodeIcons[node.type]
  const hasSplitChildren = splitOutputCount > 0
  const isSplitCollapsed = hasSplitChildren && Boolean(node.metadata.splitChildrenCollapsed)
  const isSplitChild = Boolean(node.metadata.splitSourceNodeId)
  return (
    <article
      data-node-id={node.id}
      data-split-count={hasSplitChildren ? `${splitOutputCount} 个结果` : undefined}
      className={`canvas-node ${node.type} ${selected ? 'selected' : ''} ${related ? 'related' : ''} ${hasSplitChildren ? 'split-root' : ''} ${isSplitCollapsed ? 'split-collapsed' : ''} ${isSplitChild ? 'split-child' : ''} ${isConnecting ? 'connection-active' : ''} ${connectionOrigin ? 'connection-origin' : ''} ${groupDropTarget ? 'group-drop-target' : ''} ${connectionTargetState ? `connection-target-${connectionTargetState}` : ''}`}
      style={{ left: node.position.x, top: node.position.y, width: node.width, height: node.height }}
      onMouseEnter={() => onHoverStart(node.id)}
      onMouseLeave={() => onHoverEnd(node.id)}
      onContextMenu={(event) => onContextMenu(event, node.id)}
      onPointerDownCapture={(event) => onInputPointerDown(event, node)}
      onPointerDown={(event) => {
        if (isConnecting && !(event.target as HTMLElement).closest('[data-canvas-input]')) {
          event.preventDefault()
          event.stopPropagation()
          onFinishConnectionToNode(node.id)
          return
        }
        onPointerDown(event, node)
      }}
    >
      {node.type !== 'group' ? (
        <button
          className="port target-port"
          title="从此输入端反向连线"
          aria-label="连接输入端口"
          data-connection-handle="target"
          data-label="输入"
          data-node-control
          onPointerDown={(event) => onStartConnection(event, node.id, 'target')}
          onPointerUp={(event) => onFinishConnection(event, node.id)}
        />
      ) : null}
      <header>
        <span className="node-icon">
          <Icon size={15} />
        </span>
        <input
          data-canvas-input
          value={node.title}
          onFocus={onCaptureHistory}
          onChange={(event) => onUpdate(node.id, { title: event.target.value }, false)}
        />
      </header>
      <NodeBody
        node={node}
        generationContext={generationContext}
        onUpdate={onUpdate}
        onCaptureHistory={onCaptureHistory}
        onCreateGenerationTask={onCreateGenerationTask}
        onRetryGenerationTask={onRetryGenerationTask}
        onSubmitGenerationTask={onSubmitGenerationTask}
        onRefreshGenerationTask={onRefreshGenerationTask}
        onCancelGenerationTask={onCancelGenerationTask}
        mentionReferences={mentionReferences}
        showImageInfo={showImageInfo}
        splitOutputCount={splitOutputCount}
        onSplitGenerationOutputs={onSplitGenerationOutputs}
        onToggleSplitOutputs={onToggleSplitOutputs}
      />
      {node.type !== 'config' && node.type !== 'group' ? (
        <button className="port source-port" title="从此节点连线" aria-label="连接输出端口" data-connection-handle="source" data-label="输出" data-node-control onPointerDown={(event) => onStartConnection(event, node.id, 'source')} />
      ) : null}
      {resizeCorners.map((corner) => (
        <button
          key={corner}
          className={`resize-handle ${corner}`}
          title="缩放节点"
          data-node-control
          onPointerDown={(event) => onResizePointerDown(event, node, corner)}
        >
          <SquarePen size={12} />
        </button>
      ))}
    </article>
  )
}

function NodeCreateMenu({
  title,
  variant,
  position,
  onCreate,
  onClose,
}: {
  title: string
  variant: 'connection' | 'standalone'
  position: Point
  onCreate: (type: NodeKind) => void
  onClose: () => void
}) {
  const options: Array<{ type: NodeKind; Icon: typeof Type; label: string; description: string }> = [
    {
      type: 'text',
      Icon: Type,
      label: variant === 'connection' ? '文本生成' : '文本节点',
      description: variant === 'connection' ? '脚本、分镜、提示词和文案' : '记录提示词、脚本或备注',
    },
    {
      type: 'image',
      Icon: Image,
      label: variant === 'connection' ? '图片生成' : '图片节点',
      description: variant === 'connection' ? '用上游内容生成或承接图片' : '放置图片结果或参考图',
    },
    {
      type: 'video',
      Icon: Video,
      label: variant === 'connection' ? '视频生成' : '视频节点',
      description: variant === 'connection' ? '用上游内容生成或承接视频' : '放置视频结果或参考视频',
    },
    {
      type: 'audio',
      Icon: Music2,
      label: variant === 'connection' ? '音频参考' : '音频节点',
      description: variant === 'connection' ? '承接配音、音乐或音频参考' : '放置配音、音乐或音频素材',
    },
    {
      type: 'config',
      Icon: Settings2,
      label: '配置节点',
      description: '模型、尺寸、数量和输入顺序',
    },
  ]

  return (
    <div className="node-create-menu" data-toolbar style={{ left: position.x, top: position.y }} onPointerDown={(event) => event.stopPropagation()}>
      <div>{title}</div>
      {options.map(({ type, Icon, label, description }) => (
        <button className="node-create-option" key={type} onClick={() => onCreate(type)}>
          <span className="node-create-icon">
            <Icon size={17} />
          </span>
          <span>
            <strong>{label}</strong>
            <small>{description}</small>
          </span>
        </button>
      ))}
      <button className="muted-menu-action" onClick={onClose}>
        取消
      </button>
    </div>
  )
}

function CanvasContextMenuView({
  menu,
  node,
  connectionPair,
  onClose,
  onDuplicate,
  onPreview,
  onCopyContent,
  onPromoteSplitOutput,
  onFocusNode,
  onDelete,
}: {
  menu: NonNullable<CanvasContextMenu>
  node: CanvasNode | null
  connectionPair: ConnectionNodePair | null
  onClose: () => void
  onDuplicate: () => void
  onPreview: () => void
  onCopyContent: () => void
  onPromoteSplitOutput: () => void
  onFocusNode: (node: CanvasNode) => void
  onDelete: () => void
}) {
  useEffect(() => {
    const close = () => onClose()
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [onClose])

  return (
    <div
      className="canvas-context-menu"
      style={{ left: menu.screen.x, top: menu.screen.y }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {menu.type === 'node' ? (
        <>
          <button onClick={onDuplicate}>
            <Copy size={15} /> 复制节点
          </button>
          {node && canPreviewNode(node) ? (
            <button onClick={onPreview}>
              <Eye size={15} /> 查看内容
            </button>
          ) : null}
          {node && canCopyNodePayload(node) ? (
            <button onClick={onCopyContent}>
              <FileJson size={15} /> 复制内容
            </button>
          ) : null}
        </>
      ) : null}
      {menu.type === 'node' && node?.metadata.splitSourceNodeId && node.metadata.content ? (
        <button onClick={onPromoteSplitOutput}>
          <SquarePen size={15} /> 设为主结果
        </button>
      ) : null}
      {menu.type === 'connection' && connectionPair ? (
        <div className="connection-menu-details">
          <span>连接</span>
          <strong>{connectionPair.from.title || '未命名节点'} → {connectionPair.to.title || '未命名节点'}</strong>
          <button onClick={() => onFocusNode(connectionPair.from)}>
            聚焦起点
          </button>
          <button onClick={() => onFocusNode(connectionPair.to)}>
            聚焦终点
          </button>
        </div>
      ) : null}
      <button className="danger" onClick={onDelete}>
        <Trash2 size={15} /> 删除{menu.type === 'node' ? '节点' : '连线'}
      </button>
    </div>
  )
}

function SelectionToolbar({
  position,
  count,
  onDeselect,
  onGroup,
  onCopy,
  onExport,
  onDuplicate,
  onDelete,
}: {
  position: Point | null
  count: number
  onDeselect: () => void
  onGroup: () => void
  onCopy: () => void
  onExport: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  if (!position || count < 2) return null
  return (
    <div className="selection-toolbar" data-toolbar style={{ left: position.x, top: position.y }} onPointerDown={(event) => event.stopPropagation()}>
      <strong>已选 {count} 个节点</strong>
      <button onClick={onDeselect}>
        <MousePointer2 size={15} />
        取消
      </button>
      <button onClick={onGroup}>
        <Group size={15} />
        成组
      </button>
      <button onClick={onCopy}>
        <Copy size={15} />
        复制
      </button>
      <button onClick={onExport}>
        <Download size={15} />
        导出片段
      </button>
      <button onClick={onDuplicate}>
        <Copy size={15} />
        副本
      </button>
      <button className="danger" onClick={onDelete}>
        <Trash2 size={15} />
        删除
      </button>
    </div>
  )
}

function NodeHoverToolbar({
  node,
  viewport,
  onInfo,
  onPreview,
  onCreateGenerationTask,
  onRetryGenerationTask,
  onStartConnection,
  onPromoteSplitOutput,
  onDuplicate,
  onCopyContent,
  onUpload,
  onDownload,
  onToggleFreeResize,
  onDelete,
  onKeep,
}: {
  node: CanvasNode | null
  viewport: { x: number; y: number; k: number }
  onInfo: (node: CanvasNode) => void
  onPreview: (node: CanvasNode) => void
  onCreateGenerationTask: (node: CanvasNode) => void
  onRetryGenerationTask: (node: CanvasNode) => void
  onStartConnection: (node: CanvasNode) => void
  onPromoteSplitOutput: (node: CanvasNode) => void
  onDuplicate: (node: CanvasNode) => void
  onCopyContent: (node: CanvasNode) => void
  onUpload: (node: CanvasNode) => void
  onDownload: (node: CanvasNode) => void
  onToggleFreeResize: (node: CanvasNode) => void
  onDelete: (node: CanvasNode) => void
  onKeep: (nodeId: string) => void
}) {
  if (!node) return null
  const left = viewport.x + (node.position.x + node.width / 2) * viewport.k
  const top = Math.max(12, viewport.y + node.position.y * viewport.k - 12)
  const canCreateGenerationTask = node.type === 'config'
  const canRetryGenerationTask = node.metadata.status === 'error' && Boolean(node.metadata.generationPayload)
  const canStartConnection = node.type !== 'config' && node.type !== 'group'
  const canPromoteSplitOutput = Boolean(node.metadata.splitSourceNodeId && node.metadata.content)
  const canUpload = isUploadableMediaNode(node)
  const canToggleFreeResize = node.type === 'image' || node.type === 'video'

  return (
    <div
      className="node-hover-toolbar"
      data-toolbar
      style={{ left, top }}
      onMouseEnter={() => onKeep(node.id)}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button title="节点信息" onClick={() => onInfo(node)}>
        <Info size={15} />
        信息
      </button>
      {canPreviewNode(node) ? (
        <button title="查看节点内容" onClick={() => onPreview(node)}>
          <Eye size={15} />
          查看
        </button>
      ) : null}
      {canCreateGenerationTask ? (
        <button title="从配置创建生成任务" onClick={() => onCreateGenerationTask(node)}>
          <Play size={15} />
          生成
        </button>
      ) : null}
      {canRetryGenerationTask ? (
        <button title="重建生成任务" onClick={() => onRetryGenerationTask(node)}>
          <RotateCcw size={15} />
          重试
        </button>
      ) : null}
      {canStartConnection ? (
        <button title="从此节点开始连线" onClick={() => onStartConnection(node)}>
          <Link2 size={15} />
          连线
        </button>
      ) : null}
      {canPromoteSplitOutput ? (
        <button title="设为源节点主结果" onClick={() => onPromoteSplitOutput(node)}>
          <SquarePen size={15} />
          设为主结果
        </button>
      ) : null}
      <button title="复制节点" onClick={() => onDuplicate(node)}>
        <Copy size={15} />
        复制节点
      </button>
      {canCopyNodePayload(node) ? (
        <button title="复制节点正文、提示词或媒体地址" onClick={() => onCopyContent(node)}>
          <FileJson size={15} />
          复制内容
        </button>
      ) : null}
      {canUpload ? (
        <button title={node.metadata.content ? '替换媒体内容' : '上传媒体内容'} onClick={() => onUpload(node)}>
          <Upload size={15} />
          {node.metadata.content ? '替换' : '上传'}
        </button>
      ) : null}
      {canDownloadNode(node) ? (
        <button title="下载节点内容" onClick={() => onDownload(node)}>
          <Download size={15} />
          下载
        </button>
      ) : null}
      {canToggleFreeResize ? (
        <button
          className={node.metadata.freeResize ? 'active' : ''}
          title={node.metadata.freeResize ? '切换为锁定比例缩放' : '切换为自由比例缩放'}
          onClick={() => onToggleFreeResize(node)}
        >
          {node.metadata.freeResize ? <LockOpen size={15} /> : <Lock size={15} />}
          {node.metadata.freeResize ? '自由比例' : '锁比例'}
        </button>
      ) : null}
      <button className="danger" title="删除节点" onClick={() => onDelete(node)}>
        <Trash2 size={15} />
        删除
      </button>
    </div>
  )
}

function MediaPreviewModal({ node, onClose }: { node: CanvasNode | null; onClose: () => void }) {
  useEffect(() => {
    if (!node) return
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [node, onClose])

  if (!node || !node.metadata.content) return null
  const content = node.metadata.content
  const dimensions = node.metadata.naturalWidth && node.metadata.naturalHeight ? `${Math.round(node.metadata.naturalWidth)} × ${Math.round(node.metadata.naturalHeight)}` : `${Math.round(node.width)} × ${Math.round(node.height)}`

  return (
    <div className="media-preview-backdrop" data-toolbar onPointerDown={onClose}>
      <section className="media-preview-modal" onPointerDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span>{nodeKindLabels[node.type]}预览</span>
            <h2>{node.title || '未命名节点'}</h2>
          </div>
          <button onClick={onClose}>关闭</button>
        </header>
        <div className="media-preview-stage">
          {node.type === 'image' ? <img src={content} alt={node.title || '图片预览'} /> : null}
          {node.type === 'video' ? <video src={content} controls autoPlay={false} /> : null}
          {node.type === 'audio' ? (
            <div className="media-preview-audio">
              <Music2 size={44} />
              <strong>{node.title || '音频节点'}</strong>
              <audio src={content} controls />
            </div>
          ) : null}
          {node.type === 'text' ? <pre>{content}</pre> : null}
        </div>
        <footer>
          <span>{node.metadata.mimeType || (node.type === 'text' ? 'text/plain' : node.type)}</span>
          <span>{dimensions}</span>
          {node.metadata.bytes ? <span>{node.metadata.bytes} bytes</span> : null}
          {node.metadata.prompt ? <span title={node.metadata.prompt}>提示词：{node.metadata.prompt}</span> : null}
        </footer>
      </section>
    </div>
  )
}

function NodeInfoModal({
  node,
  relationCounts,
  relations,
  onFocusNode,
  onDeleteConnection,
  onClose,
}: {
  node: CanvasNode | null
  relationCounts: { incoming: number; outgoing: number }
  relations: NodeRelations
  onFocusNode: (node: CanvasNode) => void
  onDeleteConnection: (connectionId: string) => void
  onClose: () => void
}) {
  if (!node) return null
  const metadata = JSON.stringify(node.metadata, null, 2)

  return (
    <div className="node-info-backdrop" data-toolbar onPointerDown={onClose}>
      <section className="node-info-modal" onPointerDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span>{nodeKindLabels[node.type]}节点</span>
            <h2>{node.title || '未命名节点'}</h2>
          </div>
          <button onClick={onClose}>关闭</button>
        </header>
        <div className="node-info-grid">
          <InfoField label="ID" value={node.id} />
          <InfoField label="类型" value={nodeKindLabels[node.type]} />
          <InfoField label="尺寸" value={`${Math.round(node.width)} × ${Math.round(node.height)}`} />
          <InfoField label="位置" value={`${Math.round(node.position.x)}, ${Math.round(node.position.y)}`} />
          <InfoField label="输入关系" value={String(relationCounts.incoming)} />
          <InfoField label="输出关系" value={String(relationCounts.outgoing)} />
          <InfoField label="状态" value={node.metadata.status || 'idle'} />
          {node.metadata.mimeType ? <InfoField label="MIME" value={node.metadata.mimeType} /> : null}
          {node.metadata.bytes ? <InfoField label="大小" value={`${node.metadata.bytes} bytes`} /> : null}
        </div>
        {node.metadata.content ? (
          <div className="node-info-content">
            <strong>内容预览</strong>
            <p>{node.type === 'text' ? node.metadata.content : node.metadata.mimeType || '媒体内容已载入'}</p>
          </div>
        ) : null}
        <div className="node-info-relations">
          <RelationList title="上游节点" emptyText="没有上游输入" relations={relations.incoming} onFocusNode={onFocusNode} onDeleteConnection={onDeleteConnection} />
          <RelationList title="下游节点" emptyText="没有下游输出" relations={relations.outgoing} onFocusNode={onFocusNode} onDeleteConnection={onDeleteConnection} />
        </div>
        <div className="node-info-json">
          <strong>Metadata JSON</strong>
          <pre>{metadata}</pre>
        </div>
      </section>
    </div>
  )
}

function RelationList({
  title,
  emptyText,
  relations,
  onFocusNode,
  onDeleteConnection,
}: {
  title: string
  emptyText: string
  relations: NodeRelations['incoming']
  onFocusNode: (node: CanvasNode) => void
  onDeleteConnection: (connectionId: string) => void
}) {
  return (
    <section>
      <strong>{title}</strong>
      {relations.length ? (
        <div>
          {relations.map((relation) => (
            <div className="node-info-relation-row" key={relation.connectionId}>
              <button className="node-info-relation-focus" onClick={() => onFocusNode(relation.node)}>
                <span>{nodeKindLabels[relation.node.type]}</span>
                <strong>{relation.node.title || '未命名节点'}</strong>
              </button>
              <button className="node-info-relation-delete" data-relation-delete title="断开关系" onClick={() => onDeleteConnection(relation.connectionId)}>
                断开
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p>{emptyText}</p>
      )}
    </section>
  )
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function generationOutputsForNode(node: CanvasNode) {
  return node.metadata.generationOutputs?.filter((output) => output.content) ?? []
}

function selectGenerationOutput(output: CanvasGenerationJobResult, index: number): Partial<CanvasNode> {
  return {
    metadata: {
      content: output.content,
      mimeType: output.mimeType,
      bytes: output.bytes,
      naturalWidth: output.naturalWidth,
      naturalHeight: output.naturalHeight,
      activeOutputIndex: index,
    },
  }
}

function GenerationOutputSwitcher({
  node,
  onUpdate,
  splitOutputCount,
  onSplit,
  onToggleSplit,
}: {
  node: CanvasNode
  onUpdate: (id: string, patch: Partial<CanvasNode>, recordHistory?: boolean) => void
  splitOutputCount: number
  onSplit: (node: CanvasNode) => void
  onToggleSplit: (node: CanvasNode) => void
}) {
  const outputs = generationOutputsForNode(node)
  if (outputs.length <= 1) return null
  const activeIndex = Math.min(Math.max(node.metadata.activeOutputIndex ?? 0, 0), outputs.length - 1)
  const hasSplitAllOutputs = splitOutputCount >= outputs.length

  return (
    <div className="generation-output-switcher" data-canvas-input>
      <span>{outputs.length} 个结果</span>
      {outputs.map((output, index) => (
        <button
          key={`${output.content}-${index}`}
          className={index === activeIndex ? 'active' : ''}
          onClick={() => onUpdate(node.id, selectGenerationOutput(output, index))}
        >
          {index + 1}
        </button>
      ))}
      {hasSplitAllOutputs ? (
        <button
          className="split-action"
          title={node.metadata.splitChildrenCollapsed ? '展开拆分结果节点' : '收起拆分结果节点'}
          onClick={() => onToggleSplit(node)}
        >
          {node.metadata.splitChildrenCollapsed ? '展开' : '收起'}
        </button>
      ) : (
        <button
          className="split-action"
          title="拆分为独立节点"
          onClick={() => onSplit(node)}
        >
          拆分
        </button>
      )}
    </div>
  )
}

function MediaInfoBar({ node }: { node: CanvasNode }) {
  const parts = mediaInfoParts(node)
  if (!parts.length) return null
  return (
    <div className="media-info-bar" data-canvas-input>
      {parts.map((part) => <span key={part}>{part}</span>)}
    </div>
  )
}

function NodeBody({
  node,
  generationContext,
  mentionReferences,
  onUpdate,
  onCaptureHistory,
  onCreateGenerationTask,
  onRetryGenerationTask,
  onSubmitGenerationTask,
  onRefreshGenerationTask,
  onCancelGenerationTask,
  showImageInfo,
  splitOutputCount,
  onSplitGenerationOutputs,
  onToggleSplitOutputs,
}: {
  node: CanvasNode
  generationContext: CanvasGenerationContext | null
  mentionReferences: CanvasResourceReference[]
  onUpdate: (id: string, patch: Partial<CanvasNode>, recordHistory?: boolean) => void
  onCaptureHistory: () => void
  onCreateGenerationTask: (nodeId: string) => void
  onRetryGenerationTask: (nodeId: string) => void
  onSubmitGenerationTask: (nodeId: string) => void
  onRefreshGenerationTask: (nodeId: string) => void
  onCancelGenerationTask: (nodeId: string) => void
  showImageInfo: boolean
  splitOutputCount: number
  onSplitGenerationOutputs: (node: CanvasNode) => void
  onToggleSplitOutputs: (node: CanvasNode) => void
}) {
  const [composerMention, setComposerMention] = useState<{ query: string; caret: number } | null>(null)
  const mentionCandidates = useMemo(
    () => composerMention ? filterReferenceCandidates(mentionReferences, composerMention.query).slice(0, 6) : [],
    [composerMention, mentionReferences],
  )

  const syncComposerMention = (input: HTMLTextAreaElement) => {
    const caret = input.selectionStart ?? input.value.length
    const query = mentionQueryBeforeCaret(input.value, caret)
    setComposerMention(query === null || mentionReferences.length === 0 ? null : { query, caret })
  }

  const shouldRenderGenerationTask = Boolean(node.metadata.generationPayload)
    && (!node.metadata.content || node.metadata.status === 'loading' || node.metadata.status === 'error')

  if (shouldRenderGenerationTask) {
    return <GenerationTaskBody node={node} onRetry={onRetryGenerationTask} onSubmit={onSubmitGenerationTask} onRefresh={onRefreshGenerationTask} onCancel={onCancelGenerationTask} />
  }
  if (node.type === 'group') {
    return (
      <div className="node-body group-body">
        <Group size={22} />
        <strong>分组容器</strong>
        <span>拖动组可整体移动内部节点，删除组会解除分组。</span>
      </div>
    )
  }
  if (node.type === 'image') {
    return (
      <div className={`node-body media-body ${node.metadata.freeResize ? 'free-resize' : ''}`}>
        {node.metadata.content ? (
          <>
            <img src={node.metadata.content} alt={node.title} draggable={false} onDragStart={(event) => event.preventDefault()} />
            {showImageInfo ? <MediaInfoBar node={node} /> : null}
            <GenerationOutputSwitcher node={node} onUpdate={onUpdate} splitOutputCount={splitOutputCount} onSplit={onSplitGenerationOutputs} onToggleSplit={onToggleSplitOutputs} />
          </>
        ) : (
          <span>{node.metadata.prompt ? `已创建图片生成任务：${node.metadata.prompt}` : '图片结果或参考图会显示在这里'}</span>
        )}
      </div>
    )
  }
  if (node.type === 'video') {
    return (
      <div className={`node-body media-body ${node.metadata.freeResize ? 'free-resize' : ''}`}>
        {node.metadata.content ? (
          <>
            <video src={node.metadata.content} controls draggable={false} onDragStart={(event) => event.preventDefault()} />
            {showImageInfo ? <MediaInfoBar node={node} /> : null}
            <GenerationOutputSwitcher node={node} onUpdate={onUpdate} splitOutputCount={splitOutputCount} onSplit={onSplitGenerationOutputs} onToggleSplit={onToggleSplitOutputs} />
          </>
        ) : (
          <span>{node.metadata.prompt ? `已创建视频生成任务：${node.metadata.prompt}` : '视频结果、首帧或参考视频会显示在这里'}</span>
        )}
      </div>
    )
  }
  if (node.type === 'audio') {
    return (
      <div className="node-body media-body audio-body">
        {node.metadata.content ? (
          <div className="audio-player">
            <Music2 size={28} />
            <strong>{node.title || '音频节点'}</strong>
            <span>{node.metadata.mimeType || 'audio'}</span>
            <audio src={node.metadata.content} controls data-canvas-input />
            <GenerationOutputSwitcher node={node} onUpdate={onUpdate} splitOutputCount={splitOutputCount} onSplit={onSplitGenerationOutputs} onToggleSplit={onToggleSplitOutputs} />
          </div>
        ) : (
          <span>音频素材、配音或音乐参考会显示在这里</span>
        )}
      </div>
    )
  }
  if (node.type === 'config') {
    const context = generationContext
    const inputs = context?.inputs ?? []
    const summary = context?.summary ?? { text: 0, image: 0, video: 0, audio: 0 }
    const composerValue = node.metadata.composerContent ?? node.metadata.prompt ?? ''
    const hasExplicitReferences = inputs.some((input) => hasReferenceToken(composerValue, input.nodeId))
    return (
      <div className="node-body config-body" onWheel={(event) => event.stopPropagation()}>
        <section className="config-inputs">
          <div className="config-inputs-header">
            <strong>上游输入</strong>
            <span>{inputs.length ? `${context?.selectedInputs.length ?? inputs.length} / ${inputs.length} 个已纳入` : '等待连接'}</span>
          </div>
          <div className="config-input-chips">
            <span>文本 {summary.text}</span>
            <span>图片 {summary.image}</span>
            <span>视频 {summary.video}</span>
            <span>音频 {summary.audio}</span>
          </div>
          {inputs.length ? (
            <div className="config-input-list">
              {inputs.slice(0, 4).map((input) => {
                const referenced = hasReferenceToken(composerValue, input.nodeId)
                const included = !hasExplicitReferences || referenced
                return (
                  <div key={input.nodeId} className={`${input.hasContent ? '' : 'is-empty'} ${referenced ? 'is-referenced' : ''}`}>
                    <span>{nodeKindLabels[input.type]}</span>
                    <strong>{input.title || '未命名节点'}</strong>
                    <small>{included ? (referenced ? '已显式引用' : '默认纳入') : '未纳入'} · {input.preview}</small>
                    <button
                      data-canvas-input
                      className={referenced ? 'is-active' : ''}
                      onClick={() => {
                        const next = referenced ? removeReferenceToken(composerValue, input.nodeId) : appendReferenceToken(composerValue, input.nodeId)
                        onUpdate(node.id, { metadata: { composerContent: next } }, false)
                      }}
                    >
                      {referenced ? '移除引用' : '引用'}
                    </button>
                  </div>
                )
              })}
              {inputs.length > 4 ? <em>还有 {inputs.length - 4} 个上游输入</em> : null}
            </div>
          ) : (
            <p>把有内容的文本、图片、视频或音频节点连到这里，配置节点会汇总为生成输入。</p>
          )}
        </section>
        <label>
          模式
          <select
            data-canvas-input
            value={node.metadata.generationMode ?? 'image'}
            onFocus={onCaptureHistory}
            onChange={(event) => onUpdate(node.id, { metadata: { generationMode: event.target.value as CanvasNode['metadata']['generationMode'] } }, false)}
          >
            <option value="image">生图</option>
            <option value="video">生视频</option>
            <option value="text">生文本</option>
          </select>
        </label>
        <label>
          模型
          <input data-canvas-input value={node.metadata.model ?? '默认模型'} onFocus={onCaptureHistory} onChange={(event) => onUpdate(node.id, { metadata: { model: event.target.value } }, false)} />
        </label>
        <label>
          尺寸
          <input data-canvas-input value={node.metadata.size ?? '1024x1024'} onFocus={onCaptureHistory} onChange={(event) => onUpdate(node.id, { metadata: { size: event.target.value } }, false)} />
        </label>
        <label>
          数量
          <input
            data-canvas-input
            type="number"
            min="1"
            value={node.metadata.count ?? 1}
            onFocus={onCaptureHistory}
            onChange={(event) => onUpdate(node.id, { metadata: { count: Number(event.target.value) } }, false)}
          />
        </label>
        <label className="config-prompt-label">
          提示词
          <textarea
            data-canvas-input
            value={composerValue}
            placeholder="输入任务提示词；点击上游输入的“引用”可精确选择文本、图片或视频。"
            onFocus={(event) => {
              onCaptureHistory()
              syncComposerMention(event.currentTarget)
            }}
            onClick={(event) => syncComposerMention(event.currentTarget)}
            onKeyUp={(event) => syncComposerMention(event.currentTarget)}
            onBlur={() => window.setTimeout(() => setComposerMention(null), 120)}
            onChange={(event) => {
              onUpdate(node.id, { metadata: { composerContent: event.target.value } }, false)
              syncComposerMention(event.currentTarget)
            }}
          />
          {mentionCandidates.length ? (
            <div className="composer-mention-menu" data-canvas-input>
              {mentionCandidates.map((reference) => (
                <button
                  key={reference.nodeId}
                  type="button"
                  data-reference-node-id={reference.nodeId}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    const next = insertReferenceAtMention(composerValue, composerMention?.caret ?? composerValue.length, reference.nodeId)
                    onUpdate(node.id, { metadata: { composerContent: next.value } }, false)
                    setComposerMention(null)
                  }}
                >
                  <strong>{reference.label}</strong>
                  <span>{reference.title}</span>
                </button>
              ))}
            </div>
          ) : null}
        </label>
        <section className="config-task-preview">
          <div className="config-inputs-header">
            <strong>生成任务</strong>
            <span>{context?.ready ? '可创建' : '缺少输入'}</span>
          </div>
          <p>{context?.prompt.trim() || context?.warnings[0] || '连接输入或填写提示词后，这里会显示发送给生成服务的任务上下文。'}</p>
          {node.metadata.errorDetails ? <em>{node.metadata.errorDetails}</em> : null}
          <button data-canvas-input disabled={!context?.ready} onClick={() => onCreateGenerationTask(node.id)}>
            <Play size={14} /> 创建生成任务
          </button>
        </section>
      </div>
    )
  }
  return (
    <textarea
      data-canvas-input
      className="node-body text-body"
      value={node.metadata.content ?? ''}
      onFocus={onCaptureHistory}
      onChange={(event) => onUpdate(node.id, { metadata: { content: event.target.value } }, false)}
    />
  )
}

function GenerationTaskBody({
  node,
  onRetry,
  onSubmit,
  onRefresh,
  onCancel,
}: {
  node: CanvasNode
  onRetry: (nodeId: string) => void
  onSubmit: (nodeId: string) => void
  onRefresh: (nodeId: string) => void
  onCancel: (nodeId: string) => void
}) {
  const payload = node.metadata.generationPayload
  if (!payload) return null
  const status = node.metadata.status ?? 'idle'
  const jobStatus = node.metadata.generationJobStatus
  const serializedPayload = serializeCanvasGenerationPayload(payload)

  return (
    <div className="node-body generation-task-body" onWheel={(event) => event.stopPropagation()}>
      <div className="generation-task-header">
        <span className={`generation-status ${status}`}>{statusLabels[status]}</span>
        <strong>{payloadModeLabel(payload.mode)}任务</strong>
      </div>
      <div className="generation-task-meta">
        <span>模型 {payload.model}</span>
        <span>尺寸 {payload.size}</span>
        <span>数量 {payload.count}</span>
      </div>
      <div className="generation-task-meta">
        <span>Adapter {jobStatus ? jobStatusLabels[jobStatus] : '未提交'}</span>
        {node.metadata.generationJobId ? <span>Job {node.metadata.generationJobId.slice(0, 8)}</span> : null}
      </div>
      <div className="generation-task-meta">
        <span>文本 {payload.summary.text}</span>
        <span>图片 {payload.summary.image}</span>
        <span>视频 {payload.summary.video}</span>
        <span>音频 {payload.summary.audio}</span>
      </div>
      <p className="generation-task-prompt">{payload.prompt || '无提示词'}</p>
      {node.metadata.errorDetails ? <em>{node.metadata.errorDetails}</em> : null}
      <details>
        <summary>查看 Payload</summary>
        <pre>{serializedPayload}</pre>
      </details>
      <div className="generation-task-actions">
        <button data-canvas-input disabled={status === 'loading'} onClick={() => onSubmit(node.id)}>
          提交 Adapter
        </button>
        <button data-canvas-input disabled={!node.metadata.generationJobId} onClick={() => onRefresh(node.id)}>
          刷新状态
        </button>
        <button data-canvas-input disabled={status !== 'loading' || !node.metadata.generationJobId} onClick={() => onCancel(node.id)}>
          停止任务
        </button>
        <button data-canvas-input onClick={() => void navigator.clipboard?.writeText(serializedPayload)}>
          复制 Payload
        </button>
        <button data-canvas-input onClick={() => onRetry(node.id)}>
          重建任务
        </button>
      </div>
    </div>
  )
}

function MiniMap({
  nodes,
  connections,
  selectedNodeIds,
  viewport,
  viewportSize,
  onViewportChange,
}: {
  nodes: CanvasNode[]
  connections: CanvasProject['connections']
  selectedNodeIds: string[]
  viewport: { x: number; y: number; k: number }
  viewportSize: { width: number; height: number }
  onViewportChange: (viewport: { x: number; y: number; k: number }) => void
}) {
  const mapRef = useRef<SVGSVGElement | null>(null)
  const bounds = nodes.reduce(
    (acc, node) => ({
      minX: Math.min(acc.minX, node.position.x),
      minY: Math.min(acc.minY, node.position.y),
      maxX: Math.max(acc.maxX, node.position.x + node.width),
      maxY: Math.max(acc.maxY, node.position.y + node.height),
    }),
    { minX: -600, minY: -400, maxX: 900, maxY: 700 },
  )
  const width = Math.max(1, bounds.maxX - bounds.minX)
  const height = Math.max(1, bounds.maxY - bounds.minY)
  const scale = Math.min(170 / width, 110 / height)
  const offset = { x: 10 + (170 - width * scale) / 2, y: 10 + (110 - height * scale) / 2 }
  const selectedIds = new Set(selectedNodeIds)
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const viewX = (-viewport.x / viewport.k - bounds.minX) * scale
  const viewY = (-viewport.y / viewport.k - bounds.minY) * scale
  const viewWidth = Math.min(170, (viewportSize.width / viewport.k) * scale)
  const viewHeight = Math.min(110, (viewportSize.height / viewport.k) * scale)
  const nodeCenter = (node: CanvasNode) => ({
    x: (node.position.x + node.width / 2 - bounds.minX) * scale + offset.x,
    y: (node.position.y + node.height / 2 - bounds.minY) * scale + offset.y,
  })

  const focusViewport = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = mapRef.current?.getBoundingClientRect()
    if (!rect) return
    const sx = ((event.clientX - rect.left) / rect.width) * 190
    const sy = ((event.clientY - rect.top) / rect.height) * 130
    const worldX = (sx - offset.x) / scale + bounds.minX
    const worldY = (sy - offset.y) / scale + bounds.minY
    onViewportChange({
      x: viewportSize.width / 2 - worldX * viewport.k,
      y: viewportSize.height / 2 - worldY * viewport.k,
      k: viewport.k,
    })
  }

  return (
    <svg
      ref={mapRef}
      className="mini-map"
      data-minimap
      viewBox="0 0 190 130"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        focusViewport(event)
      }}
      onPointerMove={(event) => {
        if (event.buttons === 1) focusViewport(event)
      }}
    >
      <rect x="0" y="0" width="190" height="130" rx="8" />
      {connections.map((connection) => {
        const from = nodeById.get(connection.fromNodeId)
        const to = nodeById.get(connection.toNodeId)
        if (!from || !to) return null
        const start = nodeCenter(from)
        const end = nodeCenter(to)
        const selected = selectedIds.has(from.id) || selectedIds.has(to.id)
        return <line key={connection.id} className={`mini-connection ${selected ? 'selected' : ''}`} x1={start.x} y1={start.y} x2={end.x} y2={end.y} />
      })}
      {nodes.map((node) => (
        <rect
          key={node.id}
          className={`mini-node ${node.type} ${selectedIds.has(node.id) ? 'selected' : ''}`}
          x={(node.position.x - bounds.minX) * scale + offset.x}
          y={(node.position.y - bounds.minY) * scale + offset.y}
          width={Math.max(3, node.width * scale)}
          height={Math.max(3, node.height * scale)}
          rx="2"
        />
      ))}
      <rect className="mini-view" x={viewX + offset.x} y={viewY + offset.y} width={viewWidth} height={viewHeight} rx="3" />
    </svg>
  )
}
