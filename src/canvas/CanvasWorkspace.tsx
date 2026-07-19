import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FileJson, Image, Minus, MousePointer2, Plus, Redo2, RotateCcw, Settings2, SquarePen, Trash2, Type, Undo2, Video } from 'lucide-react'
import { connectionEndpoints, connectionPath, screenToWorld, sourcePort } from './geometry'
import type { CanvasNode, CanvasProject, ConnectionDraft, NodeKind, Point, SelectionBox } from './types'
import { useCanvasController } from './useCanvasController'

type CanvasWorkspaceProps = {
  project: CanvasProject
  onProjectChange: (project: CanvasProject) => void
  onBack: () => void
  onExport: (project: CanvasProject) => void
}

type DragState =
  | { type: 'pan'; start: Point; viewportStart: Point }
  | { type: 'node'; start: Point; nodeIds: string[] }
  | { type: 'resize'; start: Point; node: CanvasNode }
  | null

const nodeIcons = {
  text: Type,
  image: Image,
  video: Video,
  config: Settings2,
}

export function CanvasWorkspace({ project, onProjectChange, onBack, onExport }: CanvasWorkspaceProps) {
  const controller = useCanvasController(project, onProjectChange)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<DragState>(null)
  const connectionDraftRef = useRef<ConnectionDraft | null>(null)
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null)
  const [connectionDraft, setConnectionDraft] = useState<ConnectionDraft | null>(null)
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

  const handleCanvasPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest('[data-node-id], [data-connection-id], [data-toolbar], [data-minimap]')) return
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

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (target.closest('[data-canvas-input]')) return
    event.preventDefault()
    const factor = Math.pow(1.1, -event.deltaY / 100)
    zoomAt(clientPoint(event), controller.project.viewport.k * factor)
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

  const handleResizePointerDown = (event: React.PointerEvent<HTMLButtonElement>, node: CanvasNode) => {
    event.preventDefault()
    event.stopPropagation()
    controller.captureHistory()
    dragRef.current = { type: 'resize', start: { x: event.clientX, y: event.clientY }, node }
  }

  const startConnection = (event: React.PointerEvent<HTMLButtonElement>, nodeId: string) => {
    event.preventDefault()
    event.stopPropagation()
    controller.captureHistory()
    setConnectionDraft({ fromNodeId: nodeId, to: clientWorld(event), startScreen: { x: event.clientX, y: event.clientY } })
  }

  const finishConnectionToNode = useCallback(
    (toNodeId: string) => {
      const draft = connectionDraftRef.current
      if (!draft || draft.fromNodeId === toNodeId) return false
      controller.connectNodes(draft.fromNodeId, toNodeId)
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
        setConnectionDraft((value) => (value ? { ...value, to: clientWorld(event) } : value))
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
        controller.updateNode(
          drag.node.id,
          {
            width: Math.max(160, drag.node.width + (event.clientX - drag.start.x) / controller.project.viewport.k),
            height: Math.max(110, drag.node.height + (event.clientY - drag.start.y) / controller.project.viewport.k),
          },
          false,
        )
      }
    }
    const up = (event: PointerEvent) => {
      const draft = connectionDraftRef.current
      if (draft) {
        const targetNode = document
          .elementsFromPoint(event.clientX, event.clientY)
          .map((element) => element.closest<HTMLElement>('[data-node-id]'))
          .find((element): element is HTMLElement => Boolean(element))
        const targetNodeId = targetNode?.dataset.nodeId
        if (targetNodeId && targetNodeId !== draft.fromNodeId) {
          controller.connectNodes(draft.fromNodeId, targetNodeId)
          setConnectionDraft(null)
        } else {
          const dx = event.clientX - draft.startScreen.x
          const dy = event.clientY - draft.startScreen.y
          const isClickArmed = Math.hypot(dx, dy) < 6
          if (!isClickArmed) setConnectionDraft(null)
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
  }, [clientWorld, connectionDraft, controller, selectionBox])

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
      if (mod && event.key.toLowerCase() === 'v') controller.pasteSelection()
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
  }, [controller])

  const selectionRect = selectionBox
    ? {
        x: Math.min(selectionBox.start.x, selectionBox.current.x),
        y: Math.min(selectionBox.start.y, selectionBox.current.y),
        width: Math.abs(selectionBox.current.x - selectionBox.start.x),
        height: Math.abs(selectionBox.current.y - selectionBox.start.y),
      }
    : null

  return (
    <div className="workspace">
      <header className="topbar">
        <button className="ghost-button" onClick={onBack}>
          我的画布
        </button>
        <div>
          <h1>{controller.project.title}</h1>
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
          onPointerDown={handleCanvasPointerDown}
          onWheel={handleWheel}
        >
          <div
            className="world"
            style={{
              transform: `translate(${controller.project.viewport.x}px, ${controller.project.viewport.y}px) scale(${controller.project.viewport.k})`,
            }}
          >
            <svg className="connections-layer">
              {controller.project.connections.map((connection) => {
                const endpoints = connectionEndpoints(connection, controller.project.nodes)
                if (!endpoints) return null
                const related = controller.selectedNodeIds.includes(connection.fromNodeId) || controller.selectedNodeIds.includes(connection.toNodeId)
                const selected = controller.selectedConnectionId === connection.id
                return (
                  <path
                    key={connection.id}
                    data-connection-id={connection.id}
                    className={`connection-path ${related ? 'related' : ''} ${selected ? 'selected' : ''}`}
                    d={connectionPath(endpoints.start, endpoints.end)}
                    onPointerDown={(event) => {
                      event.stopPropagation()
                      controller.selectConnection(connection.id)
                    }}
                  />
                )
              })}
              {connectionDraft ? (
                <path
                  className="connection-path draft"
                  d={connectionPath(sourcePort(nodesById.get(connectionDraft.fromNodeId)!), connectionDraft.to)}
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
                isConnectionTarget={Boolean(connectionDraft && connectionDraft.fromNodeId !== node.id)}
              />
            ))}
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

          <MiniMap nodes={controller.project.nodes} viewport={controller.project.viewport} />
        </div>
      </div>
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
}: {
  node: CanvasNode
  selected: boolean
  related: boolean
  onPointerDown: (event: React.PointerEvent<HTMLElement>, node: CanvasNode) => void
  onResizePointerDown: (event: React.PointerEvent<HTMLButtonElement>, node: CanvasNode) => void
  onStartConnection: (event: React.PointerEvent<HTMLButtonElement>, nodeId: string) => void
  onFinishConnection: (event: React.PointerEvent<HTMLButtonElement>, nodeId: string) => void
  onUpdate: (id: string, patch: Partial<CanvasNode>, recordHistory?: boolean) => void
  onCaptureHistory: () => void
  onFinishConnectionToNode: (nodeId: string) => boolean
  isConnectionTarget: boolean
}) {
  const Icon = nodeIcons[node.type]
  return (
    <article
      data-node-id={node.id}
      className={`canvas-node ${node.type} ${selected ? 'selected' : ''} ${related ? 'related' : ''} ${isConnectionTarget ? 'connection-target' : ''}`}
      style={{ left: node.position.x, top: node.position.y, width: node.width, height: node.height }}
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
      <button className="port target-port" title="连接到此节点" data-node-control onPointerUp={(event) => onFinishConnection(event, node.id)} />
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
      <button className="port source-port" title="从此节点连线" data-node-control onPointerDown={(event) => onStartConnection(event, node.id)} />
      <button className="resize-handle" title="缩放节点" data-node-control onPointerDown={(event) => onResizePointerDown(event, node)}>
        <SquarePen size={12} />
      </button>
    </article>
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

function MiniMap({ nodes, viewport }: { nodes: CanvasNode[]; viewport: { x: number; y: number; k: number } }) {
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
  const viewX = (-viewport.x / viewport.k - bounds.minX) * scale
  const viewY = (-viewport.y / viewport.k - bounds.minY) * scale
  return (
    <svg className="mini-map" data-minimap viewBox="0 0 190 130">
      <rect x="0" y="0" width="190" height="130" rx="8" />
      {nodes.map((node) => (
        <rect
          key={node.id}
          className="mini-node"
          x={(node.position.x - bounds.minX) * scale + 10}
          y={(node.position.y - bounds.minY) * scale + 10}
          width={Math.max(3, node.width * scale)}
          height={Math.max(3, node.height * scale)}
          rx="2"
        />
      ))}
      <rect className="mini-view" x={viewX + 10} y={viewY + 10} width={Math.min(170, 120 / viewport.k)} height={Math.min(110, 80 / viewport.k)} rx="3" />
    </svg>
  )
}
