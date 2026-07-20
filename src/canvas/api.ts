import type { CanvasAssetUpload, CanvasGenerationJob, CanvasGenerationPayload, CanvasProject } from './types'

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { 'content-type': 'application/json', ...options?.headers },
    ...options,
  })
  if (!response.ok) {
    throw new Error(`请求失败：${response.status}`)
  }
  return response.json() as Promise<T>
}

export const canvasApi = {
  listProjects: () => request<CanvasProject[]>('/api/projects'),
  createProject: (title: string) =>
    request<CanvasProject>('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),
  importProject: (project: CanvasProject) =>
    request<CanvasProject>('/api/projects/import', {
      method: 'POST',
      body: JSON.stringify(project),
    }),
  updateProject: (project: CanvasProject) =>
    request<CanvasProject>(`/api/projects/${project.id}`, {
      method: 'PUT',
      body: JSON.stringify(project),
    }),
  deleteProject: (id: string) =>
    request<{ ok: true }>(`/api/projects/${id}`, {
      method: 'DELETE',
    }),
  deleteProjects: (ids: string[]) =>
    request<{ ok: true; deleted: number }>('/api/projects', {
      method: 'DELETE',
      body: JSON.stringify({ ids }),
    }),
  uploadAsset: (dataUrl: string) =>
    request<CanvasAssetUpload>('/api/assets', {
      method: 'POST',
      body: JSON.stringify({ dataUrl }),
    }),
  submitGenerationJob: (projectId: string, nodeId: string, payload: CanvasGenerationPayload) =>
    request<CanvasGenerationJob>('/api/generation/jobs', {
      method: 'POST',
      body: JSON.stringify({ projectId, nodeId, payload }),
    }),
  getGenerationJob: (id: string) => request<CanvasGenerationJob>(`/api/generation/jobs/${id}`),
  cancelGenerationJob: (id: string) =>
    request<CanvasGenerationJob>(`/api/generation/jobs/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
}
