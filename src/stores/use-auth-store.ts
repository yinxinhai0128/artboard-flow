import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AuthUser = {
  id: string;
  username: string;
  nickname?: string;
  /** 网关角色：1=普通用户 10=管理员 100=Root */
  role?: number;
};

type AuthStore = {
  token: string | null;
  user: AuthUser | null;
  setSession: (token: string, user: AuthUser) => void;
  logout: () => void;
};

const AUTH_STORE_KEY = "artboard-flow:auth_store";

/**
 * 从 zustand persist 存储中读取 token。
 * persist 将整个 store 序列化到 localStorage 的 `artboard-flow:auth_store`，
 * 结构为 { state: { token, user }, version }。
 */
export function getAuthToken(): string | null {
  try {
    const raw = localStorage.getItem(AUTH_STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { token?: string | null } };
    return parsed?.state?.token || null;
  } catch {
    return null;
  }
}

export function parseTokenPayload(
  token: string,
): { sub?: string; username?: string; exp?: number } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const padded = payload + "==".slice(0, (4 - (payload.length % 4)) % 4);
    const decoded = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decoded) as {
      sub?: string;
      username?: string;
      exp?: number;
    };
  } catch {
    return null;
  }
}

/** 管理员判定：网关 role >= 10（1=普通用户 10=管理员 100=Root）。 */
export function isAdminUser(user: { role?: number } | null): boolean {
  return Boolean(user && typeof user.role === "number" && user.role >= 10);
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setSession: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
    }),
    {
      name: "artboard-flow:auth_store",
      partialize: (state) => ({ token: state.token, user: state.user }),
    },
  ),
);
