import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BackgroundMode, CanvasNode, CanvasProject, NodeKind, Point, SelectionBox, Snapshot, Viewport } from './types'
import { rectsIntersect } from './geometry'
import { addConnectionToProject, copySelectionToClipboard, deleteSelectionFromProject, expandNodeIdsForMovement, nextNodeSelection, normalizeConnectionForProject, pasteClipboardIntoProject, syncNodeGroupMembership, type CanvasClipboard } from './document'
import { createCanvasNode } from './nodeFactory'

const createId = () => crypto.randomUUID()

function createNode(type: NodeKind, position: Point, patch: Partial<CanvasNode> = {}): CanvasNode {
  return createCanvasNode(type, position, { createId, patch })
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
  const clipboardRef = useRef<CanvasClipboard | null>(null)
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
    (type: NodeKind, nodeId: string, handleType: 'source' | 'target', position: Point, patch: Partial<CanvasNode> = {}) => {
      const node = createNode(type, position, patch)
      commit((current) => {
        const next = { ...current, nodes: [...current.nodes, node] }
        const connection = normalizeConnectionForProject(next, nodeId, node.id, handleType)
        return connection ? addConnectionToProject(next, { id: createId(), ...connection }) : next
      })
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
      commit(
        (current) => {
          const selected = new Set(expandNodeIdsForMovement(current.nodes, ids))
          return {
            ...current,
            nodes: current.nodes.map((node) =>
              selected.has(node.id)
                ? {
                    ...node,
                    position: { x: node.position.x + delta.x, y: node.position.y + delta.y },
                  }
                : node,
            ),
          }
        },
        { history: recordHistory },
      )
    },
    [commit],
  )

  const syncDraggedNodeGroups = useCallback(
    (ids: string[]) => {
      commit((current) => syncNodeGroupMembership(current, ids), { history: false })
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
        const connection = normalizeConnectionForProject(current, nodeId, targetNodeId, handleType)
        return connection ? addConnectionToProject(current, { id: createId(), ...connection }) : current
      })
    },
    [commit],
  )

  const groupSelection = useCallback(() => {
    const selectedNodes = localProject.nodes.filter((node) => selectedNodeIds.includes(node.id) && node.type !== 'group')
    if (selectedNodes.length < 2) return
    const paddingX = 34
    const paddingTop = 58
    const paddingBottom = 34
    const left = Math.min(...selectedNodes.map((node) => node.position.x))
    const top = Math.min(...selectedNodes.map((node) => node.position.y))
    const right = Math.max(...selectedNodes.map((node) => node.position.x + node.width))
    const bottom = Math.max(...selectedNodes.map((node) => node.position.y + node.height))
    const group = createNode('group', { x: left - paddingX, y: top - paddingTop }, {
      title: `分组 ${selectedNodes.length}`,
      width: right - left + paddingX * 2,
      height: bottom - top + paddingTop + paddingBottom,
      metadata: { content: '', status: 'idle' },
    })
    const childIds = new Set(selectedNodes.map((node) => node.id))
    commit((current) => ({
      ...current,
      nodes: [
        group,
        ...current.nodes.map((node) => (
          childIds.has(node.id)
            ? { ...node, metadata: { ...node.metadata, groupId: group.id } }
            : node
        )),
      ],
    }))
    setSelectedNodeIds([group.id])
    setSelectedConnectionId(null)
  }, [commit, localProject.nodes, selectedNodeIds])

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
    setSelectedNodeIds((current) => nextNodeSelection(current, id, additive))
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
    const clipboard = copySelectionToClipboard(localProject, selectedNodeIds)
    clipboardRef.current = clipboard
    return clipboard
  }, [localProject, selectedNodeIds])

  const pasteClipboard = useCallback((clipboard: CanvasClipboard | null, targetCenter?: Point) => {
    if (!clipboard?.nodes.length) return false
    commit((current) => {
      const pasted = pasteClipboardIntoProject(current, clipboard, createId, targetCenter)
      if (!pasted) return current
      queueMicrotask(() => {
        setSelectedNodeIds(pasted.nodeIds)
        setSelectedConnectionId(null)
      })
      return pasted.project
    })
    return true
  }, [commit])

  const pasteSelection = useCallback((targetCenter?: Point) => pasteClipboard(clipboardRef.current, targetCenter), [pasteClipboard])

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
    groupSelection,
    syncDraggedNodeGroups,
    setViewport,
    setBackgroundMode,
    selectNode,
    selectConnection,
    clearSelection,
    applySelectionBox,
    copySelection,
    pasteClipboard,
    pasteSelection,
    captureHistory,
    undo,
    redo,
  }
}
