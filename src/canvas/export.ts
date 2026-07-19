import type { CanvasProject } from './types'

export type ArtboardFlowExportFile = {
  app: 'artboard-flow'
  version: 1
  exportedAt: string
  projects: { project: CanvasProject; files: [] }[]
}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

export async function downloadCanvasProjects(projects: CanvasProject[], fileName = 'ArtboardFlow') {
  downloadBlob(new Blob([packCanvasProjects(projects)], { type: 'application/zip' }), `${safeFileName(fileName)}.artboard-flow.zip`)
}

export function packCanvasProjects(projects: CanvasProject[]) {
  const payload: ArtboardFlowExportFile = {
    app: 'artboard-flow',
    version: 1,
    exportedAt: new Date().toISOString(),
    projects: projects.map((project) => ({ project, files: [] })),
  }
  return createStoredZip([{ name: 'projects.json', data: textEncoder.encode(JSON.stringify(payload, null, 2)) }])
}

export async function readCanvasProjectsFile(file: File): Promise<CanvasProject[]> {
  const text = file.name.toLowerCase().endsWith('.zip') || file.type.includes('zip')
    ? await readProjectsJsonFromZip(file)
    : await file.text()
  const parsed = JSON.parse(text) as unknown
  if (isExportFile(parsed)) return parsed.projects.map((item) => item.project)
  if (isProjectArray(parsed)) return parsed
  if (isProject(parsed)) return [parsed]
  throw new Error('INVALID_CANVAS_EXPORT')
}

function isExportFile(value: unknown): value is ArtboardFlowExportFile {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value as ArtboardFlowExportFile).app === 'artboard-flow' &&
      Array.isArray((value as ArtboardFlowExportFile).projects),
  )
}

function isProjectArray(value: unknown): value is CanvasProject[] {
  return Array.isArray(value) && value.every(isProject)
}

function isProject(value: unknown): value is CanvasProject {
  return Boolean(value && typeof value === 'object' && Array.isArray((value as CanvasProject).nodes) && Array.isArray((value as CanvasProject).connections))
}

async function readProjectsJsonFromZip(file: File) {
  const entries = readStoredZip(new Uint8Array(await file.arrayBuffer()))
  const projectsJson = entries.get('projects.json')
  if (!projectsJson) throw new Error('MISSING_PROJECTS_JSON')
  return textDecoder.decode(projectsJson)
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
