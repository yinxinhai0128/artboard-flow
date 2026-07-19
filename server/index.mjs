import cors from '@fastify/cors'
import Fastify from 'fastify'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

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
`)

await app.register(cors, {
  origin: true,
})

const nowIso = () => new Date().toISOString()
const id = () => crypto.randomUUID()

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
  return {
    id: typeof input.id === 'string' && input.id ? input.id : id(),
    title: typeof input.title === 'string' && input.title.trim() ? input.title.trim() : '未命名画布',
    createdAt,
    updatedAt,
    nodes: Array.isArray(input.nodes) ? input.nodes : [],
    connections: Array.isArray(input.connections) ? input.connections : [],
    backgroundMode: ['dots', 'lines', 'blank'].includes(input.backgroundMode) ? input.backgroundMode : 'dots',
    viewport: isViewport(input.viewport) ? input.viewport : { x: 0, y: 0, k: 1 },
  }
}

function isViewport(value) {
  return value && Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.k)
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

const port = Number(process.env.PORT || 8787)
app.listen({ host: '127.0.0.1', port }).catch((error) => {
  app.log.error(error)
  process.exit(1)
})
