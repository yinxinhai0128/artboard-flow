import cors from "@fastify/cors";
import Fastify from "fastify";
import { DatabaseSync } from "node:sqlite";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assetExtensionFromMimeType,
  assetRecordFromKey,
  createAssetKey,
  decodeDataUrlAsset,
  mimeTypeFromAssetKey,
} from "./asset-store.mjs";
import {
  normalizeGenerationJobPayload,
  normalizeGenerationJobResult,
  normalizeGenerationJobStatus,
  parseGenerationJob,
} from "./generation-adapter.mjs";
import { canPersistConnection } from "./project-rules.mjs";
import {
  extractBearerToken,
  hashPassword,
  signToken,
  verifyPassword,
  verifyToken,
} from "./auth-utils.mjs";
import {
  normalizeIpAsset,
  parseIpAssetRow,
} from "./ip-asset-store.mjs";
import {
  normalizeShot,
  normalizeStoryboard,
  parseShotRow,
  parseStoryboardRow,
} from "./storyboard-store.mjs";
import {
  aggregateDashboard,
  normalizeReview,
  parseReviewRow,
} from "./review-store.mjs";
import {
  estimateGenerationCostCny,
  summarizeGenerationMetrics,
} from "./metrics-store.mjs";

const app = Fastify({ logger: true });
const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const dataDir = join(rootDir, "server", "data");
const assetDir = join(dataDir, "assets");
mkdirSync(dataDir, { recursive: true });
mkdirSync(assetDir, { recursive: true });

const db = new DatabaseSync(join(dataDir, "artboard-flow.sqlite"));
db.exec(`
  create table if not exists projects (
    id text primary key,
    title text not null,
    created_at text not null,
    updated_at text not null,
    document_json text not null
  );

  create table if not exists generation_jobs (
    id text primary key,
    project_id text not null,
    node_id text not null,
    status text not null,
    created_at text not null,
    updated_at text not null,
    payload_json text not null,
    result_json text,
    error text
  );

  create table if not exists users (
    id text primary key,
    username text not null unique,
    password_hash text not null,
    nickname text,
    created_at text not null
  );

  create table if not exists ip_assets (
    id text primary key,
    name text not null,
    type text not null,
    reference_keys_json text not null,
    style_keywords text,
    description text,
    created_at text not null,
    updated_at text not null
  );

  create table if not exists storyboards (
    id text primary key,
    title text not null,
    ip_asset_ids_json text not null,
    created_at text not null,
    updated_at text not null
  );

  create table if not exists storyboard_shots (
    id text primary key,
    storyboard_id text not null,
    order_index integer not null,
    duration_sec integer not null,
    description text not null,
    camera text not null,
    ip_asset_id text,
    prompt_override text,
    status text not null,
    created_at text not null,
    updated_at text not null
  );

  create table if not exists shot_reviews (
    id text primary key,
    shot_id text not null,
    generation_job_id text,
    verdict text not null,
    reason text,
    comment text,
    created_at text not null
  );
`);

db.exec(`
  create index if not exists idx_shots_board on storyboard_shots(storyboard_id);
  create index if not exists idx_reviews_shot on shot_reviews(shot_id);
`);

await app.register(cors, {
  origin: true,
});

const nowIso = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const NODE_TYPES = new Set([
  "text",
  "image",
  "video",
  "audio",
  "config",
  "group",
]);
const BACKGROUND_MODES = new Set(["dots", "lines", "blank"]);
const ASSET_KEY_PATTERN = /^[a-zA-Z0-9_-]+\.[a-z0-9]+$/;

