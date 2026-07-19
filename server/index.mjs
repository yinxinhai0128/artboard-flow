import cors from '@fastify/cors'
import Fastify from 'fastify'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeGenerationJobPayload, normalizeGenerationJobResult, normalizeGenerationJobStatus, parseGenerationJob } from './generation-adapter.mjs'

const app = Fastify({ logger: true })
const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const dataDir = join(rootDir, 'server', 'data')
mkdirSync(dataDir, { recursive: true })

const db = new DatabaseSync(join(dataDir, 'artboard-flow.sqlite'))
db.exec(`
  create table if not exists projects (
    id text primary key,
    title text not null,
    created_at text not null,
    updated_at text not null,
    document_json text not null
  );

  create table if not exists generation_jobs (
    id text primary key,
    project_id text not null,
    node_id text not null,
    status text not null,
    created_at text not null,
    updated_at text not null,
    payload_json text not null,
    result_json text,
    error text
  );
`)

await app.register(cors, {
  origin: true,
})

const nowIso = () => new Date().toISOString()
const id = () => crypto.randomUUID()
const NODE_TYPES = new Set(['text', 'image', 'video', 'audio', 'config', 'group'])
const BACKGROUND_MODES = new Set(['dots', 'lines', 'blank'])

function parseDocument(row) {
  const document = JSON.parse(row.document_json)
  return {
    ...document,
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function normalizeProject(input = {}) {
  const createdAt = typeof input.createdAt === 'string' ? input.createdAt : nowIso()
  const updatedAt = typeof input.updatedAt === 'string' ? input.updatedAt : nowIso()
  const nodes = normalizeNodeRelationships(normalizeNodes(input.nodes))
  return {
    schemaVersion: 1,
    id: typeof input.id === 'string' && input.id ? input.id : id(),
    title: typeof input.title === 'string' && input.title.trim() ? input.title.trim() : '未命名画布',
    createdAt,
    updatedAt,
    nodes,
    connections: normalizeConnections(input.connections, nodes),
    backgroundMode: BACKGROUND_MODES.has(input.backgroundMode) ? input.backgroundMode : 'dots',
    viewport: isViewport(input.viewport) ? input.viewport : { x: 0, y: 0, k: 1 },
  }
}

function isViewport(value) {
  return value && Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.k)
}

function normalizeNodes(value) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  return value.flatMap((node) => {
    if (!node || typeof node !== 'object') return []
    const nodeId = typeof node.id === 'string' && node.id ? node.id : id()
    if (seen.has(nodeId)) return []
    seen.add(nodeId)
    const type = NODE_TYPES.has(node.type) ? node.type : 'text'
    const position = isPoint(node.position) ? node.position : { x: 0, y: 0 }
    const metadata = node.metadata && typeof node.metadata === 'object' && !Array.isArray(node.metadata) ? node.metadata : {}
    return [{
      id: nodeId,
      type,
      title: typeof node.title === 'string' && node.title.trim() ? node.title.trim() : '未命名节点',
      position,
      width: Number.isFinite(node.width) ? Math.max(120, Math.min(1600, node.width)) : 260,
      height: Number.isFinite(node.height) ? Math.max(90, Math.min(1200, node.height)) : 180,
      metadata,
    }]
  })
}

