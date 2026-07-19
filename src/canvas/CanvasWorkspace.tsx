import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Copy, FileJson, Image, Minus, MousePointer2, Plus, Redo2, RotateCcw, Settings2, SquarePen, Trash2, Type, Undo2, Video } from 'lucide-react'
import { connectionEndpoints, connectionPath, screenToWorld, sourcePort, targetPort } from './geometry'
import type { CanvasNode, CanvasProject, ConnectionDraft, NodeKind, Point, SelectionBox } from './types'
import { useCanvasController } from './useCanvasController'

type CanvasWorkspaceProps = {
  project: CanvasProject
  onProjectChange: (project: CanvasProject) => void
  onBack: () => void
  onExport: (project: CanvasProject) => void
}

type ResizeCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

type DragState =
  | { type: 'pan'; start: Point; viewportStart: Point }
  | { type: 'node'; start: Point; nodeIds: string[] }
  | { type: 'resize'; start: Point; node: CanvasNode; corner: ResizeCorner }
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
  config: Settings2,
}

const resizeCorners: ResizeCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']

async function canvasNodeFromFile(file: File, position: Point): Promise<Partial<CanvasNode> & { type: NodeKind; position: Point }> {
  if (file.type.startsWith('image/')) {
    const content = await readFileAsDataUrl(file)
    const size = await readImageSize(content)
    const fit = fitMediaSize(size.width, size.height, 360, 280)
    return {
      type: 'image',
      title: file.name || '图片节点',
      position,
      width: fit.width,
      height: fit.height + 42,
      metadata: {
        content,
        status: 'success',
        mimeType: file.type,
        bytes: file.size,
        naturalWidth: size.width,
        naturalHeight: size.height,
      },
    }
  }
  if (file.type.startsWith('video/')) {
    const content = await readFileAsDataUrl(file)
    return {
      type: 'video',
      title: file.name || '视频节点',
      position,
      width: 360,
      height: 260,
      metadata: {
        content,
        status: 'success',
        mimeType: file.type,
        bytes: file.size,
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

export function CanvasWorkspace({ project, onProjectChange, onBack, onExport }: CanvasWorkspaceProps) {
  const controller = useCanvasController(project, onProjectChange)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const dragRef = useRef<DragState>(null)
  const connectionDraftRef = useRef<ConnectionDraft | null>(null)
  const pasteHandledAtRef = useRef(0)
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null)
  const [connectionDraft, setConnectionDraft] = useState<ConnectionDraft | null>(null)
  const [pendingConnectionCreate, setPendingConnectionCreate] = useState<PendingConnectionCreate>(null)
  const [nodeCreatePosition, setNodeCreatePosition] = useState<Point | null>(null)
  const [contextMenu, setContextMenu] = useState<CanvasContextMenu>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 720 })
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(project.title)
  const [spacePressed, setSpacePressed] = useState(false)
  const nodesById = useMemo(() => new Map(controller.project.nodes.map((node) => [node.id, node])), [controller.project.nodes])

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

  const findConnectionTarget = useCallback(
    (event: { clientX: number; clientY: number }, fromNodeId: string) => {
      const world = clientWorld(event)
      const padding = 32 / controller.project.viewport.k
      const target = [...controller.project.nodes]
        .reverse()
        .filter((node) => node.id !== fromNodeId)
        .map((node) => {
          const inside = world.x >= node.position.x && world.x <= node.position.x + node.width && world.y >= node.position.y && world.y <= node.position.y + node.height
          const near =
            world.x >= node.position.x - padding &&
            world.x <= node.position.x + node.width + padding &&
            world.y >= node.position.y - padding &&
            world.y <= node.position.y + node.height + padding
          if (!inside && !near) return null
          return { node, priority: inside ? 0 : 1 }
        })
        .filter((item): item is { node: CanvasNode; priority: number } => Boolean(item))
        .sort((a, b) => a.priority - b.priority)[0]?.node
      return target?.id ?? null
    },
    [clientWorld, controller.project.nodes, controller.project.viewport.k],
  )

  const zoomAt = useCallback(
    (screen: Point, nextScale: number) => {
      const viewport = controller.project.viewport
      const k = Math.min(4, Math.max(0.08, nextScale))
      const world = screenToWorld(screen, viewport)
      controller.setViewport({ x: screen.x - world.x * k, y: screen.y - world.y * k, k })
    },
    [controller],
  )

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

  const pasteClipboardData = useCallback(
    async (clipboardData: DataTransfer | null) => {
      if (!clipboardData) return false
      const files = [
        ...Array.from(clipboardData.files),
        ...Array.from(clipboardData.items)
          .filter((item) => item.kind === 'file')
          .map((item) => item.getAsFile())
          .filter((file): file is File => Boolean(file)),
      ]
      const uniqueFiles = Array.from(new Map(files.map((file) => [`${file.name}:${file.type}:${file.size}`, file])).values())
      if (uniqueFiles.length) {
        for (const file of uniqueFiles) await addClipboardFileNode(file)
        return true
      }
      return addClipboardTextNode(clipboardData.getData('text/plain'))
    },
    [addClipboardFileNode, addClipboardTextNode],
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
      return addClipboardTextNode(text)
    } catch {
      return false
    }
  }, [addClipboardFileNode, addClipboardTextNode])

  const saveTitle = () => {
    controller.renameProject(titleDraft)
    setTitleDraft(titleDraft.trim() || controller.project.title)
    setEditingTitle(false)
  }

  const handleCanvasPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest('[data-node-id], [data-connection-id], [data-toolbar], [data-minimap]')) return
    setContextMenu(null)
    setNodeCreatePosition(null)
    setPendingConnectionCreate(null)
    if (connectionDraftRef.current) {
      setConnectionDraft(null)
      return
    }
    const startWorld = clientWorld(event)
    if (event.ctrlKey || event.metaKey) {
      setSelectionBox({
        start: startWorld,
        current: startWorld,
        additive: event.shiftKey,
        initialIds: controller.selectedNodeIds,
      })
      return
    }
    controller.captureHistory()
    dragRef.current = { type: 'pan', start: { x: event.clientX, y: event.clientY }, viewportStart: { x: controller.project.viewport.x, y: controller.project.viewport.y } }
    controller.clearSelection()
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
    if ((event.target as HTMLElement).closest('[data-node-control], [data-canvas-input]')) return
    event.stopPropagation()
    const additive = event.shiftKey || event.ctrlKey || event.metaKey
    controller.selectNode(node.id, additive)
    const nodeIds = additive || controller.selectedNodeIds.includes(node.id) ? Array.from(new Set([...controller.selectedNodeIds, node.id])) : [node.id]
    controller.captureHistory()
    dragRef.current = { type: 'node', start: { x: event.clientX, y: event.clientY }, nodeIds }
  }

  const handleResizePointerDown = (event: React.PointerEvent<HTMLButtonElement>, node: CanvasNode, corner: ResizeCorner) => {
    event.preventDefault()
    event.stopPropagation()
    controller.captureHistory()
    dragRef.current = { type: 'resize', start: { x: event.clientX, y: event.clientY }, node, corner }
  }

  const startConnection = (event: React.PointerEvent<HTMLButtonElement>, nodeId: string, handleType: 'source' | 'target') => {
    event.preventDefault()
    event.stopPropagation()
    controller.captureHistory()
    setPendingConnectionCreate(null)
    setNodeCreatePosition(null)
    setContextMenu(null)
    setConnectionDraft({ nodeId, handleType, to: clientWorld(event), startScreen: { x: event.clientX, y: event.clientY } })
  }

  const finishConnectionToNode = useCallback(
    (toNodeId: string) => {
      const draft = connectionDraftRef.current
      if (!draft || draft.nodeId === toNodeId) return false
      controller.connectNodes(draft.nodeId, toNodeId, draft.handleType)
      setConnectionDraft(null)
      return true
    },
    [controller],
  )

  const finishConnection = (event: React.PointerEvent<HTMLButtonElement>, toNodeId: string) => {
    event.preventDefault()
    event.stopPropagation()
    finishConnectionToNode(toNodeId)
  }

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const drag = dragRef.current
      if (connectionDraft) {
        setConnectionDraft((value) => {
          if (!value) return value
          const targetNodeId = findConnectionTarget(event, value.nodeId)
          const targetNode = targetNodeId ? nodesById.get(targetNodeId) : null
          const to = targetNode ? (value.handleType === 'source' ? targetPort(targetNode) : sourcePort(targetNode)) : clientWorld(event)
          return { ...value, targetNodeId, to }
        })
      }
      if (selectionBox) {
        const next = { ...selectionBox, current: clientWorld(event) }
        setSelectionBox(next)
        controller.applySelectionBox(next)
      }
      if (!drag) return
      if (drag.type === 'pan') {
        controller.setViewport({
          ...controller.project.viewport,
          x: drag.viewportStart.x + event.clientX - drag.start.x,
          y: drag.viewportStart.y + event.clientY - drag.start.y,
        })
      }
      if (drag.type === 'node') {
        controller.moveNodes(drag.nodeIds, {
          x: (event.clientX - drag.start.x) / controller.project.viewport.k,
          y: (event.clientY - drag.start.y) / controller.project.viewport.k,
        })
        dragRef.current = { ...drag, start: { x: event.clientX, y: event.clientY } }
      }
      if (drag.type === 'resize') {
        const dx = (event.clientX - drag.start.x) / controller.project.viewport.k
        const dy = (event.clientY - drag.start.y) / controller.project.viewport.k
        const fromLeft = drag.corner.includes('left')
        const fromTop = drag.corner.includes('top')
        const minWidth = 160
        const minHeight = 110
        const startRight = drag.node.position.x + drag.node.width
        const startBottom = drag.node.position.y + drag.node.height
        let width = Math.max(minWidth, drag.node.width + (fromLeft ? -dx : dx))
        let height = Math.max(minHeight, drag.node.height + (fromTop ? -dy : dy))
        if (drag.node.type === 'image' || drag.node.type === 'video') {
          const ratio = (drag.node.metadata.naturalWidth || drag.node.width) / (drag.node.metadata.naturalHeight || drag.node.height || 1)
          if (Math.abs(dx) >= Math.abs(dy)) {
            height = width / ratio
          } else {
            width = height * ratio
          }
          if (height < minHeight) {
            height = minHeight
            width = height * ratio
          }
          if (width < minWidth) {
            width = minWidth
            height = width / ratio
          }
        }
        controller.updateNode(
          drag.node.id,
          {
            position: {
              x: fromLeft ? startRight - width : drag.node.position.x,
              y: fromTop ? startBottom - height : drag.node.position.y,
            },
            width,
            height,
          },
          false,
        )
      }
    }
    const up = (event: PointerEvent) => {
      const draft = connectionDraftRef.current
      if (draft) {
        const targetNodeId = draft.targetNodeId ?? findConnectionTarget(event, draft.nodeId)
        if (targetNodeId && targetNodeId !== draft.nodeId) {
          controller.connectNodes(draft.nodeId, targetNodeId, draft.handleType)
          setConnectionDraft(null)
        } else {
          const dx = event.clientX - draft.startScreen.x
          const dy = event.clientY - draft.startScreen.y
          const isClickArmed = Math.hypot(dx, dy) < 6
          if (!isClickArmed) {
            setPendingConnectionCreate({ nodeId: draft.nodeId, handleType: draft.handleType, position: clientWorld(event) })
            setConnectionDraft(null)
          }
        }
      }
      dragRef.current = null
      setSelectionBox(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [clientWorld, connectionDraft, controller, findConnectionTarget, nodesById, selectionBox])

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      const editing = ['INPUT', 'TEXTAREA'].includes(target.tagName)
      if (event.code === 'Space') setSpacePressed(true)
      if (editing) return
      const mod = event.ctrlKey || event.metaKey
      if (mod && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        controller.clearSelection()
        controller.project.nodes.forEach((node) => controller.selectNode(node.id, true))
      }
      if (mod && event.key.toLowerCase() === 'c') controller.copySelection()
      if (mod && event.key.toLowerCase() === 'v') {
        if (controller.pasteSelection()) {
          event.preventDefault()
          return
        }
        window.setTimeout(() => {
          if (Date.now() - pasteHandledAtRef.current > 250) void pasteSystemClipboard()
        }, 80)
      }
      if (mod && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault()
        controller.undo()
      }
      if ((mod && event.key.toLowerCase() === 'y') || (mod && event.shiftKey && event.key.toLowerCase() === 'z')) {
        event.preventDefault()
        controller.redo()
      }
      if (event.key === 'Delete' || event.key === 'Backspace') controller.deleteSelection()
      if (event.key === 'Escape') {
        setConnectionDraft(null)
        setPendingConnectionCreate(null)
        setNodeCreatePosition(null)
        setContextMenu(null)
        controller.clearSelection()
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
  }, [controller, pasteSystemClipboard])

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
        <aside className="canvas-toolbar" data-toolbar>
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
          onDoubleClick={handleCanvasDoubleClick}
          onWheel={handleWheel}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => void handleDrop(event)}
        >
          <div
            className="world"
            style={{
              transform: `translate(${controller.project.viewport.x}px, ${controller.project.viewport.y}px) scale(${controller.project.viewport.k})`,
            }}
          >
            <svg className="connections-layer" viewBox="-50000 -50000 100000 100000">
              {controller.project.connections.map((connection) => {
                const endpoints = connectionEndpoints(connection, controller.project.nodes)
                if (!endpoints) return null
                const related = controller.selectedNodeIds.includes(connection.fromNodeId) || controller.selectedNodeIds.includes(connection.toNodeId)
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

            {controller.project.nodes.map((node) => (
              <CanvasNodeView
                key={node.id}
                node={node}
                selected={controller.selectedNodeIds.includes(node.id)}
                related={controller.project.connections.some(
                  (connection) =>
                    controller.selectedNodeIds.includes(connection.fromNodeId) && connection.toNodeId === node.id ||
                    controller.selectedNodeIds.includes(connection.toNodeId) && connection.fromNodeId === node.id,
                )}
                onPointerDown={handleNodePointerDown}
                onResizePointerDown={handleResizePointerDown}
                onStartConnection={startConnection}
                onFinishConnection={finishConnection}
                onUpdate={controller.updateNode}
                onCaptureHistory={controller.captureHistory}
                onFinishConnectionToNode={finishConnectionToNode}
                isConnectionTarget={Boolean(connectionDraft && connectionDraft.nodeId !== node.id)}
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
            <button onClick={() => zoomAt({ x: window.innerWidth / 2, y: window.innerHeight / 2 }, controller.project.viewport.k - 0.1)}>
              <Minus size={16} />
            </button>
            <input
              aria-label="缩放"
              type="range"
              min="0.08"
              max="4"
              step="0.01"
              value={controller.project.viewport.k}
              onChange={(event) => zoomAt({ x: window.innerWidth / 2, y: window.innerHeight / 2 }, Number(event.target.value))}
            />
            <button onClick={() => zoomAt({ x: window.innerWidth / 2, y: window.innerHeight / 2 }, controller.project.viewport.k + 0.1)}>
              <Plus size={16} />
            </button>
            <button
              title="重置视图"
              onClick={() => controller.setViewport({ x: 0, y: 0, k: 1 }, true)}
            >
              <RotateCcw size={16} />
            </button>
            <span>{Math.round(controller.project.viewport.k * 100)}%</span>
          </div>

          <div className="background-panel" data-toolbar>
            {(['dots', 'lines', 'blank'] as const).map((mode) => (
              <button key={mode} className={controller.project.backgroundMode === mode ? 'active' : ''} onClick={() => controller.setBackgroundMode(mode)}>
                {mode === 'dots' ? '点阵' : mode === 'lines' ? '网格' : '空白'}
              </button>
            ))}
          </div>

          <MiniMap
            nodes={controller.project.nodes}
            viewport={controller.project.viewport}
            viewportSize={canvasSize}
            onViewportChange={controller.setViewport}
          />
        </div>
      </div>
      {contextMenu ? (
        <CanvasContextMenuView
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
          onDuplicate={() => {
            if (contextMenu.type === 'node') controller.duplicateNode(contextMenu.nodeId)
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

function CanvasNodeView({
  node,
  selected,
  related,
  onPointerDown,
  onResizePointerDown,
  onStartConnection,
  onFinishConnection,
  onUpdate,
  onCaptureHistory,
  onFinishConnectionToNode,
  isConnectionTarget,
  onContextMenu,
}: {
  node: CanvasNode
  selected: boolean
  related: boolean
  onPointerDown: (event: React.PointerEvent<HTMLElement>, node: CanvasNode) => void
  onResizePointerDown: (event: React.PointerEvent<HTMLButtonElement>, node: CanvasNode, corner: ResizeCorner) => void
  onStartConnection: (event: React.PointerEvent<HTMLButtonElement>, nodeId: string, handleType: 'source' | 'target') => void
  onFinishConnection: (event: React.PointerEvent<HTMLButtonElement>, nodeId: string) => void
  onUpdate: (id: string, patch: Partial<CanvasNode>, recordHistory?: boolean) => void
  onCaptureHistory: () => void
  onFinishConnectionToNode: (nodeId: string) => boolean
  isConnectionTarget: boolean
  onContextMenu: (event: React.MouseEvent<HTMLElement>, nodeId: string) => void
}) {
  const Icon = nodeIcons[node.type]
  return (
    <article
      data-node-id={node.id}
      className={`canvas-node ${node.type} ${selected ? 'selected' : ''} ${related ? 'related' : ''} ${isConnectionTarget ? 'connection-target' : ''}`}
      style={{ left: node.position.x, top: node.position.y, width: node.width, height: node.height }}
      onContextMenu={(event) => onContextMenu(event, node.id)}
      onPointerDown={(event) => {
        if (isConnectionTarget && !(event.target as HTMLElement).closest('[data-canvas-input]')) {
          event.preventDefault()
          event.stopPropagation()
          onFinishConnectionToNode(node.id)
          return
        }
        onPointerDown(event, node)
      }}
    >
      <button
        className="port target-port"
        title="从此输入端反向连线"
        data-node-control
        onPointerDown={(event) => onStartConnection(event, node.id, 'target')}
        onPointerUp={(event) => onFinishConnection(event, node.id)}
      />
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
      <NodeBody node={node} onUpdate={onUpdate} onCaptureHistory={onCaptureHistory} />
      <button className="port source-port" title="从此节点连线" data-node-control onPointerDown={(event) => onStartConnection(event, node.id, 'source')} />
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
  position,
  onCreate,
  onClose,
}: {
  title: string
  position: Point
  onCreate: (type: NodeKind) => void
  onClose: () => void
}) {
  return (
    <div className="node-create-menu" data-toolbar style={{ left: position.x, top: position.y }} onPointerDown={(event) => event.stopPropagation()}>
      <div>{title}</div>
      {(['text', 'image', 'video', 'config'] as const).map((type) => (
        <button key={type} onClick={() => onCreate(type)}>
          {type === 'text' ? '文本节点' : type === 'image' ? '图片节点' : type === 'video' ? '视频节点' : '配置节点'}
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
  onClose,
  onDuplicate,
  onDelete,
}: {
  menu: NonNullable<CanvasContextMenu>
  onClose: () => void
  onDuplicate: () => void
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
        <button onClick={onDuplicate}>
          <Copy size={15} /> 复制节点
        </button>
      ) : null}
      <button className="danger" onClick={onDelete}>
        <Trash2 size={15} /> 删除{menu.type === 'node' ? '节点' : '连线'}
      </button>
    </div>
  )
}

function NodeBody({
  node,
  onUpdate,
  onCaptureHistory,
}: {
  node: CanvasNode
  onUpdate: (id: string, patch: Partial<CanvasNode>, recordHistory?: boolean) => void
  onCaptureHistory: () => void
}) {
  if (node.type === 'image') {
    return (
      <div className="node-body media-body">
        {node.metadata.content ? <img src={node.metadata.content} alt={node.title} /> : <span>图片结果或参考图会显示在这里</span>}
      </div>
    )
  }
  if (node.type === 'video') {
    return (
      <div className="node-body media-body">
        {node.metadata.content ? <video src={node.metadata.content} controls /> : <span>视频结果、首帧或参考视频会显示在这里</span>}
      </div>
    )
  }
  if (node.type === 'config') {
    return (
      <div className="node-body config-body">
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

function MiniMap({
  nodes,
  viewport,
  viewportSize,
  onViewportChange,
}: {
  nodes: CanvasNode[]
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
  const viewX = (-viewport.x / viewport.k - bounds.minX) * scale
  const viewY = (-viewport.y / viewport.k - bounds.minY) * scale
  const viewWidth = Math.min(170, (viewportSize.width / viewport.k) * scale)
  const viewHeight = Math.min(110, (viewportSize.height / viewport.k) * scale)

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
      {nodes.map((node) => (
        <rect
          key={node.id}
          className="mini-node"
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
