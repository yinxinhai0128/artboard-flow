import { getAuthToken } from "@/stores/use-auth-store";

export const AUTH_API_BASE = import.meta.env.VITE_AUTH_API_BASE || "http://localhost:8787";

type AuthResponse = {
    token: string;
    user: { id: string; username: string; nickname?: string };
};

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(options.headers as Record<string, string> | undefined),
    };
    const token = getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(`${AUTH_API_BASE}${path}`, { ...options, headers });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
        const detail = data && typeof data === "object" && "error" in data ? String((data as { error: unknown }).error) : `请求失败 (${response.status})`;
        throw new Error(detail);
    }
    return data as T;
}

export async function register(username: string, password: string): Promise<AuthResponse> {
    return request<AuthResponse>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ username, password }),
    });
}

export async function login(username: string, password: string): Promise<AuthResponse> {
    return request<AuthResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
    });
}

export async function fetchMe(): Promise<{ id: string; username: string; nickname?: string }> {
    return request<{ id: string; username: string; nickname?: string }>("/api/auth/me");
}