function parseDocument(row) {
  const document = JSON.parse(row.document_json);
  return {
    ...document,
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeProject(input = {}) {
  const createdAt =
    typeof input.createdAt === "string" ? input.createdAt : nowIso();
  const updatedAt =
    typeof input.updatedAt === "string" ? input.updatedAt : nowIso();
  const nodes = normalizeNodeRelationships(normalizeNodes(input.nodes));
  return {
    schemaVersion: 1,
    id: typeof input.id === "string" && input.id ? input.id : id(),
    title:
      typeof input.title === "string" && input.title.trim()
        ? input.title.trim()
        : "未命名画布",
    createdAt,
    updatedAt,
    nodes,
    connections: normalizeConnections(input.connections, nodes),
    backgroundMode: BACKGROUND_MODES.has(input.backgroundMode)
      ? input.backgroundMode
      : "dots",
    showImageInfo: input.showImageInfo === true,
    viewport: isViewport(input.viewport)
      ? input.viewport
      : { x: 0, y: 0, k: 1 },
  };
}

function isViewport(value) {
  return (
    value &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.k)
  );
}

function normalizeNodes(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.flatMap((node) => {
    if (!node || typeof node !== "object") return [];
    const nodeId = typeof node.id === "string" && node.id ? node.id : id();
    if (seen.has(nodeId)) return [];
    seen.add(nodeId);
    const type = NODE_TYPES.has(node.type) ? node.type : "text";
    const position = isPoint(node.position) ? node.position : { x: 0, y: 0 };
    const metadata =
      node.metadata &&
      typeof node.metadata === "object" &&
      !Array.isArray(node.metadata)
        ? node.metadata
        : {};
    return [
      {
        id: nodeId,
        type,
        title:
          typeof node.title === "string" && node.title.trim()
            ? node.title.trim()
            : "未命名节点",
        position,
        width: Number.isFinite(node.width)
          ? Math.max(120, Math.min(1600, node.width))
          : 260,
        height: Number.isFinite(node.height)
          ? Math.max(90, Math.min(1200, node.height))
          : 180,
        metadata,
      },
    ];
  });
}

function normalizeNodeRelationships(nodes) {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  return nodes.map((node) => {
    const metadata = { ...node.metadata };
    let changed = false;

    const groupId =
      typeof metadata.groupId === "string" ? metadata.groupId : "";
    const group = groupId ? nodesById.get(groupId) : null;
    if (
      groupId &&
      (!group ||
        group.type !== "group" ||
        group.id === node.id ||
        node.type === "group")
    ) {
      delete metadata.groupId;
      changed = true;
    }

    const splitSourceNodeId =
      typeof metadata.splitSourceNodeId === "string"
        ? metadata.splitSourceNodeId
        : "";
    const splitSource = splitSourceNodeId
      ? nodesById.get(splitSourceNodeId)
      : null;
    if (
      splitSourceNodeId &&
      (!splitSource ||
        splitSource.id === node.id ||
        splitSource.type === "group" ||
        splitSource.type === "config" ||
        splitSource.type === "text")
    ) {
      delete metadata.splitSourceNodeId;
      delete metadata.splitOutputIndex;
      changed = true;
    }

    return changed ? { ...node, metadata } : node;
  });
}

function normalizeConnections(value, nodes) {
  if (!Array.isArray(value)) return [];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const seen = new Set();
  return value.flatMap((connection) => {
    if (!connection || typeof connection !== "object") return [];
    const fromNodeId =
      typeof connection.fromNodeId === "string" ? connection.fromNodeId : "";
    const toNodeId =
      typeof connection.toNodeId === "string" ? connection.toNodeId : "";
    if (
      !nodeIds.has(fromNodeId) ||
      !nodeIds.has(toNodeId) ||
      fromNodeId === toNodeId
    )
      return [];
    const from = nodesById.get(fromNodeId);
    const to = nodesById.get(toNodeId);
    if (!canPersistConnection(from, to)) return [];
    const key = `${fromNodeId}->${toNodeId}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [
      {
        id:
          typeof connection.id === "string" && connection.id
            ? connection.id
            : id(),
        fromNodeId,
        toNodeId,
      },
    ];
  });
}

function isPoint(value) {
  return value && Number.isFinite(value.x) && Number.isFinite(value.y);
}

function saveProject(project) {
  db.prepare(
    `
    insert into projects (id, title, created_at, updated_at, document_json)
    values (?, ?, ?, ?, ?)
    on conflict(id) do update set
      title = excluded.title,
      updated_at = excluded.updated_at,
      document_json = excluded.document_json
  `,
  ).run(
    project.id,
    project.title,
    project.createdAt,
    project.updatedAt,
    JSON.stringify(project),
  );
  return project;
}

app.get("/api/health", async () => ({ ok: true, name: "ArtboardFlow" }));

// ── 认证：注册 / 登录 / 当前用户 ─────────────────────────────
app.post("/api/auth/register", async (request, reply) => {
  const { username, password } = request.body || {};
  if (
    typeof username !== "string" ||
    !/^[a-zA-Z0-9_\u4e00-\u9fa5]{2,20}$/.test(username.trim())
  ) {
    return reply
      .code(400)
      .send({ error: "用户名需为 2-20 位字母、数字、下划线或中文" });
  }
  if (typeof password !== "string" || password.length < 6) {
    return reply.code(400).send({ error: "密码至少 6 位" });
  }
  const name = username.trim();
  const existing = db
    .prepare("select id from users where username = ?")
    .get(name);
  if (existing) return reply.code(409).send({ error: "用户名已存在" });

  const userId = id();
  db.prepare(
    "insert into users (id, username, password_hash, nickname, created_at) values (?, ?, ?, ?, ?)",
  ).run(userId, name, hashPassword(password), name, nowIso());
  const token = signToken({ sub: userId, username: name });
  return { token, user: { id: userId, username: name, nickname: name } };
});

app.post("/api/auth/login", async (request, reply) => {
  const { username, password } = request.body || {};
  if (typeof username !== "string" || typeof password !== "string") {
    return reply.code(400).send({ error: "请输入用户名和密码" });
  }
  const row = db
    .prepare("select * from users where username = ?")
    .get(username.trim());
  if (!row || !verifyPassword(password, row.password_hash)) {
    return reply.code(401).send({ error: "用户名或密码错误" });
  }
  const token = signToken({ sub: row.id, username: row.username });
  return {
    token,
    user: {
      id: row.id,
      username: row.username,
      nickname: row.nickname || row.username,
    },
  };
});

app.get("/api/auth/me", async (request, reply) => {
  const token = extractBearerToken(request);
  const payload = token ? verifyToken(token) : null;
  if (!payload) return reply.code(401).send({ error: "未登录或令牌已过期" });
  const row = db
    .prepare("select id, username, nickname from users where id = ?")
    .get(payload.sub);
  if (!row) return reply.code(401).send({ error: "用户不存在" });
  return {
    id: row.id,
    username: row.username,
    nickname: row.nickname || row.username,
  };
});

app.post("/api/assets", async (request, reply) => {
  const body =
    request.body && typeof request.body === "object" ? request.body : {};
  try {
    const asset = decodeDataUrlAsset(body.dataUrl);
    const storageKey = createAssetKey(id(), asset.mimeType);
    writeFileSync(join(assetDir, storageKey), asset.data);
    return reply.code(201).send({
      storageKey,
      url: `/api/assets/${storageKey}`,
      mimeType: asset.mimeType,
      bytes: asset.bytes,
      extension: assetExtensionFromMimeType(asset.mimeType),
    });
  } catch {
    return reply.code(400).send({ error: "INVALID_ASSET_DATA_URL" });
  }
});

app.get("/api/assets", async () => {
  return readdirSync(assetDir)
    .filter((key) => ASSET_KEY_PATTERN.test(key))
    .map((key) => assetRecordFromKey(key, statSync(join(assetDir, key))))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
});

app.get("/api/assets/:key", async (request, reply) => {
  const key = typeof request.params.key === "string" ? request.params.key : "";
  if (!ASSET_KEY_PATTERN.test(key))
    return reply.code(400).send({ error: "INVALID_ASSET_KEY" });
  const assetPath = join(assetDir, key);
  if (!existsSync(assetPath))
    return reply.code(404).send({ error: "ASSET_NOT_FOUND" });
  return reply
    .type(mimeTypeFromAssetKey(key))
    .send(createReadStream(assetPath));
});

app.get("/api/ip-assets", async () => {
  const rows = db
    .prepare(
      `
    select id, name, type, reference_keys_json, style_keywords, description, created_at, updated_at
    from ip_assets
    order by datetime(updated_at) desc
  `,
    )
    .all();
  return rows.map(parseIpAssetRow);
});

app.post("/api/ip-assets", async (request, reply) => {
  const body =
    request.body && typeof request.body === "object" ? request.body : {};
  try {
    const normalized = normalizeIpAsset(body);
    const now = nowIso();
    const assetId = id();
    db.prepare(
      `
    insert into ip_assets (id, name, type, reference_keys_json, style_keywords, description, created_at, updated_at)
    values (?, ?, ?, ?, ?, ?, ?, ?)
  `,
    ).run(
      assetId,
      normalized.name,
      normalized.type,
      JSON.stringify(normalized.referenceKeys),
      normalized.styleKeywords,
      normalized.description,
      now,
      now,
    );
    const row = db
      .prepare("select * from ip_assets where id = ?")
      .get(assetId);
    return reply.code(201).send(parseIpAssetRow(row));
  } catch (error) {
    return reply
      .code(400)
      .send({ error: error instanceof Error ? error.message : "参数错误" });
  }
});

app.get("/api/ip-assets/:id", async (request, reply) => {
  const row = db
    .prepare("select * from ip_assets where id = ?")
    .get(request.params.id);
  if (!row) return reply.code(404).send({ error: "IP资产不存在" });
  return parseIpAssetRow(row);
});

app.put("/api/ip-assets/:id", async (request, reply) => {
  const existing = db
    .prepare("select * from ip_assets where id = ?")
    .get(request.params.id);
  if (!existing) return reply.code(404).send({ error: "IP资产不存在" });
  const body =
    request.body && typeof request.body === "object" ? request.body : {};
  try {
    const prev = parseIpAssetRow(existing);
    const merged = {
      name: body.name ?? prev.name,
      type: body.type ?? prev.type,
      referenceKeys:
        body.referenceKeys ??
        body.reference_keys ??
        body.reference_keys_json ??
        prev.referenceKeys,
      styleKeywords:
        body.styleKeywords ?? body.style_keywords ?? prev.styleKeywords,
      description: body.description ?? prev.description,
    };
    // 处理 referenceKeys 为 JSON 字符串的情况
    if (typeof merged.referenceKeys === "string") {
      try {
        const parsed = JSON.parse(merged.referenceKeys);
        merged.referenceKeys = Array.isArray(parsed) ? parsed : [];
      } catch {
        merged.referenceKeys = [];
      }
    }
    const normalized = normalizeIpAsset(merged);
    const updatedAt = nowIso();
    db.prepare(
      `
    update ip_assets
    set name = ?, type = ?, reference_keys_json = ?, style_keywords = ?, description = ?, updated_at = ?
    where id = ?
  `,
    ).run(
      normalized.name,
      normalized.type,
      JSON.stringify(normalized.referenceKeys),
      normalized.styleKeywords,
      normalized.description,
      updatedAt,
      request.params.id,
    );
    const row = db
      .prepare("select * from ip_assets where id = ?")
      .get(request.params.id);
    return parseIpAssetRow(row);
  } catch (error) {
    return reply
      .code(400)
      .send({ error: error instanceof Error ? error.message : "参数错误" });
  }
});

app.delete("/api/ip-assets/:id", async (request, reply) => {
  const ipAssetId = request.params.id;
  // 检查是否被分镜镜头引用
  const shotRef = db
    .prepare("select id from storyboard_shots where ip_asset_id = ? limit 1")
    .get(ipAssetId);
  if (shotRef) {
    return reply.code(409).send({ error: "IP资产被分镜引用，无法删除" });
  }
  // 检查是否被分镜的 ip_asset_ids_json 引用（遍历解析，避免 LIKE 误判）
  const boards = db.prepare("select ip_asset_ids_json from storyboards").all();
  for (const b of boards) {
    try {
      const ids = b.ip_asset_ids_json ? JSON.parse(b.ip_asset_ids_json) : [];
      if (Array.isArray(ids) && ids.includes(ipAssetId)) {
        return reply.code(409).send({ error: "IP资产被分镜引用，无法删除" });
      }
    } catch {
      // LIKE 兜底：若 JSON 解析失败，退化为字符串匹配
      if (
        typeof b.ip_asset_ids_json === "string" &&
        b.ip_asset_ids_json.includes(ipAssetId)
      ) {
        return reply.code(409).send({ error: "IP资产被分镜引用，无法删除" });
      }
    }
  }
  const result = db
    .prepare("delete from ip_assets where id = ?")
    .run(ipAssetId);
  if (result.changes === 0)
    return reply.code(404).send({ error: "IP资产不存在" });
  return { ok: true };
});

// ── 分镜脚本：storyboards + shots ───────────────────────────
app.get("/api/storyboards", async (request) => {
  const q = request.query && typeof request.query === "object" ? request.query : {};
  const withShotCounts =
    q.withShotCounts === "1" ||
    q.withShotCounts === 1 ||
    q.withShotCounts === "true" ||
    q.withShotCounts === true;
  if (withShotCounts) {
    const rows = db
      .prepare(
        `
      select s.*, (select count(*) from storyboard_shots where storyboard_id = s.id) as shot_count
      from storyboards s
      order by datetime(s.updated_at) desc
    `,
      )
      .all();
    return rows.map((row) => {
      const base = parseStoryboardRow(row);
      const c = Number(row.shot_count) || 0;
      return { ...base, shotCount: c, shot_count: c };
    });
  }
  const rows = db
    .prepare(
      `
    select id, title, ip_asset_ids_json, created_at, updated_at
    from storyboards
    order by datetime(updated_at) desc
  `,
    )
    .all();
  return rows.map(parseStoryboardRow);
});

app.post("/api/storyboards", async (request, reply) => {
  const body =
    request.body && typeof request.body === "object" ? request.body : {};
  try {
    const normalized = normalizeStoryboard(body);
    if (normalized.ipAssetIds.length) {
      for (const aid of normalized.ipAssetIds) {
        const row = db.prepare("select id from ip_assets where id = ?").get(aid);
        if (!row) return reply.code(400).send({ error: `关联IP资产不存在: ${aid}` });
      }
    }
    const now = nowIso();
    const storyboardId = id();
    db.prepare(
      `
    insert into storyboards (id, title, ip_asset_ids_json, created_at, updated_at)
    values (?, ?, ?, ?, ?)
  `,
    ).run(
      storyboardId,
      normalized.title,
      JSON.stringify(normalized.ipAssetIds),
      now,
      now,
    );
    const row = db.prepare("select * from storyboards where id = ?").get(storyboardId);
    return reply.code(201).send(parseStoryboardRow(row));
  } catch (error) {
    return reply
      .code(400)
      .send({ error: error instanceof Error ? error.message : "参数错误" });
  }
});

app.get("/api/storyboards/:id", async (request, reply) => {
  const row = db.prepare("select * from storyboards where id = ?").get(request.params.id);
  if (!row) return reply.code(404).send({ error: "分镜不存在" });
  return parseStoryboardRow(row);
});

app.put("/api/storyboards/:id", async (request, reply) => {
  const existing = db.prepare("select * from storyboards where id = ?").get(request.params.id);
  if (!existing) return reply.code(404).send({ error: "分镜不存在" });
  const body =
    request.body && typeof request.body === "object" ? request.body : {};
  try {
    const prev = parseStoryboardRow(existing);
    const merged = {
      title: body.title ?? prev.title,
      ipAssetIds: body.ipAssetIds ?? body.ip_asset_ids ?? body.ip_asset_ids_json ?? prev.ipAssetIds,
    };
    if (typeof merged.ipAssetIds === "string") {
      try {
        const parsed = JSON.parse(merged.ipAssetIds);
        merged.ipAssetIds = Array.isArray(parsed) ? parsed : prev.ipAssetIds;
      } catch {
        merged.ipAssetIds = prev.ipAssetIds;
      }
    }
    const normalized = normalizeStoryboard(merged);
    if (normalized.ipAssetIds.length) {
      for (const aid of normalized.ipAssetIds) {
        const row = db.prepare("select id from ip_assets where id = ?").get(aid);
        if (!row) return reply.code(400).send({ error: `关联IP资产不存在: ${aid}` });
      }
    }
    const updatedAt = nowIso();
    db.prepare(
      `
    update storyboards
    set title = ?, ip_asset_ids_json = ?, updated_at = ?
    where id = ?
  `,
    ).run(normalized.title, JSON.stringify(normalized.ipAssetIds), updatedAt, request.params.id);
    const row = db.prepare("select * from storyboards where id = ?").get(request.params.id);
    return parseStoryboardRow(row);
  } catch (error) {
    return reply
      .code(400)
      .send({ error: error instanceof Error ? error.message : "参数错误" });
  }
});

app.delete("/api/storyboards/:id", async (request, reply) => {
  const exists = db.prepare("select id from storyboards where id = ?").get(request.params.id);
  if (!exists) return reply.code(404).send({ error: "分镜不存在" });
  db.exec("BEGIN");
  try {
    db.prepare(
      "delete from shot_reviews where shot_id in (select id from storyboard_shots where storyboard_id = ?)",
    ).run(request.params.id);
    db.prepare("delete from storyboard_shots where storyboard_id = ?").run(request.params.id);
    db.prepare("delete from storyboards where id = ?").run(request.params.id);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return { ok: true };
});

app.get("/api/storyboards/:id/shots", async (request, reply) => {
  const sb = db.prepare("select id from storyboards where id = ?").get(request.params.id);
  if (!sb) return reply.code(404).send({ error: "分镜不存在" });
  const rows = db
    .prepare(
      `
    select * from storyboard_shots
    where storyboard_id = ?
    order by order_index asc, datetime(created_at) asc
  `,
    )
    .all(request.params.id);
  return rows.map(parseShotRow);
});

app.post("/api/storyboards/:id/shots", async (request, reply) => {
  const sb = db.prepare("select id from storyboards where id = ?").get(request.params.id);
  if (!sb) return reply.code(404).send({ error: "分镜不存在" });
  const body =
    request.body && typeof request.body === "object" ? request.body : {};
  try {
    const normalized = normalizeShot(body);
    if (normalized.ipAssetId) {
      const asset = db.prepare("select id from ip_assets where id = ?").get(normalized.ipAssetId);
      if (!asset) return reply.code(400).send({ error: "关联IP资产不存在" });
    }
    const maxRow = db
      .prepare("select max(order_index) as maxIdx from storyboard_shots where storyboard_id = ?")
      .get(request.params.id);
    const hasOrder = body.orderIndex != null || body.order_index != null;
    const nextOrder = maxRow && maxRow.maxIdx != null ? maxRow.maxIdx + 1 : 0;
    const orderIndex = hasOrder ? normalized.orderIndex : nextOrder;
    const now = nowIso();
    const shotId = id();
    db.prepare(
      `
    insert into storyboard_shots (id, storyboard_id, order_index, duration_sec, description, camera, ip_asset_id, prompt_override, status, created_at, updated_at)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    ).run(
      shotId,
      request.params.id,
      orderIndex,
      normalized.durationSec,
      normalized.description,
      normalized.camera,
      normalized.ipAssetId,
      normalized.promptOverride,
      normalized.status,
      now,
      now,
    );
    const row = db.prepare("select * from storyboard_shots where id = ?").get(shotId);
    return reply.code(201).send(parseShotRow(row));
  } catch (error) {
    return reply
      .code(400)
      .send({ error: error instanceof Error ? error.message : "参数错误" });
  }
});

