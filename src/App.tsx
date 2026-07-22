import { useCallback, useEffect, useRef, useState } from 'react'
import { Code2, Download, Edit3, FileUp, Plus, Trash2 } from 'lucide-react'
import { createArtboardFlowAppHostBridge, type ArtboardFlowAppHostBridge } from './appHostBridge'
import { canvasApi } from './canvas/api'
import { CanvasWorkspace } from './canvas/CanvasWorkspace'
import { downloadCanvasProjects, readCanvasProjectsFile } from './canvas/export'
import { materializeProjectMediaAssets } from './canvas/mediaAssets'
import { createProjectSaveQueue } from './canvas/saveQueue'
import type { CanvasProject } from './canvas/types'
import { createArtboardFlowHostTools, type ArtboardFlowHostToolsRuntime } from './hostTools'

declare global {
  interface Window {
    artboardFlowApp?: ArtboardFlowAppHostBridge
    artboardFlowTools?: ArtboardFlowHostToolsRuntime
  }
}

function projectPath(id: string) {
  return `/canvas/${encodeURIComponent(id)}`
}

function readRouteProjectId() {
  const match = window.location.pathname.match(/^\/canvas\/([^/]+)/)
  return match ? decodeURIComponent(match[1]) : null
}

function App() {
  const [projects, setProjects] = useState<CanvasProject[]>([])
  const [activeId, setActiveId] = useState<string | null>(() => readRouteProjectId())
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const saveQueue = useRef<ReturnType<typeof createProjectSaveQueue> | null>(null)

  if (!saveQueue.current) {
    saveQueue.current = createProjectSaveQueue({
      delayMs: 350,
      save: canvasApi.updateProject,
      onSaved: (saved) => {
        setProjects((current) => current.map((item) => (item.id === saved.id ? saved : item)))
      },
      onError: (requestError) => {
        setError(requestError instanceof Error ? requestError.message : '保存画布失败')
      },
    })
  }

  const activeProject = projects.find((project) => project.id === activeId) ?? null

  const loadProjects = useCallback(async () => {
    setLoading(true)
    try {
      const list = await canvasApi.listProjects()
      setProjects(list)
      setError(null)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '读取画布失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  useEffect(() => {
    const syncRoute = () => setActiveId(readRouteProjectId())
    window.addEventListener('popstate', syncRoute)
    return () => window.removeEventListener('popstate', syncRoute)
  }, [])

  useEffect(() => {
    const flushSaves = () => {
      void saveQueue.current?.flushAll()
    }
    window.addEventListener('pagehide', flushSaves)
    window.addEventListener('beforeunload', flushSaves)
    return () => {
      window.removeEventListener('pagehide', flushSaves)
      window.removeEventListener('beforeunload', flushSaves)
      flushSaves()
    }
  }, [])

  useEffect(() => {
    if (loading || !activeId) return
    if (projects.some((project) => project.id === activeId)) return
    setActiveId(null)
    window.history.replaceState(null, '', '/')
    setError('没有找到这个画布，已返回画布库。')
  }, [activeId, loading, projects])

  const openProject = useCallback((id: string | null, replace = false) => {
    if (activeId && activeId !== id) void saveQueue.current?.flush(activeId)
    setActiveId(id)
    const path = id ? projectPath(id) : '/'
    if (window.location.pathname === path) return
    window.history[replace ? 'replaceState' : 'pushState'](null, '', path)
  }, [activeId])

  const createProject = useCallback(async (titleOverride?: string, open = true) => {
    const title = titleOverride?.trim() || `无限画布 ${projects.length + 1}`
    const project = await canvasApi.createProject(title)
    setProjects((current) => [project, ...current])
    if (open) openProject(project.id)
    return project
  }, [openProject, projects.length])

  useEffect(() => {
    const bridge = createArtboardFlowAppHostBridge({
      getProjects: () => projects,
      getActiveProjectId: () => activeId,
      openProject,
      createProject: (title) => createProject(title, false),
    })
    window.artboardFlowApp = bridge
    return () => {
      if (window.artboardFlowApp === bridge) delete window.artboardFlowApp
    }
  }, [activeId, createProject, openProject, projects])

  useEffect(() => {
    const tools = createArtboardFlowHostTools({
      getApp: () => window.artboardFlowApp,
      getCanvas: () => window.artboardFlowCanvas,
    })
    window.artboardFlowTools = tools
    return () => {
      if (window.artboardFlowTools === tools) delete window.artboardFlowTools
    }
  }, [])

  const updateProject = (project: CanvasProject) => {
    setProjects((current) => current.map((item) => (item.id === project.id ? project : item)))
    saveQueue.current?.enqueue(project)
  }

  const renameProject = async (project: CanvasProject) => {
    const title = window.prompt('画布名称', project.title)?.trim()
    if (!title) return
    await saveQueue.current?.flush(project.id)
    const saved = await canvasApi.updateProject({ ...project, title })
    setProjects((current) => current.map((item) => (item.id === saved.id ? saved : item)))
  }

  const deleteProject = async (id: string) => {
    if (!window.confirm('确定删除这个画布吗？')) return
    saveQueue.current?.cancel(id)
    await canvasApi.deleteProject(id)
    setProjects((current) => current.filter((project) => project.id !== id))
    setSelectedIds((current) => current.filter((value) => value !== id))
    if (activeId === id) openProject(null, true)
  }

  const deleteSelected = async () => {
    if (selectedIds.length === 0 || !window.confirm(`确定删除 ${selectedIds.length} 个画布吗？`)) return
    selectedIds.forEach((id) => saveQueue.current?.cancel(id))
    await canvasApi.deleteProjects(selectedIds)
    setProjects((current) => current.filter((project) => !selectedIds.includes(project.id)))
    setSelectedIds([])
  }

  const exportProject = (project: CanvasProject) => {
    void downloadCanvasProjects([project], project.title || 'ArtboardFlow')
  }

  const exportSelected = () => {
    const selectedProjects = projects.filter((project) => selectedIds.includes(project.id))
    if (selectedProjects.length === 0) return
    void downloadCanvasProjects(selectedProjects, `ArtboardFlow-${selectedProjects.length}个画布`)
  }

  const importProject = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const parsedProjects = await readCanvasProjectsFile(file)
      const importedProjects: CanvasProject[] = []
      for (const parsed of parsedProjects) {
        const materialized = await materializeProjectMediaAssets(parsed, canvasApi.uploadAsset)
        importedProjects.push(await canvasApi.importProject(materialized))
      }
      setProjects((current) => [...importedProjects, ...current])
      if (importedProjects[0]) openProject(importedProjects[0].id)
      setError(null)
    } catch {
      setError('导入失败，请确认文件来自 ArtboardFlow 的 JSON 或 ZIP 导出包。')
    }
  }

  if (activeProject) {
    return <CanvasWorkspace project={activeProject} onProjectChange={updateProject} onBack={() => openProject(null)} onExport={exportProject} />
  }

  return (
    <main className="library-page">
      <nav className="app-nav">
        <div className="brand-mark">A</div>
        <a className="active">我的画布</a>
        <a>生图工作台</a>
        <a>视频创作台</a>
        <a>配置</a>
        <span />
        <strong>ArtboardFlow</strong>
        <Code2 size={18} />
      </nav>

      <section className="library">
        <div className="section-kicker">画布库</div>
        <div className="library-header">
          <div>
            <h1>无限画布</h1>
            <p>把节点、参考图、视频和生成配置组织成可追溯的创作关系。</p>
          </div>
          <div className="library-actions">
            <button className="ghost-button" disabled={selectedIds.length === 0} onClick={exportSelected}>
              <Download size={16} /> 导出选中
            </button>
            <button className="ghost-button" disabled={selectedIds.length === 0} onClick={deleteSelected}>
              <Trash2 size={16} /> 删除选中
            </button>
            <label className="ghost-button file-button">
              <FileUp size={16} /> 导入画布
              <input type="file" accept="application/json,.json,application/zip,.zip" onChange={importProject} />
            </label>
            <button className="primary-button" onClick={() => void createProject()}>
              <Plus size={17} /> 新建画布
            </button>
          </div>
        </div>

        {error ? <div className="notice">{error}</div> : null}
        {loading ? <div className="empty-state">正在读取画布...</div> : null}
        {!loading && projects.length === 0 ? <div className="empty-state">还没有画布，先新建一个。</div> : null}

        <div className="project-grid">
          {projects.map((project) => (
            <article key={project.id} className="project-card" onDoubleClick={() => openProject(project.id)}>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(project.id)}
                  onChange={(event) =>
                    setSelectedIds((current) => (event.target.checked ? [...current, project.id] : current.filter((id) => id !== project.id)))
                  }
                />
                <strong>{project.title}</strong>
              </label>
              <p>
                {project.nodes.length} 个节点 · {project.connections.length} 条连线
              </p>
              <small>更新于 {new Date(project.updatedAt).toLocaleString()}</small>
              <div className="project-actions">
                <button title="打开" onClick={() => openProject(project.id)}>
                  打开
                </button>
                <button title="导出" onClick={() => exportProject(project)}>
                  <Download size={15} />
                </button>
                <button title="重命名" onClick={() => renameProject(project)}>
                  <Edit3 size={15} />
                </button>
                <button title="删除" onClick={() => deleteProject(project.id)}>
                  <Trash2 size={15} />
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}

export default App
