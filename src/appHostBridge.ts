import type { CanvasProject } from './canvas/types'

type AppHostBridgeOptions = {
  getProjects: () => CanvasProject[]
  getActiveProjectId: () => string | null
  openProject: (id: string | null, replace?: boolean) => void
  createProject: (title: string) => Promise<CanvasProject> | CanvasProject
}

type AppHostProjectListFilter = {
  keyword?: string
  page?: number
  pageSize?: number
}

type AppHostOpenProjectInput = {
  id: string | null
  replace?: boolean
}

type AppHostCreateProjectInput = {
  title?: string
  open?: boolean
}

export type AppHostProjectSummary = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  nodeCount: number
  connectionCount: number
  path: string
}

export type AppHostProjectList = {
  total: number
  page: number
  pageSize: number
  items: AppHostProjectSummary[]
}

export type AppHostCapability = {
  name: string
  scope: 'app'
  description: string
}

export type ArtboardFlowAppHostBridge = {
  getCapabilities: () => AppHostCapability[]
  listProjects: (filter?: AppHostProjectListFilter) => AppHostProjectList
  getActiveProjectId: () => string | null
  openProject: (input: AppHostOpenProjectInput) => { ok: true; id: string | null; path: string }
  createProject: (input?: AppHostCreateProjectInput) => Promise<{ ok: true; project: AppHostProjectSummary }>
}

const appHostCapabilities: AppHostCapability[] = [
  { name: 'listProjects', scope: 'app', description: '列出画布项目摘要，支持关键词和分页。' },
  { name: 'getActiveProjectId', scope: 'app', description: '读取当前打开的画布项目 ID。' },
  { name: 'openProject', scope: 'app', description: '按项目 ID 打开画布或返回画布库。' },
  { name: 'createProject', scope: 'app', description: '新建画布项目，并可选择立即打开。' },
]

export function createArtboardFlowAppHostBridge(options: AppHostBridgeOptions): ArtboardFlowAppHostBridge {
  return {
    getCapabilities: () => appHostCapabilities,
    listProjects: (filter = {}) => listProjects(options.getProjects(), filter),
    getActiveProjectId: options.getActiveProjectId,
    openProject: (input) => {
      options.openProject(input.id, input.replace)
      return { ok: true, id: input.id, path: projectPath(input.id) }
    },
    createProject: async (input = {}) => {
      const project = await options.createProject(input.title?.trim() || '未命名画布')
      if (input.open) options.openProject(project.id)
      return { ok: true, project: summarizeProject(project) }
    },
  }
}

function listProjects(projects: CanvasProject[], filter: AppHostProjectListFilter): AppHostProjectList {
  const keyword = filter.keyword?.trim().toLowerCase() ?? ''
  const filtered = projects
    .filter((project) => !keyword || project.title.toLowerCase().includes(keyword))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const { page, pageSize, start, end } = paginate(filter.page, filter.pageSize, filtered.length)
  return {
    total: filtered.length,
    page,
    pageSize,
    items: filtered.slice(start, end).map(summarizeProject),
  }
}

function summarizeProject(project: CanvasProject): AppHostProjectSummary {
  return {
    id: project.id,
    title: project.title,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    nodeCount: project.nodes.length,
    connectionCount: project.connections.length,
    path: projectPath(project.id),
  }
}

function projectPath(id: string | null) {
  return id ? `/canvas/${encodeURIComponent(id)}` : '/'
}

function paginate(pageInput: number | undefined, pageSizeInput: number | undefined, total: number) {
  const pageSize = normalizePageSize(pageSizeInput)
  const maxPage = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(maxPage, Math.max(1, Math.floor(pageInput ?? 1)))
  const start = (page - 1) * pageSize
  return { page, pageSize, start, end: start + pageSize }
}

function normalizePageSize(pageSize: number | undefined) {
  if (typeof pageSize !== 'number' || !Number.isFinite(pageSize)) return 20
  return Math.max(1, Math.min(100, Math.floor(pageSize)))
}
