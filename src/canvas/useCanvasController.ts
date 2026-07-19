import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BackgroundMode, CanvasConnection, CanvasNode, CanvasProject, NodeKind, Point, SelectionBox, Snapshot, Viewport } from './types'
import { rectsIntersect } from './geometry'
import { addConnectionToProject, deleteSelectionFromProject } from './document'

const createId = () => crypto.randomUUID()

const nodeDefaults: Record<NodeKind, { title: string; width: number; height: number; content: string }> = {
  text: { title: '文本节点', width: 260, height: 180, content: '写下提示词、分镜说明或生成备注。' },
  image: { title: '图片节点', width: 280, height: 220, content: '' },
  video: { title: '视频节点', width: 320, height: 220, content: '' },
  config: { title: '配置节点', width: 260, height: 190, content: '模型、比例、数量等生成参数会放在这里。' },
}

function createNode(type: NodeKind, position: Point, patch: Partial<CanvasNode> = {}): CanvasNode {
  const defaults = nodeDefaults[type]
  return {
    ...patch,
    id: patch.id ?? createId(),
    type,
    title: patch.title ?? defaults.title,
    position: patch.position ?? position,
    width: patch.width ?? defaults.width,
    height: patch.height ?? defaults.height,
    metadata: {
      content: defaults.content,
      status: 'idle',
      count: type === 'config' ? 1 : undefined,
      size: type === 'config' ? '1024x1024' : undefined,
      ...patch.metadata,
    },
  }
}

function snapshot(project: CanvasProject): Snapshot {
  return {
    nodes: project.nodes,
    connections: project.connections,
    backgroundMode: project.backgroundMode,
    viewport: project.viewport,
  }
}

function applySnapshot(project: CanvasProject, next: Snapshot): CanvasProject {
  return {
    ...project,
    ...next,
    updatedAt: new Date().toISOString(),
  }
}

