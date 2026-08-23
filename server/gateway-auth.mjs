// 服务端鉴权：以网关(new-api)为唯一身份源做令牌内省（fail-closed）。
//
// 设计要点：
// 1. 前端持有的是网关签发的 access_token，本地后端没有网关的签名密钥，
//    无法离线验签 → 必须回调网关 /api/user/self 验真伪并取角色；
// 2. 内省结果按 token 指纹缓存 60 秒，避免高频请求打爆网关；
// 3. 网关不可达时一律拒绝（fail-closed）：宁可短暂不可用，绝不放行未知身份。
import { createHash } from "node:crypto";

const GATEWAY_BASE = (
  process.env.GATEWAY_BASE_URL ||
  process.env.NEW_API_BASE ||
  "http://127.0.0.1:32124"
).replace(/\/+$/, "");

const INTROSPECT_TIMEOUT_MS = Number(
  process.env.GATEWAY_INTROSPECT_TIMEOUT_MS || 4000,
);
const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 500;

/** token 指纹 -> { user, expiresAt }；只缓存成功结果，失败结果不缓存。 */
const cache = new Map();

/** 网关本身不可达（网络层故障）。与"令牌无效"区分开，便于排障。 */
export class GatewayUnavailableError extends Error {
  constructor(cause) {
    super("gateway unreachable");
    this.name = "GatewayUnavailableError";
    this.cause = cause;
  }
}

export function extractBearerToken(request) {
  const header = request.headers?.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : null;
}

/**
 * 用 Bearer 令牌向网关换取当前用户身份。
 * @returns 用户 { id, username, displayName, role }；令牌无效返回 null；
 *          网络故障抛 GatewayUnavailableError。
 */
export async function resolveGatewayUser(token) {
  if (!token) return null;
  const fingerprint = createHash("sha256").update(token).digest("hex");
  const hit = cache.get(fingerprint);
  if (hit && hit.expiresAt > Date.now()) return hit.user;

  let payload;
  try {
    const res = await fetch(`${GATEWAY_BASE}/api/user/self`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(INTROSPECT_TIMEOUT_MS),
    });
    payload = await res.json().catch(() => null);
  } catch (cause) {
    throw new GatewayUnavailableError(cause);
  }

  const u = payload?.data;
  if (!payload?.success || !u || typeof u.username !== "string") return null;

  const user = {
    id: String(u.id),
    username: u.username,
    displayName:
      typeof u.display_name === "string" && u.display_name
        ? u.display_name
        : u.username,
    // 网关角色：1=普通用户 10=管理员 100=Root；解析不出按最低权限处理
    role: Number.isFinite(Number(u.role)) ? Number(u.role) : 0,
  };
  if (cache.size >= CACHE_MAX_ENTRIES) cache.clear();
  cache.set(fingerprint, { user, expiresAt: Date.now() + CACHE_TTL_MS });
  return user;
}

function deny(reply, code, error) {
  return reply.code(code).send({ error });
}

async function authenticate(request, reply) {
  const token = extractBearerToken(request);
  if (!token) {
    deny(reply, 401, "未登录或缺少访问令牌");
    return null;
  }
  let user;
  try {
    user = await resolveGatewayUser(token);
  } catch {
    deny(reply, 503, "认证服务暂不可用，请稍后重试");
    return null;
  }
  if (!user) {
    deny(reply, 401, "登录状态无效或已过期，请重新登录");
    return null;
  }
  return user;
}

/** preHandler：要求任意有效网关用户。 */
export async function requireAuth(request, reply) {
  const user = await authenticate(request, reply);
  if (!user) return reply;
  request.gatewayUser = user;
}

/** preHandler：要求网关角色 >= 10（管理员/Root）。 */
export async function requireAdmin(request, reply) {
  const user = await authenticate(request, reply);
  if (!user) return reply;
  if (user.role < 10) {
    deny(reply, 403, "需要管理员权限");
    return reply;
  }
  request.gatewayUser = user;
}

/** 仅供测试：清空内省缓存。 */
export function resetAuthCacheForTests() {
  cache.clear();
}
