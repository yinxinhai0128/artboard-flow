import { parseCanvasClipboardText, type CanvasClipboard } from './document'
import type { CanvasNode, CanvasProject } from './types'

type ArtboardFlowExportAsset = {
  nodeId: string
  metadataKey: 'content'
  path: string
  mimeType: string
  bytes: number
}

export type ArtboardFlowExportFile = {
  app: 'artboard-flow'
  version: 1
  exportedAt: string
  projects: { project: CanvasProject; files: ArtboardFlowExportAsset[] }[]
}

export type ArtboardFlowClipboardExportFile = {
  app: 'artboard-flow'
  type: 'canvas-clipboard'
  version: 1
  exportedAt: string
  clipboard: CanvasClipboard
  files: ArtboardFlowExportAsset[]
}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

export async function downloadCanvasProjects(projects: CanvasProject[], fileName = 'ArtboardFlow') {
  downloadBlob(new Blob([packCanvasProjects(projects)], { type: 'application/zip' }), `${safeFileName(fileName)}.artboard-flow.zip`)
}

export async function downloadCanvasClipboard(clipboard: CanvasClipboard | null, fileName = 'ArtboardFlow-节点片段') {
  if (!clipboard?.nodes.length) return
  downloadBlob(new Blob([packCanvasClipboard(clipboard)], { type: 'application/zip' }), `${safeFileName(fileName)}.artboard-flow-fragment.zip`)
}

export function packCanvasProjects(projects: CanvasProject[]) {
  const zipFiles: { name: string; data: Uint8Array }[] = []
  const payload: ArtboardFlowExportFile = {
    app: 'artboard-flow',
    version: 1,
    exportedAt: new Date().toISOString(),
    projects: projects.map((project) => externalizeProjectMedia(project, zipFiles)),
  }
  return createStoredZip([{ name: 'projects.json', data: textEncoder.encode(JSON.stringify(payload, null, 2)) }, ...zipFiles])
}

export function packCanvasClipboard(clipboard: CanvasClipboard) {
  const zipFiles: { name: string; data: Uint8Array }[] = []
  const payload: ArtboardFlowClipboardExportFile = {
    app: 'artboard-flow',
    type: 'canvas-clipboard',
    version: 1,
    exportedAt: new Date().toISOString(),
    ...externalizeClipboardMedia(clipboard, zipFiles),
  }
  return createStoredZip([{ name: 'clipboard.json', data: textEncoder.encode(JSON.stringify(payload, null, 2)) }, ...zipFiles])
}

export async function readCanvasProjectsFile(file: File): Promise<CanvasProject[]> {
  const entries = file.name.toLowerCase().endsWith('.zip') || file.type.includes('zip')
    ? readStoredZip(new Uint8Array(await file.arrayBuffer()))
    : null
  const text = entries ? readProjectsJsonFromZip(entries) : await file.text()
  const parsed = JSON.parse(text) as unknown
  if (isExportFile(parsed)) return parsed.projects.map((item) => sanitizeImportedProject(restoreProjectMedia(item.project, item.files ?? [], entries)))
  if (isProjectArray(parsed)) return parsed.map(sanitizeImportedProject)
  if (isProject(parsed)) return [sanitizeImportedProject(parsed)]
  throw new Error('INVALID_CANVAS_EXPORT')
}

export async function readCanvasClipboardFile(file: File): Promise<CanvasClipboard> {
  const entries = file.name.toLowerCase().endsWith('.zip') || file.type.includes('zip')
    ? readStoredZip(new Uint8Array(await file.arrayBuffer()))
    : null
  const text = entries ? readJsonFromZip(entries, 'clipboard.json', 'MISSING_CLIPBOARD_JSON') : await file.text()
  const parsed = JSON.parse(text) as unknown
  if (isClipboardExportFile(parsed)) {
    const restored = restoreClipboardMedia(parsed.clipboard, parsed.files ?? [], entries)
    const clipboard = parseCanvasClipboardText(JSON.stringify({ app: 'artboard-flow', type: 'canvas-clipboard', version: 1, clipboard: restored }))
    if (clipboard) return clipboard
  }
  const clipboard = parseCanvasClipboardText(text)
  if (clipboard) return clipboard
  throw new Error('INVALID_CANVAS_CLIPBOARD_EXPORT')
}

function externalizeProjectMedia(project: CanvasProject, zipFiles: { name: string; data: Uint8Array }[]) {
  const externalized = externalizeNodesMedia(project.nodes, `projects/${safeFileName(project.id)}/files`, zipFiles)
  return { project: { ...project, nodes: externalized.nodes }, files: externalized.files }
}

function externalizeClipboardMedia(clipboard: CanvasClipboard, zipFiles: { name: string; data: Uint8Array }[]) {
  const externalized = externalizeNodesMedia(clipboard.nodes, 'clipboard/files', zipFiles)
  return { clipboard: { ...clipboard, nodes: externalized.nodes }, files: externalized.files }
}