function normalizeNodeRelationships(nodes) {
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

function normalizeConnections(value, nodes) {
  if (!Array.isArray(value)) return []
  const nodeIds = new Set(nodes.map((node) => node.id))
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const seen = new Set()
  return value.flatMap((connection) => {
    if (!connection || typeof connection !== 'object') return []
    const fromNodeId = typeof connection.fromNodeId === 'string' ? connection.fromNodeId : ''
    const toNodeId = typeof connection.toNodeId === 'string' ? connection.toNodeId : ''
    if (!nodeIds.has(fromNodeId) || !nodeIds.has(toNodeId) || fromNodeId === toNodeId) return []
    const from = nodesById.get(fromNodeId)
    const to = nodesById.get(toNodeId)
    if (!from || !to || from.type === 'group' || to.type === 'group') return []
    if (from.type === 'config') return []
    const key = `${fromNodeId}->${toNodeId}`
    if (seen.has(key)) return []
    seen.add(key)
    return [{
      id: typeof connection.id === 'string' && connection.id ? connection.id : id(),
      fromNodeId,
      toNodeId,
    }]
  })
}

function isPoint(value) {
  return value && Number.isFinite(value.x) && Number.isFinite(value.y)
}

function saveProject(project) {
  db.prepare(`
    insert into projects (id, title, created_at, updated_at, document_json)
    values (?, ?, ?, ?, ?)
    on conflict(id) do update set
      title = excluded.title,
      updated_at = excluded.updated_at,
      document_json = excluded.document_json
  `).run(project.id, project.title, project.createdAt, project.updatedAt, JSON.stringify(project))
  return project
}

app.get('/api/health', async () => ({ ok: true, name: 'ArtboardFlow' }))

app.get('/api/projects', async () => {
  const rows = db.prepare(`
    select id, title, created_at, updated_at, document_json
    from projects
    order by datetime(updated_at) desc
  `).all()
  return rows.map(parseDocument)
})

app.post('/api/projects', async (request, reply) => {
  const title = request.body?.title
  const project = normalizeProject({ title: typeof title === 'string' ? title : '未命名画布' })
  saveProject(project)
  return reply.code(201).send(project)
})

app.post('/api/projects/import', async (request, reply) => {
  const project = normalizeProject({
    ...request.body,
    id: id(),
    title: typeof request.body?.title === 'string' ? `${request.body.title} 副本` : '导入画布',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  })
  saveProject(project)
  return reply.code(201).send(project)
})

app.get('/api/projects/:id', async (request, reply) => {
  const row = db.prepare('select * from projects where id = ?').get(request.params.id)
  if (!row) return reply.code(404).send({ error: 'PROJECT_NOT_FOUND' })
  return parseDocument(row)
})

app.put('/api/projects/:id', async (request, reply) => {
  const row = db.prepare('select * from projects where id = ?').get(request.params.id)
  if (!row) return reply.code(404).send({ error: 'PROJECT_NOT_FOUND' })

  const previous = parseDocument(row)
  const patch = request.body && typeof request.body === 'object' ? request.body : {}
  const project = normalizeProject({
    ...previous,
    ...patch,
    id: previous.id,
    createdAt: previous.createdAt,
    updatedAt: nowIso(),
  })
  saveProject(project)
  return project
})

app.delete('/api/projects/:id', async (request, reply) => {
  const result = db.prepare('delete from projects where id = ?').run(request.params.id)
  if (result.changes === 0) return reply.code(404).send({ error: 'PROJECT_NOT_FOUND' })
  return { ok: true }
})

app.delete('/api/projects', async (request) => {
  const ids = Array.isArray(request.body?.ids) ? request.body.ids.filter((value) => typeof value === 'string') : []
  const remove = db.prepare('delete from projects where id = ?')
  const transaction = db.transaction((projectIds) => {
    for (const projectId of projectIds) remove.run(projectId)
  })
  transaction(ids)
  return { ok: true, deleted: ids.length }
})

app.post('/api/generation/jobs', async (request, reply) => {
  const body = request.body && typeof request.body === 'object' ? request.body : {}
  const projectId = typeof body.projectId === 'string' ? body.projectId : ''
  const nodeId = typeof body.nodeId === 'string' ? body.nodeId : ''
  if (!projectId || !nodeId) return reply.code(400).send({ error: 'INVALID_GENERATION_JOB_TARGET' })

  const row = db.prepare('select id from projects where id = ?').get(projectId)
  if (!row) return reply.code(404).send({ error: 'PROJECT_NOT_FOUND' })

  const createdAt = nowIso()
  const payload = normalizeGenerationJobPayload(body.payload)
  const job = {
    id: id(),
    projectId,
    nodeId,
    status: 'queued',
    createdAt,
    updatedAt: createdAt,
    payload,
    result: null,
    error: undefined,
  }
  db.prepare(`
    insert into generation_jobs (id, project_id, node_id, status, created_at, updated_at, payload_json, result_json, error)
    values (?, ?, ?, ?, ?, ?, ?, null, null)
  `).run(job.id, job.projectId, job.nodeId, job.status, job.createdAt, job.updatedAt, JSON.stringify(job.payload))

  return reply.code(201).send(job)
})

app.get('/api/generation/jobs', async (request) => {
  const projectId = typeof request.query?.projectId === 'string' ? request.query.projectId : ''
  const nodeId = typeof request.query?.nodeId === 'string' ? request.query.nodeId : ''
  const clauses = []
  const values = []
  if (projectId) {
    clauses.push('project_id = ?')
    values.push(projectId)
  }
  if (nodeId) {
    clauses.push('node_id = ?')
    values.push(nodeId)
  }
  const where = clauses.length ? `where ${clauses.join(' and ')}` : ''
  const rows = db.prepare(`
    select * from generation_jobs
    ${where}
    order by datetime(updated_at) desc
    limit 100
  `).all(...values)
  return rows.map(parseGenerationJob)
})

app.get('/api/generation/jobs/:id', async (request, reply) => {
  const row = db.prepare('select * from generation_jobs where id = ?').get(request.params.id)
  if (!row) return reply.code(404).send({ error: 'GENERATION_JOB_NOT_FOUND' })
  return parseGenerationJob(row)
})

app.put('/api/generation/jobs/:id', async (request, reply) => {
  const previous = db.prepare('select * from generation_jobs where id = ?').get(request.params.id)
  if (!previous) return reply.code(404).send({ error: 'GENERATION_JOB_NOT_FOUND' })

  const body = request.body && typeof request.body === 'object' ? request.body : {}
  const status = normalizeGenerationJobStatus(body.status)
  const result = status === 'succeeded' ? normalizeGenerationJobResult(body.result) : null
  const error = status === 'failed' ? String(body.error || 'Generation failed') : null
  const updatedAt = nowIso()
  db.prepare(`
    update generation_jobs
    set status = ?, updated_at = ?, result_json = ?, error = ?
    where id = ?
  `).run(status, updatedAt, result ? JSON.stringify(result) : null, error, request.params.id)

  const row = db.prepare('select * from generation_jobs where id = ?').get(request.params.id)
  return parseGenerationJob(row)
})

const port = Number(process.env.PORT || 8787)
app.listen({ host: '127.0.0.1', port }).catch((error) => {
  app.log.error(error)
  process.exit(1)
})
