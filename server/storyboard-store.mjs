export const CAMERAS = new Set(["push", "pull", "orbit", "static", "follow"]);

function normalizeTitle(title) {
  const trimmed = typeof title === "string" ? title.trim() : "";
  if (!trimmed || trimmed.length < 2 || trimmed.length > 50) {
    throw new Error("标题需为 2-50 字符");
  }
  return trimmed;
}

function normalizeIpAssetIds(value) {
  if (value == null) return [];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) value = parsed;
      else return [];
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value
    .filter((v) => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean);
}

function normalizeDescription(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed || trimmed.length < 1 || trimmed.length > 500) {
    throw new Error("分镜描述需为 1-500 字符");
  }
  return trimmed;
}

function normalizeCamera(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (CAMERAS.has(trimmed)) return trimmed;
  return "static";
}

function normalizeDuration(value) {
  if (value == null || value === "") return 5;
  const n = Number(value);
  if (!Number.isFinite(n)) return 5;
  const int = Math.round(n);
  if (int < 2 || int > 15) {
    throw new Error("时长需为 2-15 秒");
  }
  return int;
}

function normalizeOrderIndex(value) {
  if (value == null || value === "") return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const int = Math.round(n);
  if (int < 0 || int > 100) {
    throw new Error("排序需为 0-100");
  }
  return int;
}

function normalizeIpAssetId(value) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizePromptOverride(value) {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function normalizeStoryboard(input = {}) {
  const data = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const title = normalizeTitle(data.title);
  const rawIds = data.ipAssetIds ?? data.ip_asset_ids ?? data.ip_asset_ids_json ?? data.ipAssetIdsJson ?? [];
  const ipAssetIds = normalizeIpAssetIds(rawIds);
  return { title, ipAssetIds };
}

export function normalizeShot(input = {}) {
  const data = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const description = normalizeDescription(data.description);
  const camera = normalizeCamera(data.camera);
  const rawDuration = data.durationSec ?? data.duration_sec ?? data.duration ?? 5;
  const durationSec = normalizeDuration(rawDuration);
  const rawOrder = data.orderIndex ?? data.order_index ?? 0;
  const orderIndex = normalizeOrderIndex(rawOrder);
  const rawIpAssetId = data.ipAssetId ?? data.ip_asset_id ?? null;
  const ipAssetId = normalizeIpAssetId(rawIpAssetId);
  const rawPrompt = data.promptOverride ?? data.prompt_override ?? null;
  const promptOverride = normalizePromptOverride(rawPrompt);
  const status = typeof data.status === "string" && data.status.trim() ? data.status.trim() : "pending";
  return {
    description,
    camera,
    durationSec,
    orderIndex,
    ipAssetId,
    promptOverride,
    status,
  };
}

export function parseStoryboardRow(row) {
  if (!row || typeof row !== "object") return null;
  let ipAssetIds = [];
  try {
    ipAssetIds = row.ip_asset_ids_json ? JSON.parse(row.ip_asset_ids_json) : [];
    if (!Array.isArray(ipAssetIds)) ipAssetIds = [];
  } catch {
    ipAssetIds = [];
  }
  ipAssetIds = ipAssetIds.filter((v) => typeof v === "string").map((v) => v.trim()).filter(Boolean);
  return {
    id: row.id,
    title: row.title,
    ipAssetIds,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function parseShotRow(row) {
  if (!row || typeof row !== "object") return null;
  return {
    id: row.id,
    storyboardId: row.storyboard_id,
    orderIndex: row.order_index,
    durationSec: row.duration_sec,
    description: row.description,
    camera: row.camera,
    ipAssetId: row.ip_asset_id || null,
    promptOverride: row.prompt_override || null,
    status: row.status || "pending",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
