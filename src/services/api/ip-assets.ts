export type IpAssetType = "character" | "scene" | "prop";

export type IpAsset = {
  id: string;
  name: string;
  type: IpAssetType;
  referenceKeys: string[];
  styleKeywords: string;
  description: string;
  createdAt: string;
  updatedAt: string;
};

export type IpAssetInput = {
  name: string;
  type: IpAssetType;
  referenceKeys?: string[];
  styleKeywords?: string;
  description?: string;
};

const BASE = "/api/ip-assets";

async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      (data && (data.error || data.msg || data.message)) ||
      `请求失败 (${res.status})`;
    throw new Error(typeof msg === "string" ? msg : "请求失败");
  }
  return data as T;
}

export async function list(): Promise<IpAsset[]> {
  const res = await fetch(BASE);
  return handleResponse<IpAsset[]>(res);
}

export async function get(id: string): Promise<IpAsset> {
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}`);
  return handleResponse<IpAsset>(res);
}

export async function create(data: IpAssetInput): Promise<IpAsset> {
  const res = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse<IpAsset>(res);
}

export async function update(id: string, data: Partial<IpAssetInput>): Promise<IpAsset> {
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse<IpAsset>(res);
}

export async function remove(id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  return handleResponse<{ ok: boolean }>(res);
}

// 兼容对象导出，供不同调用方使用
const ipAssetApi = { list, get, create, update, remove };
export default ipAssetApi;
