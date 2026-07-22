import { describe, expect, it } from 'vitest'
import { addConnectionToProject, copySelectionToClipboard, deleteSelectionFromProject, expandNodeIdsForMovement, expandNodeIdsWithSplitChildren, findConnectionDropTarget, findContainingGroupId, findGroupDropTarget, getConnectionNodePair, getNodeRelations, groupChildIdsForNode, isHiddenSplitChild, isSplitConnectionHidden, nextNodeSelection, nodeBounds, normalizeConnectionForProject, parseCanvasClipboardText, pasteClipboardIntoProject, resolveConnectionToNode, serializeCanvasClipboard, snapNodesIntoGroup, splitChildIdsForNode, syncNodeGroupMembership } from './document'
import type { CanvasNode, CanvasProject } from './types'

const baseNode = (id: string): CanvasNode => ({
  id,
  type: 'text',
  title: id,
  position: { x: 0, y: 0 },
  width: 100,
  height: 80,
  metadata: {},
})

const configNode = (id: string): CanvasNode => ({
  ...baseNode(id),
  type: 'config',
})

const imageNode = (id: string): CanvasNode => ({
  ...baseNode(id),
  type: 'image',
})

const groupNode = (id: string): CanvasNode => ({
  ...baseNode(id),
  type: 'group',
  width: 300,
  height: 240,
})

const project: CanvasProject = {
  id: 'project-1',
  title: '测试画布',
  createdAt: '2026-07-19T00:00:00.000Z',
  updatedAt: '2026-07-19T00:00:00.000Z',
  nodes: [baseNode('a'), baseNode('b'), baseNode('c')],
  connections: [
    { id: 'ab', fromNodeId: 'a', toNodeId: 'b' },
    { id: 'bc', fromNodeId: 'b', toNodeId: 'c' },
    { id: 'ca', fromNodeId: 'c', toNodeId: 'a' },
  ],
  backgroundMode: 'dots',
  viewport: { x: 0, y: 0, k: 1 },
}

