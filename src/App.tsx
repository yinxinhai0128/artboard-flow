import { useCallback, useEffect, useRef, useState } from 'react'
import { Code2, Download, Edit3, FileUp, Plus, Trash2 } from 'lucide-react'
import { canvasApi } from './canvas/api'
import { CanvasWorkspace } from './canvas/CanvasWorkspace'
import type { CanvasProject } from './canvas/types'

function App() {
  const [projects, setProjects] = useState<CanvasProject[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const saveTimers = useRef(new Map<string, number>())

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

  const createProject = async () => {
    const title = `无限画布 ${projects.length + 1}`
    const project = await canvasApi.createProject(title)
    setProjects((current) => [project, ...current])
    setActiveId(project.id)
  }

  const updateProject = (project: CanvasProject) => {
    setProjects((current) => current.map((item) => (item.id === project.id ? project : item)))
    window.clearTimeout(saveTimers.current.get(project.id))
    const timer = window.setTimeout(async () => {
      try {
        const saved = await canvasApi.updateProject(project)
        setProjects((current) => current.map((item) => (item.id === saved.id ? saved : item)))
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : '保存画布失败')
      }
    }, 350)
    saveTimers.current.set(project.id, timer)
  }

  const renameProject = async (project: CanvasProject) => {
    const title = window.prompt('画布名称', project.title)?.trim()
    if (!title) return
    const saved = await canvasApi.updateProject({ ...project, title })
    setProjects((current) => current.map((item) => (item.id === saved.id ? saved : item)))
  }

  const deleteProject = async (id: string) => {
    if (!window.confirm('确定删除这个画布吗？')) return
    await canvasApi.deleteProject(id)
    setProjects((current) => current.filter((project) => project.id !== id))
    setSelectedIds((current) => current.filter((value) => value !== id))
    if (activeId === id) setActiveId(null)
  }

  const deleteSelected = async () => {
    if (selectedIds.length === 0 || !window.confirm(`确定删除 ${selectedIds.length} 个画布吗？`)) return
    await canvasApi.deleteProjects(selectedIds)
    setProjects((current) => current.filter((project) => !selectedIds.includes(project.id)))
    setSelectedIds([])
  }

  const exportProject = (project: CanvasProject) => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${project.title}.artboard-flow.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const importProject = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text()) as CanvasProject
      const imported = await canvasApi.importProject(parsed)
      setProjects((current) => [imported, ...current])
      setActiveId(imported.id)
      setError(null)
    } catch {
      setError('导入失败，请确认 JSON 文件来自 ArtboardFlow。')
    }
  }

  if (activeProject) {
    return <CanvasWorkspace project={activeProject} onProjectChange={updateProject} onBack={() => setActiveId(null)} onExport={exportProject} />
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
            <button className="ghost-button" disabled={selectedIds.length === 0} onClick={deleteSelected}>
              <Trash2 size={16} /> 删除选中
            </button>
            <label className="ghost-button file-button">
              <FileUp size={16} /> 导入画布
              <input type="file" accept="application/json" onChange={importProject} />
            </label>
            <button className="primary-button" onClick={createProject}>
              <Plus size={17} /> 新建画布
            </button>
          </div>
        </div>

        {error ? <div className="notice">{error}</div> : null}
        {loading ? <div className="empty-state">正在读取画布...</div> : null}
        {!loading && projects.length === 0 ? <div className="empty-state">还没有画布，先新建一个。</div> : null}

        <div className="project-grid">
          {projects.map((project) => (
            <article key={project.id} className="project-card" onDoubleClick={() => setActiveId(project.id)}>
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
                <button title="打开" onClick={() => setActiveId(project.id)}>
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
