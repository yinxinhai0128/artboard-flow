// 轻量认证工具：scrypt 密码哈希 + HMAC-SHA256 JWT（零外部依赖）
import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

const JWT_SECRET =
  process.env.AUTH_JWT_SECRET ||
  createHash("sha256").update("artboard-flow-local-secret").digest("hex");
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 天

// ── 密码哈希（scrypt + salt）──────────────────────────────────
export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  try {
    const [salt, hash] = stored.split(":");
    const candidate = scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, "hex");
    return (
      candidate.length === expected.length &&
      timingSafeEqual(candidate, expected)
    );
  } catch {
    return false;
  }
}

// ── JWT（HMAC-SHA256，header.payload.signature）────────────────
function base64UrlEncode(input) {
  return Buffer.from(input).toString("base64url");
}

function base64UrlDecode(input) {
  return Buffer.from(input, "base64url").toString("utf8");
}

export function signToken(payload) {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncode(
    JSON.stringify({
      ...payload,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    }),
  );
  const signature = createHash("sha256")
    .update(`${header}.${body}${JWT_SECRET}`)
    .digest("base64url");
  return `${header}.${body}.${signature}`;
}

export function verifyToken(token) {
  try {
    const [header, body, signature] = token.split(".");
    if (!header || !body || !signature) return null;
    const expected = createHash("sha256")
      .update(`${header}.${body}${JWT_SECRET}`)
      .digest("base64url");
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected)))
      return null;
    const payload = JSON.parse(base64UrlDecode(body));
    if (Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function extractBearerToken(request) {
  const header = request.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return null;
  return header.slice(7).trim();
}