export function useCanvasController(project: CanvasProject, onChange: (project: CanvasProject) => void) {
  const [localProject, setLocalProject] = useState(project)
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null)
  const [history, setHistory] = useState<{ past: Snapshot[]; future: Snapshot[] }>({ past: [], future: [] })
  const clipboardRef = useRef<{ nodes: CanvasNode[]; connections: CanvasConnection[] } | null>(null)
  const activeProjectIdRef = useRef(project.id)

  useEffect(() => {
    setLocalProject(project)
    if (activeProjectIdRef.current !== project.id) {
      activeProjectIdRef.current = project.id
      setSelectedNodeIds([])
      setSelectedConnectionId(null)
      setHistory({ past: [], future: [] })
    }
  }, [project])

  const captureHistory = useCallback(() => {
    setHistory((value) => ({ past: [...value.past.slice(-79), snapshot(localProject)], future: [] }))
  }, [localProject])

  const commit = useCallback(
    (mutator: (project: CanvasProject) => CanvasProject, options: { history?: boolean } = { history: true }) => {
      setLocalProject((current) => {
        const changed = mutator(current)
        if (changed === current) return current
        const next = {
          ...changed,
          updatedAt: new Date().toISOString(),
        }
        if (options.history !== false) {
          setHistory((value) => ({ past: [...value.past.slice(-79), snapshot(current)], future: [] }))
        }
        queueMicrotask(() => onChange(next))
        return next
      })
    },
    [onChange],
  )

  const addNode = useCallback(
    (type: NodeKind, position: Point, patch: Partial<CanvasNode> = {}) => {
      const node = createNode(type, position, patch)
      commit((current) => ({ ...current, nodes: [...current.nodes, node] }))
      setSelectedNodeIds([node.id])
      setSelectedConnectionId(null)
      return node
    },
    [commit],
  )

  const addConnectedNode = useCallback(
    (type: NodeKind, nodeId: string, handleType: 'source' | 'target', position: Point) => {
      const node = createNode(type, position)
      const fromNodeId = handleType === 'source' ? nodeId : node.id
      const toNodeId = handleType === 'source' ? node.id : nodeId
      commit((current) =>
        addConnectionToProject(
          { ...current, nodes: [...current.nodes, node] },
          { id: createId(), fromNodeId, toNodeId },
        ),
      )
      setSelectedNodeIds([node.id])
      setSelectedConnectionId(null)
      return node
    },
    [commit],
  )

  const duplicateNode = useCallback(
    (id: string) => {
      const source = localProject.nodes.find((node) => node.id === id)
      if (!source) return
      const node = {
        ...source,
        id: createId(),
        title: `${source.title} 副本`,
        position: { x: source.position.x + 36, y: source.position.y + 36 },
        metadata: { ...source.metadata },
      }
      commit((current) => ({ ...current, nodes: [...current.nodes, node] }))
      setSelectedNodeIds([node.id])
      setSelectedConnectionId(null)
    },
    [commit, localProject.nodes],
  )

  const updateNode = useCallback(
    (id: string, patch: Partial<CanvasNode>, recordHistory = true) => {
      commit(
        (current) => ({
          ...current,
          nodes: current.nodes.map((node) => (node.id === id ? { ...node, ...patch, metadata: { ...node.metadata, ...patch.metadata } } : node)),
        }),
        { history: recordHistory },
      )
    },
    [commit],
  )

  const renameProject = useCallback(
    (title: string) => {
      const normalized = title.trim()
      if (!normalized) return
      commit((current) => (current.title === normalized ? current : { ...current, title: normalized }), { history: false })
    },
    [commit],
  )

  const moveNodes = useCallback(
    (ids: string[], delta: Point, recordHistory = false) => {
      const selected = new Set(ids)
      commit(
        (current) => ({
          ...current,
          nodes: current.nodes.map((node) =>
            selected.has(node.id)
              ? {
                  ...node,
                  position: { x: node.position.x + delta.x, y: node.position.y + delta.y },
                }
              : node,
          ),
        }),
        { history: recordHistory },
      )
    },
    [commit],
  )

  const deleteSelection = useCallback(() => {
    commit((current) => deleteSelectionFromProject(current, selectedNodeIds, selectedConnectionId))
    setSelectedNodeIds([])
    setSelectedConnectionId(null)
  }, [commit, selectedConnectionId, selectedNodeIds])

  const deleteNode = useCallback(
    (id: string) => {
      commit((current) => deleteSelectionFromProject(current, [id], null))
      setSelectedNodeIds((current) => current.filter((nodeId) => nodeId !== id))
      setSelectedConnectionId(null)
    },
    [commit],
  )

  const deleteConnection = useCallback(
    (id: string) => {
      commit((current) => deleteSelectionFromProject(current, [], id))
      setSelectedConnectionId((current) => (current === id ? null : current))
    },
    [commit],
  )

  const connectNodes = useCallback(
    (nodeId: string, targetNodeId: string, handleType: 'source' | 'target' = 'source') => {
      commit((current) => {
        const fromNodeId = handleType === 'source' ? nodeId : targetNodeId
        const toNodeId = handleType === 'source' ? targetNodeId : nodeId
        return addConnectionToProject(current, { id: createId(), fromNodeId, toNodeId })
      })
    },
    [commit],
  )

  const setViewport = useCallback(
    (viewport: Viewport, recordHistory = false) => {
      commit((current) => ({ ...current, viewport }), { history: recordHistory })
    },
    [commit],
  )

  const setBackgroundMode = useCallback(
    (backgroundMode: BackgroundMode) => {
      commit((current) => ({ ...current, backgroundMode }))
    },
    [commit],
  )

  const selectNode = useCallback((id: string, additive: boolean) => {
    setSelectedConnectionId(null)
    setSelectedNodeIds((current) => {
      if (!additive) return [id]
      return current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    })
  }, [])

  const selectConnection = useCallback((id: string) => {
    setSelectedNodeIds([])
    setSelectedConnectionId(id)
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedNodeIds([])
    setSelectedConnectionId(null)
  }, [])

  const applySelectionBox = useCallback(
    (box: SelectionBox) => {
      const x = Math.min(box.start.x, box.current.x)
      const y = Math.min(box.start.y, box.current.y)
      const width = Math.abs(box.current.x - box.start.x)
      const height = Math.abs(box.current.y - box.start.y)
      const hits = localProject.nodes
        .filter((node) => rectsIntersect({ x, y, width, height }, { x: node.position.x, y: node.position.y, width: node.width, height: node.height }))
        .map((node) => node.id)
      setSelectedNodeIds(box.additive ? Array.from(new Set([...box.initialIds, ...hits])) : hits)
      setSelectedConnectionId(null)
    },
    [localProject.nodes],
  )

  const copySelection = useCallback(() => {
    const selected = new Set(selectedNodeIds)
    clipboardRef.current = {
      nodes: localProject.nodes.filter((node) => selected.has(node.id)),
      connections: localProject.connections.filter((connection) => selected.has(connection.fromNodeId) && selected.has(connection.toNodeId)),
    }
  }, [localProject.connections, localProject.nodes, selectedNodeIds])

  const pasteSelection = useCallback(() => {
    const clipboard = clipboardRef.current
    if (!clipboard || clipboard.nodes.length === 0) return false
    const idMap = new Map(clipboard.nodes.map((node) => [node.id, createId()]))
    const nodes = clipboard.nodes.map((node) => ({
      ...node,
      id: idMap.get(node.id)!,
      title: `${node.title} 副本`,
      position: { x: node.position.x + 36, y: node.position.y + 36 },
    }))
    const connections = clipboard.connections.map((connection) => ({
      id: createId(),
      fromNodeId: idMap.get(connection.fromNodeId)!,
      toNodeId: idMap.get(connection.toNodeId)!,
    }))
    commit((current) => ({
      ...current,
      nodes: [...current.nodes, ...nodes],
      connections: [...current.connections, ...connections],
    }))
    setSelectedNodeIds(nodes.map((node) => node.id))
    setSelectedConnectionId(null)
    return true
  }, [commit])

  const undo = useCallback(() => {
    setHistory((value) => {
      const previous = value.past.at(-1)
      if (!previous) return value
      const nextProject = applySnapshot(localProject, previous)
      setLocalProject(nextProject)
      queueMicrotask(() => onChange(nextProject))
      return { past: value.past.slice(0, -1), future: [snapshot(localProject), ...value.future] }
    })
  }, [localProject, onChange])

  const redo = useCallback(() => {
    setHistory((value) => {
      const next = value.future[0]
      if (!next) return value
      const nextProject = applySnapshot(localProject, next)
      setLocalProject(nextProject)
      queueMicrotask(() => onChange(nextProject))
      return { past: [...value.past, snapshot(localProject)], future: value.future.slice(1) }
    })
  }, [localProject, onChange])

  const selectedNodes = useMemo(() => localProject.nodes.filter((node) => selectedNodeIds.includes(node.id)), [localProject.nodes, selectedNodeIds])

  return {
    project: localProject,
    selectedNodeIds,
    selectedNodes,
    selectedConnectionId,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    addNode,
    addConnectedNode,
    duplicateNode,
    updateNode,
    renameProject,
    moveNodes,
    deleteSelection,
    deleteNode,
    deleteConnection,
    connectNodes,
    setViewport,
    setBackgroundMode,
    selectNode,
    selectConnection,
    clearSelection,
    applySelectionBox,
    copySelection,
    pasteSelection,
    captureHistory,
    undo,
    redo,
  }
}
