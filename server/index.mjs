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
  const result = db
    .prepare("delete from ip_assets where id = ?")
    .run(request.params.id);
  if (result.changes === 0)
    return reply.code(404).send({ error: "IP资产不存在" });
  return { ok: true };
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
  const transaction = db.transaction((projectIds) => {
    for (const projectId of projectIds) remove.run(projectId);
  });
  transaction(ids);
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
    payload,
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
