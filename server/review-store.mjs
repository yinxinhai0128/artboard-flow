export const VERDICTS = new Set(["approved", "rejected"]);
export const REASONS = new Set([
  "face_collapse",
  "armor_error",
  "style_drift",
  "camera_error",
  "text_error",
  "other",
]);

function normalizeVerdict(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!VERDICTS.has(trimmed)) {
    throw new Error("审核结果需为 approved 或 rejected");
  }
  return trimmed;
}

function normalizeReason(value, verdict) {
  // verdict 已校验
  const raw = value == null ? "" : typeof value === "string" ? value.trim() : "";
  if (verdict === "rejected") {
    if (!raw) {
      throw new Error("驳回时原因必填");
    }
    if (!REASONS.has(raw)) {
      throw new Error(
        "原因需为 face_collapse、armor_error、style_drift、camera_error、text_error 或 other",
      );
    }
    return raw;
  }
  // approved: reason 可为空，若提供则需在集合内
  if (!raw) return null;
  if (!REASONS.has(raw)) {
    throw new Error(
      "原因需为 face_collapse、armor_error、style_drift、camera_error、text_error 或 other",
    );
  }
  return raw;
}

function normalizeComment(value) {
  if (value == null || value === "") return "";
  if (typeof value !== "string") {
    throw new Error("备注需为字符串");
  }
  const trimmed = value.trim();
  if (trimmed.length > 500) {
    throw new Error("备注需为 0-500 字符");
  }
  return trimmed;
}

function normalizeGenerationJobId(value) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function normalizeReview(input = {}) {
  const data =
    input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const verdict = normalizeVerdict(data.verdict);
  const rawReason = data.reason ?? data.reason_code ?? null;
  const reason = normalizeReason(rawReason, verdict);
  const comment = normalizeComment(data.comment);
  const rawGid =
    data.generationJobId ??
    data.generation_job_id ??
    data.generation_jobId ??
    data.generationJob_id ??
    null;
  const generationJobId = normalizeGenerationJobId(rawGid);
  return {
    verdict,
    reason,
    comment,
    generationJobId,
  };
}

export function parseReviewRow(row) {
  if (!row || typeof row !== "object") return null;
  return {
    id: row.id,
    shotId: row.shot_id,
    generationJobId: row.generation_job_id || null,
    verdict: row.verdict,
    reason: row.reason || null,
    comment: row.comment || "",
    createdAt: row.created_at,
  };
}

export function aggregateDashboard({ jobs = [], reviews = [] } = {}) {
  const safeJobs = Array.isArray(jobs) ? jobs : [];
  const safeReviews = Array.isArray(reviews) ? reviews : [];
  const totalJobs = safeJobs.length;
  const succeeded = safeJobs.filter((j) => j && j.status === "succeeded").length;
  const successRate = totalJobs ? succeeded / totalJobs : 0;
  const totalReviews = safeReviews.length;
  const approved = safeReviews.filter((r) => r && r.verdict === "approved").length;
  const approvedRate = totalReviews ? approved / totalReviews : 0;

  const reasonCount = new Map();
  for (const r of safeReviews) {
    const reason = r && typeof r.reason === "string" ? r.reason.trim() : "";
    if (!reason) continue;
    // 仅统计合法 reason，若不在集合内也计数（兼容异常数据），但优先统计集合内
    reasonCount.set(reason, (reasonCount.get(reason) || 0) + 1);
  }
  const badCaseTop3 = [...reasonCount.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
    .slice(0, 3)
    .map(([reason, count]) => ({ reason, count }));

  return {
    successRate,
    approvedRate,
    badCaseTop3,
    totalJobs,
    totalReviews,
  };
}
