import { getAuthToken } from "@/stores/use-auth-store";

// new-api 网关地址：优先取构建期环境变量 VITE_NEW_API_BASE，否则从当前页面主机推导（同主机 + 32124 端口）。
export const NEW_API_BASE = resolveNewApiBase();

function resolveNewApiBase(): string {
  const env = (import.meta.env.VITE_NEW_API_BASE as string | undefined)?.trim();
  if (env) return env.replace(/\/+$/, "");
  // 默认走同源反代 /gateway，由画布 nginx 转发到 new-api，避免跨域。
  return "/gateway";
}

export type LoginUser = { id: string; username: string; nickname?: string };

type ApiEnvelope<T> = {
  success?: boolean;
  message?: string;
  data?: T;
  error?: { message?: string };
};

async function requestJson<T>(
  path: string,
  options: { method?: string; body?: unknown; sessionToken?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const token = options.sessionToken ?? getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${NEW_API_BASE}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!data?.success) {
    throw new Error(
      data?.message || data?.error?.message || `请求失败 (${res.status})`,
    );
  }
  return data as T;
}

export async function register(
  username: string,
  password: string,
): Promise<void> {
  await requestJson<unknown>("/api/user/register", {
    method: "POST",
    body: { username, password, password2: password },
  });
}

export async function login(
  username: string,
  password: string,
): Promise<{ token: string; user: LoginUser }> {
  const data = await requestJson<{
    data: {
      access_token: string;
      user: { id: number; username: string; display_name?: string };
    };
  }>("/api/user/login", { method: "POST", body: { username, password } });
  const { access_token, user } = data.data;
  return {
    token: access_token,
    user: {
      id: String(user.id),
      username: user.username,
      nickname: user.display_name || user.username,
    },
  };
}

// 获取（无则创建）当前用户的 API 令牌（网关 sk-token），供画布调用 AI 走网关用。
export async function ensureApiToken(sessionToken?: string): Promise<string> {
  const activeToken = sessionToken ?? getAuthToken();
  if (!activeToken) throw new Error("未登录");
  const list = await requestJson<{
    data: { items?: Array<{ id: number; name: string }> };
  }>("/api/token/", { sessionToken: activeToken });
  let tokenId = (list.data?.items || []).find((t) => t.name === "canvas")?.id;
  if (!tokenId) {
    await requestJson("/api/token/", {
      method: "POST",
      sessionToken: activeToken,
      body: {
        name: "canvas",
        unlimited_quota: true,
        remain_quota: 0,
        expired_time: -1,
        group: "default",
      },
    });
    const list2 = await requestJson<{
      data: { items?: Array<{ id: number; name: string }> };
    }>("/api/token/", { sessionToken: activeToken });
    tokenId = (list2.data?.items || []).find((t) => t.name === "canvas")?.id;
  }
  if (!tokenId) throw new Error("无法获取 API 令牌");
  const revealed = await requestJson<{ data: string | { key: string } }>(
    `/api/token/${tokenId}/key`,
    { method: "POST", sessionToken: activeToken, body: {} },
  );
  const skToken =
    typeof revealed.data === "string" ? revealed.data : revealed.data?.key;
  if (!skToken) throw new Error("无法解析 API 令牌");
  return skToken;
}
