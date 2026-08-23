#!/usr/bin/env node
/**
 * 成本治理闭环演示脚本
 * 流程：创建 IP资产 → 分镜 → 镜头 → 批量生成 → 模拟一次失败 → 重试 → 输出看板统计
 *
 * 用法：
 *   1. 先启动后端：node server/index.mjs
 *   2. 再运行：    node scripts/demo-metrics.mjs
 */
const BASE = process.env.API_BASE || "http://127.0.0.1:8787";

async function req(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok)
    throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function main() {
  // 0. 健康检查
  try {
    await req("GET", "/api/dashboard/stats");
  } catch {
    console.error(`✗ 后端未启动：请先运行 node server/index.mjs （${BASE}）`);
    process.exit(1);
  }
  console.log(`✓ 后端已连接 ${BASE}\n`);

  // 1. 创建 IP 资产
  const ip = await req("POST", "/api/ip-assets", {
    name: `演示骑士-${Date.now() % 10000}`,
    type: "character",
    styleKeywords: "写实,铠甲,废墟",
  });
  console.log(`✓ IP资产已创建: ${ip.name}`);

  // 2. 创建分镜 + 两个镜头（第二个绑定 IP 参考图）
  const sb = await req("POST", "/api/storyboards", { title: "演示CG-废墟觉醒" });
  await req("POST", `/api/storyboards/${sb.id}/shots`, {
    description: "废墟城市远景，乌云压城",
    camera: "push",
    durationSec: 5,
  });
  await req("POST", `/api/storyboards/${sb.id}/shots`, {
    description: "骑士背影转身特写",
    camera: "orbit",
    durationSec: 10,
    ipAssetId: ip.id,
  });
  console.log("✓ 分镜已创建（2 个镜头：5s + 10s）");

  // 3. 一键批量生成
  const { jobs } = await req("POST", `/api/storyboards/${sb.id}/generate`);
  const batchCost = jobs.reduce(
    (sum, j) => sum + (j.payload?.estimatedCostCny || 0),
    0,
  );
  console.log(
    `✓ 批量生成 ${jobs.length} 个任务，预估成本 ¥${batchCost.toFixed(2)}（¥0.4/5秒 × 时长）`,
  );

  // 本地无真实模型 Worker，手动推进状态演示完整口径
  // 4. 第一个任务成功、第二个任务失败
  await req("PUT", `/api/generation/jobs/${jobs[0].id}`, {
    status: "succeeded",
    result: { url: "https://example.com/demo-shot-1.mp4", mimeType: "video/mp4" },
  });
  console.log(`✓ [演示] 任务1 ${jobs[0].id.slice(0, 8)} → succeeded`);

  await req("PUT", `/api/generation/jobs/${jobs[1].id}`, {
    status: "failed",
    error: "模拟失败：内容审核未通过",
  });
  console.log(`✓ [演示] 任务2 ${jobs[1].id.slice(0, 8)} → failed`);

  // 5. 对失败任务发起重试
  const retried = await req("POST", `/api/generation/jobs/${jobs[1].id}/retry`);
  console.log(
    `✓ 已创建重试任务 ${retried.id.slice(0, 8)}（旧任务成本保留在"未产出浪费"，因为 API 提交即扣费）`,
  );

  // 6. 输出看板统计
  const stats = await req("GET", "/api/dashboard/stats");
  console.log("\n════════ 数据看板 ════════");
  console.log(
    `分镜 ${stats.totalStoryboards} · 镜头 ${stats.totalShots} · 生成任务 ${stats.totalJobs} · 审核 ${stats.totalReviews}`,
  );
  console.log(
    `生成成功率 ${(stats.successRate * 100).toFixed(1)}% · 人审通过率 ${(stats.approvedRate * 100).toFixed(1)}%`,
  );
  console.log(
    `\n💰 成本三口径：总投入 ¥${stats.totalEstimatedCostCny.toFixed(2)} | 有效产出 ¥${stats.succeededEstimatedCostCny.toFixed(2)} | 未产出浪费 ¥${stats.unproducedCostCny.toFixed(2)}`,
  );
  console.log(`🎬 生成视频总时长 ${stats.totalVideoSeconds}s`);
  if (stats.badCaseTop3?.length) {
    console.log(
      `⚠ Bad Case TOP3: ${stats.badCaseTop3.map((b) => `${b.reason}×${b.count}`).join(", ")}`,
    );
  }
  console.log("\n打开 http://localhost:8788/dashboard 可视化查看 ↑");
}

main().catch((e) => {
  console.error("✗", e.message);
  process.exit(1);
});