describe('canvas document operations', () => {
  it('keeps multi-selection stable while supporting additive toggles', () => {
    expect(nextNodeSelection(['a', 'b'], 'a', false)).toEqual(['a', 'b'])
    expect(nextNodeSelection(['a', 'b'], 'c', false)).toEqual(['c'])
    expect(nextNodeSelection(['a', 'b'], 'b', true)).toEqual(['a'])
    expect(nextNodeSelection(['a'], 'b', true)).toEqual(['a', 'b'])
  })

  it('deletes selected nodes and all connected edges', () => {
    const next = deleteSelectionFromProject(project, ['b'], null)

    expect(next.nodes.map((node) => node.id)).toEqual(['a', 'c'])
    expect(next.connections.map((connection) => connection.id)).toEqual(['ca'])
  })

  it('treats split output children as a collapsible result group', () => {
    const source = {
      ...project,
      nodes: [
        { ...imageNode('root'), metadata: { splitChildrenCollapsed: true } },
        { ...imageNode('child-2'), metadata: { splitSourceNodeId: 'root', splitOutputIndex: 2 } },
        { ...imageNode('child-1'), metadata: { splitSourceNodeId: 'root', splitOutputIndex: 1 } },
      ],
      connections: [
        { id: 'root-child-1', fromNodeId: 'root', toNodeId: 'child-1' },
        { id: 'child-2-a', fromNodeId: 'child-2', toNodeId: 'a' },
      ],
    }

    expect(splitChildIdsForNode(source.nodes, 'root')).toEqual(['child-1', 'child-2'])
    expect(expandNodeIdsWithSplitChildren(source.nodes, ['root'])).toEqual(['root', 'child-1', 'child-2'])
    expect(isHiddenSplitChild(source.nodes[1], source.nodes)).toBe(true)
    expect(isSplitConnectionHidden(source.connections[0], source.nodes)).toBe(true)
    expect(isSplitConnectionHidden(source.connections[1], source.nodes)).toBe(true)
  })

  it('deletes split output children with their source node', () => {
    const source = {
      ...project,
      nodes: [
        imageNode('root'),
        { ...imageNode('child'), metadata: { splitSourceNodeId: 'root', splitOutputIndex: 0 } },
        imageNode('other'),
      ],
      connections: [
        { id: 'root-child', fromNodeId: 'root', toNodeId: 'child' },
        { id: 'child-other', fromNodeId: 'child', toNodeId: 'other' },
      ],
    }

    const next = deleteSelectionFromProject(source, ['root'], null)

    expect(next.nodes.map((node) => node.id)).toEqual(['other'])
    expect(next.connections).toEqual([])
  })

  it('expands group nodes for movement without deleting their children', () => {
    const source = {
      ...project,
      nodes: [
        groupNode('group'),
        { ...baseNode('a'), metadata: { groupId: 'group' } },
        { ...baseNode('b'), metadata: { groupId: 'group' } },
        baseNode('outside'),
      ],
      connections: [],
    }

    expect(groupChildIdsForNode(source.nodes, 'group')).toEqual(['a', 'b'])
    expect(expandNodeIdsForMovement(source.nodes, ['group'])).toEqual(['group', 'a', 'b'])

    const next = deleteSelectionFromProject(source, ['group'], null)

    expect(next.nodes.map((node) => node.id)).toEqual(['a', 'b', 'outside'])
    expect(next.nodes.find((node) => node.id === 'a')?.metadata.groupId).toBeUndefined()
    expect(next.nodes.find((node) => node.id === 'b')?.metadata.groupId).toBeUndefined()
  })

  it('syncs moved nodes into and out of groups by their center point', () => {
    const source = {
      ...project,
      nodes: [
        { ...groupNode('group'), position: { x: 100, y: 100 }, width: 300, height: 240 },
        { ...baseNode('inside'), position: { x: 150, y: 150 } },
        { ...baseNode('outside'), position: { x: 520, y: 160 }, metadata: { groupId: 'group' } },
      ],
      connections: [],
    }

    expect(findContainingGroupId(source.nodes[1], source.nodes)).toBe('group')

    const movedInside = syncNodeGroupMembership(source, ['inside'])
    const movedOutside = syncNodeGroupMembership(source, ['outside'])

    expect(movedInside.nodes.find((node) => node.id === 'inside')?.metadata.groupId).toBe('group')
    expect(movedOutside.nodes.find((node) => node.id === 'outside')?.metadata.groupId).toBeUndefined()
  })

  it('detects group drop targets and snaps moved nodes inside group padding', () => {
    const source = {
      ...project,
      nodes: [
        { ...groupNode('group'), position: { x: 100, y: 100 }, width: 300, height: 240 },
        { ...baseNode('moving'), position: { x: 340, y: 250 }, width: 100, height: 80 },
        { ...baseNode('other'), position: { x: 520, y: 160 } },
      ],
      connections: [],
    }

    const group = source.nodes[0]

    expect(nodeBounds([source.nodes[1]])).toEqual({ left: 340, top: 250, right: 440, bottom: 330 })
    expect(findGroupDropTarget(source.nodes, ['moving'])?.id).toBe('group')

    const snapped = snapNodesIntoGroup(source, ['moving'], group)
    const moving = snapped.nodes.find((node) => node.id === 'moving')!

    expect(moving.metadata.groupId).toBe('group')
    expect(moving.position.x).toBe(276)
    expect(moving.position.y).toBe(236)
    expect(moving.position.x + moving.width).toBeLessThanOrEqual(group.position.x + group.width - 24)
    expect(moving.position.y + moving.height).toBeLessThanOrEqual(group.position.y + group.height - 24)
  })

  it('pastes copied groups around a target center and remaps internal relations', () => {
    const source = {
      ...project,
      nodes: [
        { ...groupNode('group'), position: { x: 100, y: 100 }, width: 300, height: 240 },
        { ...baseNode('a'), position: { x: 150, y: 150 }, metadata: { groupId: 'group' } },
        { ...baseNode('b'), position: { x: 280, y: 160 }, metadata: { groupId: 'group' } },
        baseNode('outside'),
      ],
      connections: [{ id: 'a-b', fromNodeId: 'a', toNodeId: 'b' }],
    }
    const clipboard = copySelectionToClipboard(source, ['group', 'a', 'b'])
    const ids = ['group-copy', 'a-copy', 'b-copy', 'a-b-copy']
    const pasted = pasteClipboardIntoProject(source, clipboard, () => ids.shift()!, { x: 1000, y: 500 })

    expect(pasted?.nodeIds).toEqual(['group-copy', 'a-copy', 'b-copy'])
    expect(pasted?.project.nodes.find((node) => node.id === 'group-copy')?.position).toEqual({ x: 850, y: 380 })
    expect(pasted?.project.nodes.find((node) => node.id === 'a-copy')?.metadata.groupId).toBe('group-copy')
    expect(pasted?.project.nodes.find((node) => node.id === 'b-copy')?.metadata.groupId).toBe('group-copy')
    expect(pasted?.project.connections.at(-1)).toEqual({ id: 'a-b-copy', fromNodeId: 'a-copy', toNodeId: 'b-copy' })
  })

  it('clears stale group membership when only group children are pasted', () => {
    const source = {
      ...project,
      nodes: [
        { ...groupNode('group'), position: { x: 100, y: 100 }, width: 300, height: 240 },
        { ...baseNode('a'), position: { x: 150, y: 150 }, metadata: { groupId: 'group' } },
      ],
      connections: [],
    }
    const clipboard = copySelectionToClipboard(source, ['a'])
    const pasted = pasteClipboardIntoProject(source, clipboard, () => 'a-copy')
    const node = pasted?.project.nodes.find((item) => item.id === 'a-copy')

    expect(node?.position).toEqual({ x: 186, y: 186 })
    expect(node?.metadata.groupId).toBeUndefined()
  })

  it('remaps split output relationships when copied with their source node', () => {
    const source = {
      ...project,
      nodes: [
        { ...imageNode('root'), position: { x: 100, y: 100 }, metadata: { splitChildrenCollapsed: true } },
        { ...imageNode('child'), position: { x: 240, y: 100 }, metadata: { splitSourceNodeId: 'root', splitOutputIndex: 0 } },
      ],
      connections: [],
    }
    const clipboard = copySelectionToClipboard(source, ['root', 'child'])
    const ids = ['root-copy', 'child-copy']
    const pasted = pasteClipboardIntoProject(source, clipboard, () => ids.shift()!)
    const child = pasted?.project.nodes.find((node) => node.id === 'child-copy')

    expect(child?.metadata.splitSourceNodeId).toBe('root-copy')
    expect(child?.metadata.splitOutputIndex).toBe(0)
    expect(isHiddenSplitChild(child!, pasted!.project.nodes)).toBe(true)
  })

  it('clears stale split output relationships when only split children are pasted', () => {
    const source = {
      ...project,
      nodes: [
        { ...imageNode('root'), position: { x: 100, y: 100 }, metadata: { splitChildrenCollapsed: true } },
        { ...imageNode('child'), position: { x: 240, y: 100 }, metadata: { splitSourceNodeId: 'root', splitOutputIndex: 0 } },
      ],
      connections: [],
    }
    const clipboard = copySelectionToClipboard(source, ['child'])
    const pasted = pasteClipboardIntoProject(source, clipboard, () => 'child-copy')
    const child = pasted?.project.nodes.find((node) => node.id === 'child-copy')

    expect(child?.metadata.splitSourceNodeId).toBeUndefined()
    expect(child?.metadata.splitOutputIndex).toBeUndefined()
    expect(isHiddenSplitChild(child!, pasted!.project.nodes)).toBe(false)
  })

  it('serializes canvas clipboard fragments for cross-session paste', () => {
    const source = {
      ...project,
      nodes: [
        { ...groupNode('group'), position: { x: 100, y: 100 }, width: 300, height: 240 },
        { ...baseNode('a'), position: { x: 150, y: 150 }, metadata: { groupId: 'group' } },
        { ...baseNode('b'), position: { x: 280, y: 160 }, metadata: { groupId: 'group' } },
      ],
      connections: [{ id: 'a-b', fromNodeId: 'a', toNodeId: 'b' }],
    }
    const clipboard = copySelectionToClipboard(source, ['group', 'a', 'b'])
    const serialized = serializeCanvasClipboard(clipboard)
    const ids = ['group-copy', 'a-copy', 'b-copy', 'a-b-copy']
    const parsed = parseCanvasClipboardText(serialized)
    const pasted = pasteClipboardIntoProject(project, parsed, () => ids.shift()!, { x: 900, y: 500 })

    expect(serialized).toContain('"type":"canvas-clipboard"')
    expect(parsed?.nodes.map((node) => node.id)).toEqual(['group', 'a', 'b'])
    expect(pasted?.project.nodes.find((node) => node.id === 'a-copy')?.metadata.groupId).toBe('group-copy')
    expect(pasted?.project.connections.at(-1)).toEqual({ id: 'a-b-copy', fromNodeId: 'a-copy', toNodeId: 'b-copy' })
  })

  it('rejects ordinary text and incomplete canvas clipboard fragments', () => {
    expect(parseCanvasClipboardText('hello world')).toBeNull()
    expect(parseCanvasClipboardText(JSON.stringify({ app: 'artboard-flow', type: 'canvas-clipboard', version: 1, clipboard: { nodes: [], connections: [] } }))).toBeNull()
    expect(serializeCanvasClipboard(null)).toBe('')
  })

  it('deletes a selected connection without removing nodes', () => {
    const next = deleteSelectionFromProject(project, [], 'bc')

    expect(next.nodes).toHaveLength(3)
    expect(next.connections.map((connection) => connection.id)).toEqual(['ab', 'ca'])
  })

  it('lists incoming and outgoing node relations', () => {
    const source = {
      ...project,
      connections: [...project.connections, { id: 'missing', fromNodeId: 'missing', toNodeId: 'b' }],
    }

    const relations = getNodeRelations(source, 'b')

    expect(relations.incoming.map((item) => [item.connectionId, item.node.id])).toEqual([['ab', 'a']])
    expect(relations.outgoing.map((item) => [item.connectionId, item.node.id])).toEqual([['bc', 'c']])
  })

  it('returns both endpoint nodes for a connection', () => {
    const pair = getConnectionNodePair(project, 'ab')

    expect(pair?.connection.id).toBe('ab')
    expect(pair?.from.id).toBe('a')
    expect(pair?.to.id).toBe('b')
    expect(getConnectionNodePair(project, 'missing')).toBeNull()
    expect(getConnectionNodePair({ ...project, nodes: project.nodes.filter((node) => node.id !== 'a') }, 'ab')).toBeNull()
  })

  it('removes deleted node references from config composers', () => {
    const source = {
      ...project,
      nodes: [
        baseNode('prompt'),
        baseNode('keep'),
        { ...configNode('config'), metadata: { composerContent: '生成 @[node:prompt] 并保留 @[node:keep]' } },
      ],
      connections: [
        { id: 'prompt-config', fromNodeId: 'prompt', toNodeId: 'config' },
        { id: 'keep-config', fromNodeId: 'keep', toNodeId: 'config' },
      ],
    }

    const next = deleteSelectionFromProject(source, ['prompt'], null)
    const config = next.nodes.find((node) => node.id === 'config')

    expect(config?.metadata.composerContent).toBe('生成 并保留 @[node:keep]')
  })

  it('removes disconnected input references only from the target config composer', () => {
    const source = {
      ...project,
      nodes: [
        baseNode('prompt'),
        { ...configNode('config-a'), metadata: { composerContent: 'A @[node:prompt]' } },
        { ...configNode('config-b'), metadata: { composerContent: 'B @[node:prompt]' } },
      ],
      connections: [
        { id: 'prompt-config-a', fromNodeId: 'prompt', toNodeId: 'config-a' },
        { id: 'prompt-config-b', fromNodeId: 'prompt', toNodeId: 'config-b' },
      ],
    }

    const next = deleteSelectionFromProject(source, [], 'prompt-config-a')
    const configA = next.nodes.find((node) => node.id === 'config-a')
    const configB = next.nodes.find((node) => node.id === 'config-b')

    expect(configA?.metadata.composerContent).toBe('A')
    expect(configB?.metadata.composerContent).toBe('B @[node:prompt]')
  })

  it('adds a new connection when both nodes exist', () => {
    const source = { ...project, connections: [] }
    const next = addConnectionToProject(source, { id: 'new-edge', fromNodeId: 'a', toNodeId: 'b' })

    expect(next.connections).toEqual([{ id: 'new-edge', fromNodeId: 'a', toNodeId: 'b' }])
  })

  it('prevents duplicate, self, and missing-node connections', () => {
    const duplicate = addConnectionToProject(project, { id: 'duplicate', fromNodeId: 'a', toNodeId: 'b' })
    const self = addConnectionToProject(project, { id: 'self', fromNodeId: 'a', toNodeId: 'a' })
    const missing = addConnectionToProject(project, { id: 'missing', fromNodeId: 'a', toNodeId: 'missing' })

    expect(duplicate.connections).toHaveLength(3)
    expect(self.connections).toHaveLength(3)
    expect(missing.connections).toHaveLength(3)
  })

  it('normalizes connection direction around config nodes', () => {
    const source = {
      ...project,
      nodes: [baseNode('prompt'), imageNode('image'), configNode('config'), configNode('config-2')],
      connections: [],
    }

    expect(normalizeConnectionForProject(source, 'prompt', 'config', 'source')).toEqual({ fromNodeId: 'prompt', toNodeId: 'config' })
    expect(normalizeConnectionForProject(source, 'prompt', 'config', 'target')).toEqual({ fromNodeId: 'prompt', toNodeId: 'config' })
    expect(normalizeConnectionForProject(source, 'config', 'prompt', 'target')).toEqual({ fromNodeId: 'prompt', toNodeId: 'config' })
    expect(normalizeConnectionForProject(source, 'config', 'prompt', 'source')).toBeNull()
    expect(normalizeConnectionForProject(source, 'prompt', 'image', 'target')).toEqual({ fromNodeId: 'prompt', toNodeId: 'image' })
    expect(normalizeConnectionForProject(source, 'config', 'config-2', 'source')).toBeNull()
  })

  it('resolves direct node clicks while a connection is armed', () => {
    const source = {
      ...project,
      nodes: [baseNode('prompt'), imageNode('image'), configNode('config'), configNode('config-2')],
      connections: [],
    }

    expect(resolveConnectionToNode(source, { nodeId: 'prompt', handleType: 'source' }, 'image')).toEqual({ fromNodeId: 'prompt', toNodeId: 'image' })
    expect(resolveConnectionToNode(source, { nodeId: 'config', handleType: 'target' }, 'prompt')).toEqual({ fromNodeId: 'prompt', toNodeId: 'config' })
    expect(resolveConnectionToNode(source, { nodeId: 'config', handleType: 'source' }, 'config-2')).toBeNull()
  })

  it('finds connection drop targets by node body, handle radius, and invalid nearby nodes', () => {
    const source = {
      ...project,
      nodes: [
        { ...baseNode('prompt'), position: { x: 0, y: 0 }, width: 100, height: 80 },
        { ...imageNode('image'), position: { x: 220, y: 0 }, width: 100, height: 80 },
        { ...configNode('config'), position: { x: 420, y: 0 }, width: 100, height: 80 },
        { ...configNode('config-2'), position: { x: 620, y: 0 }, width: 100, height: 80 },
      ],
      connections: [],
    }

    expect(findConnectionDropTarget(source, { x: 250, y: 30 }, { nodeId: 'prompt', handleType: 'source' }, 1)).toEqual({ nodeId: 'image', isNearNode: true, blockedNodeId: null })
    expect(findConnectionDropTarget(source, { x: 419, y: 40 }, { nodeId: 'prompt', handleType: 'source' }, 1)).toEqual({ nodeId: 'config', isNearNode: true, blockedNodeId: null })
    expect(findConnectionDropTarget(source, { x: 620, y: 40 }, { nodeId: 'config', handleType: 'source' }, 1)).toEqual({ nodeId: null, isNearNode: true, blockedNodeId: 'config-2' })
    expect(findConnectionDropTarget(source, { x: 900, y: 300 }, { nodeId: 'prompt', handleType: 'source' }, 1)).toEqual({ nodeId: null, isNearNode: false, blockedNodeId: null })
  })

  it('marks duplicate connection drop targets as blocked', () => {
    const source = {
      ...project,
      nodes: [
        { ...baseNode('prompt'), position: { x: 0, y: 0 }, width: 100, height: 80 },
        { ...imageNode('image'), position: { x: 220, y: 0 }, width: 100, height: 80 },
      ],
      connections: [{ id: 'prompt-image', fromNodeId: 'prompt', toNodeId: 'image' }],
    }

    expect(findConnectionDropTarget(source, { x: 250, y: 30 }, { nodeId: 'prompt', handleType: 'source' }, 1)).toEqual({
      nodeId: null,
      isNearNode: true,
      blockedNodeId: 'image',
    })
    expect(resolveConnectionToNode(source, { nodeId: 'prompt', handleType: 'source' }, 'image')).toBeNull()
  })

  it('prevents config nodes from acting as connection sources in the document layer', () => {
    const source = {
      ...project,
      nodes: [configNode('config-a'), configNode('config-b'), imageNode('image')],
      connections: [],
    }

    expect(addConnectionToProject(source, { id: 'config-edge', fromNodeId: 'config-a', toNodeId: 'config-b' }).connections).toHaveLength(0)
    expect(addConnectionToProject(source, { id: 'config-image', fromNodeId: 'config-a', toNodeId: 'image' }).connections).toHaveLength(0)
  })

  it('allows config nodes to connect to generation task nodes only', () => {
    const taskNode: CanvasNode = {
      ...imageNode('task'),
      metadata: {
        generationPayload: {
          mode: 'image',
          model: 'image-model',
          size: '1024x1024',
          count: 1,
          prompt: 'robot bird',
          summary: { text: 0, image: 0, video: 0, audio: 0 },
          inputs: [],
          createdAt: '2026-07-19T00:00:00.000Z',
        },
      },
    }
    const source = {
      ...project,
      nodes: [configNode('config'), imageNode('plain-image'), taskNode],
      connections: [],
    }

    expect(normalizeConnectionForProject(source, 'config', 'task', 'source')).toEqual({ fromNodeId: 'config', toNodeId: 'task' })
    expect(addConnectionToProject(source, { id: 'config-task', fromNodeId: 'config', toNodeId: 'task' }).connections).toEqual([
      { id: 'config-task', fromNodeId: 'config', toNodeId: 'task' },
    ])
    expect(addConnectionToProject(source, { id: 'config-image', fromNodeId: 'config', toNodeId: 'plain-image' }).connections).toHaveLength(0)
  })
})