function externalizeNodesMedia(nodes: CanvasNode[], pathPrefix: string, zipFiles: { name: string; data: Uint8Array }[]) {
  const files: ArtboardFlowExportAsset[] = []
  return {
    files,
    nodes: nodes.map((node) => {
      const content = node.metadata.content
      if (!(node.type === 'image' || node.type === 'video' || node.type === 'audio') || typeof content !== 'string') return node
      const dataUrl = decodeDataUrl(content)
      if (!dataUrl) return node

      const path = `${pathPrefix}/${safeFileName(node.id)}-content.${fileExtension(dataUrl.mimeType)}`
      files.push({ nodeId: node.id, metadataKey: 'content', path, mimeType: dataUrl.mimeType, bytes: dataUrl.data.length })
      zipFiles.push({ name: path, data: dataUrl.data })
      return { ...node, metadata: { ...node.metadata, content: `artboard-flow-file:${path}` } }
    }),
  }
}

function restoreProjectMedia(project: CanvasProject, files: ArtboardFlowExportAsset[], entries: Map<string, Uint8Array> | null) {
  if (!entries || !files.length) return project
  return { ...project, nodes: restoreNodesMedia(project.nodes, files, entries) }
}

function restoreClipboardMedia(clipboard: CanvasClipboard, files: ArtboardFlowExportAsset[], entries: Map<string, Uint8Array> | null) {
  if (!entries || !files.length) return clipboard
  return { ...clipboard, nodes: restoreNodesMedia(clipboard.nodes, files, entries) }
}

function restoreNodesMedia(nodes: CanvasNode[], files: ArtboardFlowExportAsset[], entries: Map<string, Uint8Array>) {
  const filesByNode = new Map(files.map((file) => [file.nodeId, file]))
  return nodes.map((node) => {
      const file = filesByNode.get(node.id)
      if (!file) return node
      const content = node.metadata[file.metadataKey]
      if (content !== `artboard-flow-file:${file.path}`) return node
      const data = entries.get(file.path)
      if (!data) return node
      return {
        ...node,
        metadata: {
          ...node.metadata,
          [file.metadataKey]: encodeDataUrl(file.mimeType, data),
          mimeType: node.metadata.mimeType ?? file.mimeType,
          bytes: node.metadata.bytes ?? file.bytes,
        },
      }
    })
}

function decodeDataUrl(value: string) {
  const match = /^data:([^;,]+)?((?:;[^,]*)?),(.*)$/s.exec(value)
  if (!match) return null
  const mimeType = match[1] || 'application/octet-stream'
  const metadata = match[2] || ''
  const payload = match[3] || ''
  if (metadata.includes(';base64')) {
    return { mimeType, data: base64ToBytes(payload) }
  }
  return { mimeType, data: textEncoder.encode(decodeURIComponent(payload)) }
}

function encodeDataUrl(mimeType: string, data: Uint8Array) {
  return `data:${mimeType || 'application/octet-stream'};base64,${bytesToBase64(data)}`
}

function sanitizeImportedProject(project: CanvasProject): CanvasProject {
  const nodes = sanitizeImportedNodeRelationships(project.nodes)
  return {
    ...project,
    nodes,
    connections: sanitizeImportedConnections(project.connections, nodes),
  }
}

function sanitizeImportedNodeRelationships(nodes: CanvasProject['nodes']) {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  return nodes.map((node) => {
    const metadata = { ...node.metadata }
    let changed = false

    const groupId = typeof metadata.groupId === 'string' ? metadata.groupId : ''
    const group = groupId ? nodesById.get(groupId) : null
    if (groupId && (!group || group.type !== 'group' || group.id === node.id || node.type === 'group')) {
      delete metadata.groupId
      changed = true
    }

    const splitSourceNodeId = typeof metadata.splitSourceNodeId === 'string' ? metadata.splitSourceNodeId : ''
    const splitSource = splitSourceNodeId ? nodesById.get(splitSourceNodeId) : null
    if (
      splitSourceNodeId &&
      (!splitSource ||
        splitSource.id === node.id ||
        splitSource.type === 'group' ||
        splitSource.type === 'config' ||
        splitSource.type === 'text')
    ) {
      delete metadata.splitSourceNodeId
      delete metadata.splitOutputIndex
      changed = true
    }

    return changed ? { ...node, metadata } : node
  })
}