app.put("/api/storyboards/:id/shots/:shotId", async (request, reply) => {
  const sb = db.prepare("select id from storyboards where id = ?").get(request.params.id);
  if (!sb) return reply.code(404).send({ error: "分镜不存在" });
  const existing = db
    .prepare("select * from storyboard_shots where id = ? and storyboard_id = ?")
    .get(request.params.shotId, request.params.id);
  if (!existing) return reply.code(404).send({ error: "分镜镜头不存在" });
  const body =
    request.body && typeof request.body === "object" ? request.body : {};
  try {
    const prev = parseShotRow(existing);
    const merged = {
      description: body.description ?? prev.description,
      camera: body.camera ?? prev.camera,
      durationSec: body.durationSec ?? body.duration_sec ?? body.duration ?? prev.durationSec,
      orderIndex: body.orderIndex ?? body.order_index ?? prev.orderIndex,
      ipAssetId: body.ipAssetId ?? body.ip_asset_id ?? prev.ipAssetId,
      promptOverride: body.promptOverride ?? body.prompt_override ?? prev.promptOverride,
      status: body.status ?? prev.status,
    };
    const normalized = normalizeShot(merged);
    if (normalized.ipAssetId) {
      const asset = db.prepare("select id from ip_assets where id = ?").get(normalized.ipAssetId);
      if (!asset) return reply.code(400).send({ error: "关联IP资产不存在" });
    }
    const updatedAt = nowIso();
    db.prepare(
      `
    update storyboard_shots
    set description = ?, camera = ?, duration_sec = ?, order_index = ?, ip_asset_id = ?, prompt_override = ?, status = ?, updated_at = ?
    where id = ?
  `,
    ).run(
      normalized.description,
      normalized.camera,
      normalized.durationSec,
      normalized.orderIndex,
      normalized.ipAssetId,
      normalized.promptOverride,
      normalized.status,
      updatedAt,
      request.params.shotId,
    );
    const row = db.prepare("select * from storyboard_shots where id = ?").get(request.params.shotId);
    return parseShotRow(row);
  } catch (error) {
    return reply
      .code(400)
      .send({ error: error instanceof Error ? error.message : "参数错误" });
  }
});

