export type Storyboard = {
  id: string;
  title: string;
  ipAssetIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type ShotCamera = "push" | "pull" | "orbit" | "static" | "follow";

export type Shot = {
  id: string;
  storyboardId: string;
  orderIndex: number;
  durationSec: number;
  description: string;
  camera: ShotCamera;
  ipAssetId: string | null;
  promptOverride: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type StoryboardInput = {
  title: string;
  ipAssetIds?: string[];
};

export type ShotInput = {
  description: string;
  camera?: ShotCamera;
  durationSec?: number;
  ipAssetId?: string | null;
  promptOverride?: string | null;
  orderIndex?: number;
  status?: string;
};

export type GenerationJob = {
  id: string;
  projectId: string;
  nodeId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  payload: Record<string, unknown>;
  result: unknown | null;
  error?: string;
};

const BASE = "/api/storyboards";

async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (data && (data.error || data.msg || data.message)) || `请求失败 (${res.status})`;
    throw new Error(typeof msg === "string" ? msg : "请求失败");
  }
  return data as T;
}

export async function list(): Promise<Storyboard[]> {
  const res = await fetch(BASE);
  return handleResponse<Storyboard[]>(res);
}

export async function get(id: string): Promise<Storyboard> {
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}`);
  return handleResponse<Storyboard>(res);
}

export async function create(data: StoryboardInput): Promise<Storyboard> {
  const res = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse<Storyboard>(res);
}

export async function update(id: string, data: Partial<StoryboardInput>): Promise<Storyboard> {
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse<Storyboard>(res);
}

export async function remove(id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}`, { method: "DELETE" });
  return handleResponse<{ ok: boolean }>(res);
}

export async function listShots(storyboardId: string): Promise<Shot[]> {
  const res = await fetch(`${BASE}/${encodeURIComponent(storyboardId)}/shots`);
  return handleResponse<Shot[]>(res);
}

export async function createShot(storyboardId: string, data: ShotInput): Promise<Shot> {
  const res = await fetch(`${BASE}/${encodeURIComponent(storyboardId)}/shots`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse<Shot>(res);
}

export async function updateShot(boardId: string, shotId: string, data: Partial<ShotInput>): Promise<Shot> {
  const res = await fetch(`${BASE}/${encodeURIComponent(boardId)}/shots/${encodeURIComponent(shotId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse<Shot>(res);
}

export async function removeShot(boardId: string, shotId: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE}/${encodeURIComponent(boardId)}/shots/${encodeURIComponent(shotId)}`, {
    method: "DELETE",
  });
  return handleResponse<{ ok: boolean }>(res);
}

export async function reorder(boardId: string, orderedIds: string[]): Promise<Shot[]> {
  const res = await fetch(`${BASE}/${encodeURIComponent(boardId)}/reorder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderedIds }),
  });
  return handleResponse<Shot[]>(res);
}

export async function generate(boardId: string): Promise<{ jobs: GenerationJob[] }> {
  const res = await fetch(`${BASE}/${encodeURIComponent(boardId)}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  return handleResponse<{ jobs: GenerationJob[] }>(res);
}

const storyboardApi = { list, get, create, update, remove, listShots, createShot, updateShot, removeShot, reorder, generate };
export default storyboardApi;
