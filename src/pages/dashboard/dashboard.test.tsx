import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { App } from "antd";

describe("数据看板页面", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          successRate: 0.8,
          approvedRate: 0.6,
          badCaseTop3: [
            { reason: "face_collapse", count: 5 },
            { reason: "armor_error", count: 3 },
            { reason: "style_drift", count: 2 },
          ],
          totalJobs: 10,
          totalReviews: 8,
          totalStoryboards: 2,
          totalShots: 6,
          totalEstimatedCostCny: 4.8,
          succeededEstimatedCostCny: 3.2,
          unproducedCostCny: 1.6,
          totalVideoSeconds: 60,
          knownCostJobs: 10,
        }),
      } as Response)
    );
  });

  it("渲染标题和6个指标卡片", async () => {
    const { default: DashboardPage } = await import("./index");
    render(
      <App>
        <DashboardPage />
      </App>
    );
    expect(await screen.findByText("数据看板")).toBeInTheDocument();
    expect(screen.getByText("游戏CG预演效率与质量")).toBeInTheDocument();
    // 6 个指标
    await waitFor(() => {
      expect(screen.getByText("总分镜数")).toBeInTheDocument();
    });
    expect(screen.getByText("总镜头数")).toBeInTheDocument();
    expect(screen.getByText("总生成数")).toBeInTheDocument();
    expect(screen.getByText("生成成功率")).toBeInTheDocument();
    expect(screen.getByText("人审通过率")).toBeInTheDocument();
    expect(screen.getByText("总审核数")).toBeInTheDocument();
    // bad case TOP3 中文映射
    expect(await screen.findByText(/脸崩/)).toBeInTheDocument();
    // 业务对比卡片
    expect(screen.getAllByText(/传统流程/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/AIGC流程/).length).toBeGreaterThan(0);
    // 成本治理指标：有效产出成本 + 未产出浪费口径
    expect(await screen.findByText("有效产出成本")).toBeInTheDocument();
    expect(screen.getAllByText(/未产出浪费/).length).toBeGreaterThan(0);
  }, 90000);
});
