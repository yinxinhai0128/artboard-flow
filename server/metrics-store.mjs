export const MODEL_COST_CNY = Object.freeze({
  "doubao-seedance-2-5-260628": 0.4,
  "doubao-seedance-2-0-260128": 0.4,
});

export function estimateGenerationCostCny(payload = {}) {
  const model = typeof payload.model === "string" ? payload.model.trim() : "";
  const base = MODEL_COST_CNY[model] ?? 0;
  const duration = Number(payload.duration);
  if (!base || !Number.isFinite(duration) || duration <= 0) return 0;
  return Number((base * (duration / 5)).toFixed(4));
}

/**
 * 口径说明：
 * - 视频生成 API 按"提交任务"计费，failed 的任务通常也已产生模型调用费用；
 *   cancelled 可能发生在生成中或开始前，这里保守计入"未产出成本"，UI 上明确标注。
 * - succeededCostCny：仅统计成功任务的估算成本，代表"有效产出"。
 * - unproducedCostCny：failed + cancelled 任务估算成本，代表"花了钱但没产出"的部分，
 *   是成本治理最关注的浪费指标。
 */
export function summarizeGenerationMetrics(jobs = []) {
  const safeJobs = Array.isArray(jobs) ? jobs : [];
  let totalEstimatedCostCny = 0;
  let succeededEstimatedCostCny = 0;
  let unproducedCostCny = 0;
  let totalVideoSeconds = 0;
  let knownCostJobs = 0;

  for (const job of safeJobs) {
    const payload = job?.payload && typeof job.payload === "object" ? job.payload : {};
    const stored = Number(payload.estimatedCostCny);
    const estimatedCost = Number.isFinite(stored)
      ? Math.max(0, stored)
      : estimateGenerationCostCny(payload);
    if (estimatedCost > 0) {
      totalEstimatedCostCny += estimatedCost;
      knownCostJobs += 1;
      if (job.status === "succeeded") {
        succeededEstimatedCostCny += estimatedCost;
      } else if (job.status === "failed" || job.status === "cancelled") {
        unproducedCostCny += estimatedCost;
      }
    }
    const duration = Number(payload.duration);
    if (Number.isFinite(duration) && duration > 0) totalVideoSeconds += duration;
  }

  const round = (v) => Number(v.toFixed(4));
  return {
    totalEstimatedCostCny: round(totalEstimatedCostCny),
    succeededEstimatedCostCny: round(succeededEstimatedCostCny),
    unproducedCostCny: round(unproducedCostCny),
    totalVideoSeconds,
    knownCostJobs,
  };
}