function sanitizeImportedConnections(connections: CanvasProject['connections'], nodes: CanvasProject['nodes']) {
  const nodeIds = new Set(nodes.map((node) => node.id))
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const seen = new Set<string>()
  return connections.filter((connection) => {
    if (!nodeIds.has(connection.fromNodeId) || !nodeIds.has(connection.toNodeId) || connection.fromNodeId === connection.toNodeId) return false
    const from = nodesById.get(connection.fromNodeId)
    const to = nodesById.get(connection.toNodeId)
    if (!from || !to || from.type === 'group' || to.type === 'group') return false
    if (from.type === 'config') return false
    const key = `${connection.fromNodeId}->${connection.toNodeId}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function isExportFile(value: unknown): value is ArtboardFlowExportFile {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value as ArtboardFlowExportFile).app === 'artboard-flow' &&
      Array.isArray((value as ArtboardFlowExportFile).projects),
  )
}

function isClipboardExportFile(value: unknown): value is ArtboardFlowClipboardExportFile {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value as ArtboardFlowClipboardExportFile).app === 'artboard-flow' &&
      (value as ArtboardFlowClipboardExportFile).type === 'canvas-clipboard' &&
      Boolean((value as ArtboardFlowClipboardExportFile).clipboard),
  )
}

function isProjectArray(value: unknown): value is CanvasProject[] {
  return Array.isArray(value) && value.every(isProject)
}

function isProject(value: unknown): value is CanvasProject {
  return Boolean(value && typeof value === 'object' && Array.isArray((value as CanvasProject).nodes) && Array.isArray((value as CanvasProject).connections))
}

function readProjectsJsonFromZip(entries: Map<string, Uint8Array>) {
  return readJsonFromZip(entries, 'projects.json', 'MISSING_PROJECTS_JSON')
}

function readJsonFromZip(entries: Map<string, Uint8Array>, path: string, errorCode: string) {
  const json = entries.get(path)
  if (!json) throw new Error(errorCode)
  return textDecoder.decode(json)
}

function createStoredZip(files: { name: string; data: Uint8Array }[]) {
  const chunks: Uint8Array[] = []
  const centralDirectory: Uint8Array[] = []
  let offset = 0
  for (const file of files) {
    const name = textEncoder.encode(file.name)
    const crc = crc32(file.data)
    const local = concatBytes([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(file.data.length),
      u32(file.data.length),
      u16(name.length),
      u16(0),
      name,
      file.data,
    ])
    chunks.push(local)
    centralDirectory.push(concatBytes([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(file.data.length),
      u32(file.data.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ]))
    offset += local.length
  }
  const centralStart = offset
  const central = concatBytes(centralDirectory)
  const end = concatBytes([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(central.length),
    u32(centralStart),
    u16(0),
  ])
  return concatBytes([...chunks, central, end])
}

function readStoredZip(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const eocd = findEndOfCentralDirectory(view)
  const entries = new Map<string, Uint8Array>()
  const count = view.getUint16(eocd + 10, true)
  let cursor = view.getUint32(eocd + 16, true)
  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error('INVALID_ZIP_CENTRAL_DIRECTORY')
    const method = view.getUint16(cursor + 10, true)
    const compressedSize = view.getUint32(cursor + 20, true)
    const nameLength = view.getUint16(cursor + 28, true)
    const extraLength = view.getUint16(cursor + 30, true)
    const commentLength = view.getUint16(cursor + 32, true)
    const localOffset = view.getUint32(cursor + 42, true)
    const name = textDecoder.decode(bytes.slice(cursor + 46, cursor + 46 + nameLength))
    if (method !== 0) throw new Error('UNSUPPORTED_ZIP_COMPRESSION')
    if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error('INVALID_ZIP_LOCAL_HEADER')
    const localNameLength = view.getUint16(localOffset + 26, true)
    const localExtraLength = view.getUint16(localOffset + 28, true)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    entries.set(name, bytes.slice(dataStart, dataStart + compressedSize))
    cursor += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

function findEndOfCentralDirectory(view: DataView) {
  for (let offset = view.byteLength - 22; offset >= 0; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset
  }
  throw new Error('INVALID_ZIP')
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function u16(value: number) {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff])
}

function u32(value: number) {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff])
}

function concatBytes(chunks: Uint8Array[]) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const output = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.length
  }
  return output
}

function base64ToBytes(value: string) {
  const binary = atob(value)
  const output = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    output[index] = binary.charCodeAt(index)
  }
  return output
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

function safeFileName(value: string) {
  return value.trim().replace(/[\\/:*?"<>|]/g, '_') || 'ArtboardFlow'
}

function fileExtension(mimeType: string) {
  if (mimeType.includes('png')) return 'png'
  if (mimeType.includes('jpeg')) return 'jpg'
  if (mimeType.includes('webp')) return 'webp'
  if (mimeType.includes('gif')) return 'gif'
  if (mimeType.includes('mp4')) return 'mp4'
  if (mimeType.includes('webm')) return 'webm'
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3'
  if (mimeType.includes('wav')) return 'wav'
  if (mimeType.includes('ogg')) return 'ogg'
  return 'bin'
}