app.delete("/api/storyboards/:id/shots/:shotId", async (request, reply) => {
  const sb = db.prepare("select id from storyboards where id = ?").get(request.params.id);
  if (!sb) return reply.code(404).send({ error: "分镜不存在" });
  const result = db
    .prepare("delete from storyboard_shots where id = ? and storyboard_id = ?")
    .run(request.params.shotId, request.params.id);
  if (result.changes === 0) return reply.code(404).send({ error: "分镜镜头不存在" });
  const remaining = db
    .prepare("select id from storyboard_shots where storyboard_id = ? order by order_index asc, datetime(created_at) asc")
    .all(request.params.id);
  {
    const upd = db.prepare("update storyboard_shots set order_index = ?, updated_at = ? where id = ?");
    const now = nowIso();
    db.exec("BEGIN");
    try {
      remaining.forEach((r, idx) => upd.run(idx, now, r.id));
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  return { ok: true };
});

app.post("/api/storyboards/:id/reorder", async (request, reply) => {
  const sb = db.prepare("select id from storyboards where id = ?").get(request.params.id);
  if (!sb) return reply.code(404).send({ error: "分镜不存在" });
  const body =
    request.body && typeof request.body === "object" ? request.body : {};
  const orderedIds = body.orderedIds ?? body.ordered_ids ?? body.ids;
  if (!Array.isArray(orderedIds)) {
    return reply.code(400).send({ error: "排序参数需为 orderedIds 数组" });
  }
  const cleanIds = orderedIds.filter((v) => typeof v === "string");
  if (cleanIds.length !== orderedIds.length) {
    return reply.code(400).send({ error: "排序参数包含非字符串ID" });
  }
  if (new Set(cleanIds).size !== cleanIds.length) {
    return reply.code(400).send({ error: "排序包含重复ID" });
  }
  const existing = db
    .prepare("select id from storyboard_shots where storyboard_id = ?")
    .all(request.params.id);
  const existingIds = new Set(existing.map((r) => r.id));
  if (cleanIds.length !== existing.length) {
    return reply.code(400).send({ error: "排序数量与镜头数量不匹配" });
  }
  for (const oid of cleanIds) {
    if (!existingIds.has(oid)) {
      return reply.code(400).send({ error: `镜头不存在或不属于该分镜: ${oid}` });
    }
  }
  {
    const upd = db.prepare("update storyboard_shots set order_index = ?, updated_at = ? where id = ?");
    const now = nowIso();
    db.exec("BEGIN");
    try {
      cleanIds.forEach((sid, idx) => upd.run(idx, now, sid));
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  const rows = db
    .prepare(
      `
    select * from storyboard_shots
    where storyboard_id = ?
    order by order_index asc
  `,
    )
    .all(request.params.id);
  return rows.map(parseShotRow);
});

// ── 分镜批量生成：为每个 shot 创建 generation_job ───────────────
app.post("/api/storyboards/:id/generate", async (request, reply) => {
  const sb = db.prepare("select id from storyboards where id = ?").get(request.params.id);
  if (!sb) return reply.code(404).send({ error: "分镜不存在" });
  const shots = db
    .prepare(
      `
    select * from storyboard_shots
    where storyboard_id = ?
    order by order_index asc, datetime(created_at) asc
  `,
    )
    .all(request.params.id);
  if (!shots.length) return reply.code(400).send({ error: "暂无分镜" });
  const jobs = [];
  const insert = db.prepare(
    `
    insert into generation_jobs (id, project_id, node_id, status, created_at, updated_at, payload_json, result_json, error)
    values (?, ?, ?, ?, ?, ?, ?, null, null)
  `,
  );
  const now = nowIso();
  for (const shot of shots) {
    const prompt = [shot.description, shot.prompt_override].filter(Boolean).join("\n");
    // 查询 IP 参考图并映射为 generation payload inputs
    let inputs = [];
    if (shot.ip_asset_id) {
      try {
        const ipRow = db
          .prepare("select reference_keys_json from ip_assets where id = ?")
          .get(shot.ip_asset_id);
        if (ipRow && ipRow.reference_keys_json) {
          const keys = JSON.parse(ipRow.reference_keys_json);
          if (Array.isArray(keys)) {
            inputs = keys
              .filter((k) => typeof k === "string" && k.trim())
              .map((key) => ({
                type: "image",
                title: "IP参考图",
                media: {
                  url: `/api/assets/${key}`,
                  mimeType: mimeTypeFromAssetKey(key),
                  storageKey: key,
                },
              }));
          }
        }
      } catch {
        inputs = [];
      }
    }
    const summary = {
      text: 1,
      image: inputs.length,
      video: 0,
      audio: 0,
    };
    const rawPayload = {
      mode: "video",
      model: "doubao-seedance-2-5-260628",
      prompt,
      duration: shot.duration_sec,
      camera: shot.camera,
      ipAssetId: shot.ip_asset_id,
      shotId: shot.id,
      inputs,
      summary,
    };
    const base = normalizeGenerationJobPayload(rawPayload);
    const payload = {
      ...base,
      mode: "video",
      model: "doubao-seedance-2-5-260628",
      prompt,
      duration: shot.duration_sec,
      camera: shot.camera,
      ipAssetId: shot.ip_asset_id,
      shotId: shot.id,
      inputs: base.inputs,
      summary: base.summary,
    };
    // 必须基于最终持久化 payload 估算成本：normalize 会丢掉顶层 duration 并把模型兜底为 default
    payload.estimatedCostCny = estimateGenerationCostCny(payload);
    const jobId = id();
    insert.run(jobId, request.params.id, shot.id, "queued", now, now, JSON.stringify(payload));
    const row = db.prepare("select * from generation_jobs where id = ?").get(jobId);
    jobs.push(parseGenerationJob(row));
  }
  return { jobs };
});

// ── 审核与看板：shot_reviews + dashboard ───────────────────────
app.post("/api/shots/:shotId/reviews", async (request, reply) => {
  const shot = db
    .prepare("select id from storyboard_shots where id = ?")
    .get(request.params.shotId);
  if (!shot) return reply.code(404).send({ error: "分镜镜头不存在" });
  const body =
    request.body && typeof request.body === "object" ? request.body : {};
  try {
    const normalized = normalizeReview(body);
    const now = nowIso();
    const reviewId = id();
    db.prepare(
      `
    insert into shot_reviews (id, shot_id, generation_job_id, verdict, reason, comment, created_at)
    values (?, ?, ?, ?, ?, ?, ?)
  `,
    ).run(
      reviewId,
      request.params.shotId,
      normalized.generationJobId,
      normalized.verdict,
      normalized.reason,
      normalized.comment,
      now,
    );
    const row = db
      .prepare("select * from shot_reviews where id = ?")
      .get(reviewId);
    return reply.code(201).send(parseReviewRow(row));
  } catch (error) {
    return reply
      .code(400)
      .send({ error: error instanceof Error ? error.message : "参数错误" });
  }
});

app.get("/api/storyboards/:id/reviews", async (request, reply) => {
  const sb = db.prepare("select id from storyboards where id = ?").get(request.params.id);
  if (!sb) return reply.code(404).send({ error: "分镜不存在" });
  const rows = db
    .prepare(
      `
    select r.* from shot_reviews r
    join storyboard_shots s on r.shot_id = s.id
    where s.storyboard_id = ?
    order by datetime(r.created_at) desc
  `,
    )
    .all(request.params.id);
  return rows.map(parseReviewRow);
});

app.get("/api/dashboard/stats", async () => {
  const jobRows = db.prepare("select status, payload_json from generation_jobs").all();
  // 单条脏数据不应打挂整个看板：解析失败降级为空 payload
  const jobs = [];
  for (const row of jobRows) {
    let payload;
    try {
      payload = JSON.parse(row.payload_json);
    } catch {
      app.log.warn({ jobId: row.id }, "dashboard stats: malformed generation job payload");
      payload = {};
    }
    jobs.push({ status: normalizeGenerationJobStatus(row.status), payload });
  }
  const reviews = db.prepare("select verdict, reason from shot_reviews").all();
  const agg = aggregateDashboard({ jobs, reviews });
  const storyboardCount = db
    .prepare("select count(*) as c from storyboards")
    .get();
  const shotCount = db
    .prepare("select count(*) as c from storyboard_shots")
    .get();
  const totalStoryboards = storyboardCount ? Number(storyboardCount.c) : 0;
  const totalShots = shotCount ? Number(shotCount.c) : 0;
  const metrics = summarizeGenerationMetrics(jobs);
  return {
    ...agg,
    totalStoryboards,
    totalShots,
    ...metrics,
  };
});

app.get("/api/projects", async () => {
  const rows = db
    .prepare(
      `
    select id, title, created_at, updated_at, document_json
    from projects
    order by datetime(updated_at) desc
  `,
    )
    .all();
  return rows.map(parseDocument);
});

app.post("/api/projects", async (request, reply) => {
  const title = request.body?.title;
  const project = normalizeProject({
    title: typeof title === "string" ? title : "未命名画布",
  });
  saveProject(project);
  return reply.code(201).send(project);
});

app.post("/api/projects/import", async (request, reply) => {
  const project = normalizeProject({
    ...request.body,
    id: id(),
    title:
      typeof request.body?.title === "string"
        ? `${request.body.title} 副本`
        : "导入画布",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
  saveProject(project);
  return reply.code(201).send(project);
});

app.get("/api/projects/:id", async (request, reply) => {
  const row = db
    .prepare("select * from projects where id = ?")
    .get(request.params.id);
  if (!row) return reply.code(404).send({ error: "PROJECT_NOT_FOUND" });
  return parseDocument(row);
});

app.put("/api/projects/:id", async (request, reply) => {
  const row = db
    .prepare("select * from projects where id = ?")
    .get(request.params.id);
  if (!row) return reply.code(404).send({ error: "PROJECT_NOT_FOUND" });

  const previous = parseDocument(row);
  const patch =
    request.body && typeof request.body === "object" ? request.body : {};
  const project = normalizeProject({
    ...previous,
    ...patch,
    id: previous.id,
    createdAt: previous.createdAt,
    updatedAt: nowIso(),
  });
  saveProject(project);
  return project;
});

app.delete("/api/projects/:id", async (request, reply) => {
  const result = db
    .prepare("delete from projects where id = ?")
    .run(request.params.id);
  if (result.changes === 0)
    return reply.code(404).send({ error: "PROJECT_NOT_FOUND" });
  return { ok: true };
});

app.delete("/api/projects", async (request) => {
  const ids = Array.isArray(request.body?.ids)
    ? request.body.ids.filter((value) => typeof value === "string")
    : [];
  const remove = db.prepare("delete from projects where id = ?");
  db.exec("BEGIN");
  try {
    for (const projectId of ids) remove.run(projectId);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return { ok: true, deleted: ids.length };
});

app.post("/api/generation/jobs", async (request, reply) => {
  const body =
    request.body && typeof request.body === "object" ? request.body : {};
  const projectId = typeof body.projectId === "string" ? body.projectId : "";
  const nodeId = typeof body.nodeId === "string" ? body.nodeId : "";
  if (!projectId || !nodeId)
    return reply.code(400).send({ error: "INVALID_GENERATION_JOB_TARGET" });

  const row = db.prepare("select id from projects where id = ?").get(projectId);
  if (!row) return reply.code(404).send({ error: "PROJECT_NOT_FOUND" });

  const createdAt = nowIso();
  const payload = normalizeGenerationJobPayload(body.payload);
  const job = {
    id: id(),
    projectId,
    nodeId,
    status: "queued",
    createdAt,
    updatedAt: createdAt,
    payload: {
      ...payload,
      // 画布单节点生成：payload 顶层已带 model/duration（normalize 后），基于最终 payload 估算
      estimatedCostCny: estimateGenerationCostCny(payload),
    },
    result: null,
    error: undefined,
  };
  db.prepare(
    `
    insert into generation_jobs (id, project_id, node_id, status, created_at, updated_at, payload_json, result_json, error)
    values (?, ?, ?, ?, ?, ?, ?, null, null)
  `,
  ).run(
    job.id,
    job.projectId,
    job.nodeId,
    job.status,
    job.createdAt,
    job.updatedAt,
    JSON.stringify(job.payload),
  );

  return reply.code(201).send(job);
});

app.get("/api/generation/jobs", async (request) => {
  const projectId =
    typeof request.query?.projectId === "string" ? request.query.projectId : "";
  const nodeId =
    typeof request.query?.nodeId === "string" ? request.query.nodeId : "";
  const clauses = [];
  const values = [];
  if (projectId) {
    clauses.push("project_id = ?");
    values.push(projectId);
  }
  if (nodeId) {
    clauses.push("node_id = ?");
    values.push(nodeId);
  }
  const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
  const rows = db
    .prepare(
      `
    select * from generation_jobs
    ${where}
    order by datetime(updated_at) desc
    limit 100
  `,
    )
    .all(...values);
  return rows.map(parseGenerationJob);
});

app.get("/api/generation/jobs/:id", async (request, reply) => {
  const row = db
    .prepare("select * from generation_jobs where id = ?")
    .get(request.params.id);
  if (!row) return reply.code(404).send({ error: "GENERATION_JOB_NOT_FOUND" });
  return parseGenerationJob(row);
});

app.post("/api/generation/jobs/:id/cancel", async (request, reply) => {
  const previous = db
    .prepare("select * from generation_jobs where id = ?")
    .get(request.params.id);
  if (!previous)
    return reply.code(404).send({ error: "GENERATION_JOB_NOT_FOUND" });

  const currentStatus = normalizeGenerationJobStatus(previous.status);
  if (
    currentStatus === "succeeded" ||
    currentStatus === "failed" ||
    currentStatus === "cancelled"
  ) {
    return parseGenerationJob(previous);
  }

  const updatedAt = nowIso();
  db.prepare(
    `
    update generation_jobs
    set status = 'cancelled', updated_at = ?, error = ?
    where id = ?
  `,
  ).run(updatedAt, "用户已停止生成", request.params.id);

  const row = db
    .prepare("select * from generation_jobs where id = ?")
    .get(request.params.id);
  return parseGenerationJob(row);
});

// ── 失败重试：基于原任务 payload 新建任务，保留成本与来源可追溯 ──
app.post("/api/generation/jobs/:id/retry", async (request, reply) => {
  const previous = db
    .prepare("select * from generation_jobs where id = ?")
    .get(request.params.id);
  if (!previous)
    return reply.code(404).send({ error: "GENERATION_JOB_NOT_FOUND" });

  const previousStatus = normalizeGenerationJobStatus(previous.status);
  if (previousStatus !== "failed" && previousStatus !== "cancelled") {
    return reply
      .code(409)
      .send({ error: "仅失败或已取消的任务可以重试" });
  }

  let payload;
  try {
    payload = JSON.parse(previous.payload_json);
  } catch {
    return reply.code(500).send({ error: "原任务数据损坏，无法重试" });
  }

  const now = nowIso();
  const newId = id();
  db.prepare(
    `
    insert into generation_jobs (id, project_id, node_id, status, created_at, updated_at, payload_json, result_json, error)
    values (?, ?, ?, 'queued', ?, ?, ?, null, null)
  `,
  ).run(newId, previous.project_id, previous.node_id, now, now, JSON.stringify(payload));

  // 原任务置为 cancelled：其成本仍计入"未产出浪费"（已扣费），但状态上不再等待处理
  db.prepare(
    `update generation_jobs set status = 'cancelled', updated_at = ?, error = ? where id = ?`,
  ).run(now, "已由重试任务替代", request.params.id);

  const row = db.prepare("select * from generation_jobs where id = ?").get(newId);
  return reply.code(201).send(parseGenerationJob(row));
});

app.put("/api/generation/jobs/:id", async (request, reply) => {
  const previous = db
    .prepare("select * from generation_jobs where id = ?")
    .get(request.params.id);
  if (!previous)
    return reply.code(404).send({ error: "GENERATION_JOB_NOT_FOUND" });

  const body =
    request.body && typeof request.body === "object" ? request.body : {};
  const status = normalizeGenerationJobStatus(body.status);
  const result =
    status === "succeeded" ? normalizeGenerationJobResult(body.result) : null;
  const error =
    status === "failed" ? String(body.error || "Generation failed") : null;
  const updatedAt = nowIso();
  db.prepare(
    `
    update generation_jobs
    set status = ?, updated_at = ?, result_json = ?, error = ?
    where id = ?
  `,
  ).run(
    status,
    updatedAt,
    result ? JSON.stringify(result) : null,
    error,
    request.params.id,
  );

  const row = db
    .prepare("select * from generation_jobs where id = ?")
    .get(request.params.id);
  return parseGenerationJob(row);
});

const port = Number(process.env.PORT || 8787);
app.listen({ host: "127.0.0.1", port }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
