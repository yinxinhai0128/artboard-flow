export const IP_ASSET_TYPES = new Set(["character", "scene", "prop"]);

function normalizeName(name) {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed || trimmed.length < 2 || trimmed.length > 30) {
    throw new Error("名称需为 2-30 字符");
  }
  return trimmed;
}

function normalizeType(type) {
  const trimmed = typeof type === "string" ? type.trim() : "";
  if (!IP_ASSET_TYPES.has(trimmed)) {
    throw new Error("类型需为 character、scene 或 prop");
  }
  return trimmed;
}

function normalizeReferenceKeys(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new Error("参考图需为数组");
  }
  const keys = value
    .filter((k) => typeof k === "string")
    .map((k) => k.trim())
    .filter(Boolean);
  if (keys.length > 6) {
    throw new Error("参考图最多 6 张");
  }
  return keys;
}

function normalizeStyleKeywords(value) {
  if (value == null) return "";
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeDescription(value) {
  if (value == null) return "";
  if (typeof value !== "string") return "";
  return value.trim();
}

export function normalizeIpAsset(input = {}) {
  const data = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const name = normalizeName(data.name);
  const type = normalizeType(data.type);
  // 兼容多种字段名：referenceKeys / reference_keys / referenceKeysJson
  const rawKeys = data.referenceKeys ?? data.reference_keys ?? data.reference_keys_json ?? [];
  // 如果是 JSON 字符串则尝试解析
  let referenceKeysInput = rawKeys;
  if (typeof rawKeys === "string") {
    try {
      const parsed = JSON.parse(rawKeys);
      referenceKeysInput = Array.isArray(parsed) ? parsed : [];
    } catch {
      referenceKeysInput = [];
    }
  }
  const referenceKeys = normalizeReferenceKeys(referenceKeysInput);
  const styleKeywords = normalizeStyleKeywords(data.styleKeywords ?? data.style_keywords ?? "");
  const description = normalizeDescription(data.description ?? "");
  return {
    name,
    type,
    referenceKeys,
    styleKeywords,
    description,
  };
}

export function validateIpAssetInput(input) {
  normalizeIpAsset(input);
}

export function parseIpAssetRow(row) {
  if (!row || typeof row !== "object") return null;
  let referenceKeys = [];
  try {
    referenceKeys = row.reference_keys_json ? JSON.parse(row.reference_keys_json) : [];
    if (!Array.isArray(referenceKeys)) referenceKeys = [];
  } catch {
    referenceKeys = [];
  }
  // 过滤并 trim，保持一致性
  referenceKeys = referenceKeys
    .filter((k) => typeof k === "string")
    .map((k) => k.trim())
    .filter(Boolean);
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    referenceKeys,
    styleKeywords: row.style_keywords || "",
    description: row.description || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
