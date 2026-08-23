import { useEffect, useState } from "react";
import { Card, Col, Empty, List, Progress, Row, Spin, Statistic, Tag } from "antd";
import * as dashboardApi from "@/services/api/dashboard";
import type { DashboardStats } from "@/services/api/dashboard";

const REASON_LABEL: Record<string, string> = {
  face_collapse: "脸崩",
  armor_error: "盔甲错",
  style_drift: "风格偏离",
  camera_error: "运镜错",
  text_error: "文字错",
  other: "其他",
};

function formatPercent(rate: number): number {
  if (!Number.isFinite(rate)) return 0;
  return Math.round(rate * 1000) / 10;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await dashboardApi.getStats();
        if (!cancelled) setStats(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-background text-stone-900 dark:text-stone-100">
        <main className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] px-6 py-8 [background-size:16px_16px] dark:bg-[radial-gradient(rgba(245,245,244,.14)_1px,transparent_1px)]">
          <div className="mx-auto max-w-7xl">
            <div className="mb-6">
              <h1 className="text-2xl font-bold tracking-tight">数据看板</h1>
              <p className="mt-2 text-sm leading-6 text-stone-500 dark:text-stone-400">游戏CG预演效率与质量</p>
            </div>
            <div className="flex flex-col items-center justify-center gap-3 py-20">
              <Spin />
              <span className="text-sm text-stone-500">加载中...</span>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-background text-stone-900 dark:text-stone-100">
        <main className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] px-6 py-8 [background-size:16px_16px] dark:bg-[radial-gradient(rgba(245,245,244,.14)_1px,transparent_1px)]">
          <div className="mx-auto max-w-7xl">
            <div className="mb-6">
              <h1 className="text-2xl font-bold tracking-tight">数据看板</h1>
              <p className="mt-2 text-sm leading-6 text-stone-500 dark:text-stone-400">游戏CG预演效率与质量</p>
            </div>
            <Card>
              <Empty description={error} />
            </Card>
          </div>
        </main>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-background text-stone-900 dark:text-stone-100">
        <main className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] px-6 py-8 [background-size:16px_16px] dark:bg-[radial-gradient(rgba(245,245,244,.14)_1px,transparent_1px)]">
          <div className="mx-auto max-w-7xl">
            <div className="mb-6">
              <h1 className="text-2xl font-bold tracking-tight">数据看板</h1>
              <p className="mt-2 text-sm leading-6 text-stone-500 dark:text-stone-400">游戏CG预演效率与质量</p>
            </div>
            <Card>
              <Empty description="暂无数据" />
            </Card>
          </div>
        </main>
      </div>
    );
  }

  const successPercent = formatPercent(stats.successRate);
  const approvedPercent = formatPercent(stats.approvedRate);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background text-stone-900 dark:text-stone-100">
      <main className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] px-6 py-8 [background-size:16px_16px] dark:bg-[radial-gradient(rgba(245,245,244,.14)_1px,transparent_1px)]">
        <div className="mx-auto max-w-7xl space-y-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">数据看板</h1>
            <p className="mt-2 text-sm leading-6 text-stone-500 dark:text-stone-400">游戏CG预演效率与质量</p>
          </div>

          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} lg={8}>
              <Card>
                <Statistic title="总分镜数" value={stats.totalStoryboards} />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={8}>
              <Card>
                <Statistic title="总镜头数" value={stats.totalShots} />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={8}>
              <Card>
                <Statistic title="总生成数" value={stats.totalJobs} />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={8}>
              <Card>
                <Statistic title="生成成功率" value={successPercent} suffix="%" precision={1} />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={8}>
              <Card>
                <Statistic title="人审通过率" value={approvedPercent} suffix="%" precision={1} />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={8}>
              <Card>
                <Statistic title="总审核数" value={stats.totalReviews} />
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]}>
            <Col xs={24} lg={12}>
              <Card title="Bad Case TOP3">
                {stats.badCaseTop3 && stats.badCaseTop3.length ? (
                  <List
                    dataSource={stats.badCaseTop3}
                    renderItem={(item) => (
                      <List.Item>
                        <div className="flex w-full items-center justify-between">
                          <span className="text-sm">
                            {REASON_LABEL[item.reason] || item.reason}
                            <Tag className="ml-2">{item.reason}</Tag>
                          </span>
                          <span className="text-sm font-medium">{item.count} 次</span>
                        </div>
                      </List.Item>
                    )}
                  />
                ) : (
                  <Empty description="暂无 Bad Case" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                )}
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card title="业务对比">
                <div className="space-y-4">
                  <div>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span>传统流程 14天</span>
                      <span className="text-stone-500">100%</span>
                    </div>
                    <Progress percent={100} status="exception" showInfo={false} />
                    <div className="mt-1 text-xs text-stone-500">人力手绘 + 外包建模 + 线下评审</div>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span>AIGC流程 2天</span>
                      <span className="text-stone-500">约 14%</span>
                    </div>
                    <Progress percent={14} status="success" showInfo={false} />
                    <div className="mt-1 text-xs text-stone-500">IP资产沉淀 → 分镜脚本 → 批量生成 → 人审闭环</div>
                  </div>
                  <div className="rounded bg-stone-50 p-3 text-xs leading-5 text-stone-600 dark:bg-stone-900 dark:text-stone-400">
                    传统流程 14天 vs AIGC流程 2天，提效约 85%。通过资产复用与批量预演，单次 CG 预演成本与周期大幅降低，Bad Case 可追溯至具体镜头与原因。
                  </div>
                </div>
              </Card>
            </Col>
          </Row>
        </div>
      </main>
    </div>
  );
}
