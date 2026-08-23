import { useCallback, useEffect, useState } from "react";
import { App, Button, Card, Form, Input, InputNumber, Modal, Select, Spin, Tag } from "antd";
import { useParams } from "react-router-dom";
import StoryboardShotTable from "@/components/storyboard-shot-table";
import * as storyboardApi from "@/services/api/storyboards";
import type { Shot, Storyboard, GenerationJob } from "@/services/api/storyboards";
import * as ipAssetApi from "@/services/api/ip-assets";
import type { IpAsset } from "@/services/api/ip-assets";

const CAMERA_OPTIONS = [
  { label: "推镜", value: "push" },
  { label: "拉镜", value: "pull" },
  { label: "环绕", value: "orbit" },
  { label: "固定", value: "static" },
  { label: "跟随", value: "follow" },
];

const REASON_OPTIONS = [
  { label: "脸崩", value: "face_collapse" },
  { label: "盔甲错", value: "armor_error" },
  { label: "风格偏离", value: "style_drift" },
  { label: "运镜错", value: "camera_error" },
  { label: "文字错", value: "text_error" },
  { label: "其他", value: "other" },
];

export default function StoryboardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [titleForm] = Form.useForm();
  const [board, setBoard] = useState<Storyboard | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [ipAssets, setIpAssets] = useState<IpAsset[]>([]);
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewShotId, setReviewShotId] = useState<string | null>(null);
  const [reviewJobId, setReviewJobId] = useState<string | null>(null);
  const [reviewReason, setReviewReason] = useState("face_collapse");
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [b, s, assets] = await Promise.all([
        storyboardApi.get(id),
        storyboardApi.listShots(id),
        ipAssetApi.list().catch(() => [] as IpAsset[]),
      ]);
      setBoard(b);
      setShots(s);
      setIpAssets(assets);
      titleForm.setFieldsValue({ title: b.title });
    } catch (e) {
      message.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [id, message, titleForm]);

  const fetchJobs = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/generation/jobs?projectId=${encodeURIComponent(id)}`);
      const data = await res.json().catch(() => []);
      if (Array.isArray(data)) setJobs(data as GenerationJob[]);
      else if (data && Array.isArray((data as { jobs?: GenerationJob[] }).jobs)) setJobs((data as { jobs: GenerationJob[] }).jobs);
    } catch {
      // ignore
    }
  }, [id]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    void fetchJobs();
    const timer = setInterval(() => void fetchJobs(), 3000);
    return () => clearInterval(timer);
  }, [fetchJobs]);

  const handleTitleSave = async () => {
    if (!id || !board) return;
    try {
      const values = await titleForm.validateFields();
      const updated = await storyboardApi.update(id, { title: values.title.trim() });
      setBoard(updated);
      setEditingTitle(false);
      message.success("已更新标题");
    } catch (e) {
      if (e && typeof e === "object" && "errorFields" in (e as Record<string, unknown>)) return;
      message.error(e instanceof Error ? e.message : "更新失败");
    }
  };

  const handleAddShot = async () => {
    if (!id) return;
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      await storyboardApi.createShot(id, {
        description: values.description.trim(),
        camera: values.camera,
        durationSec: values.durationSec,
        ipAssetId: values.ipAssetId || null,
        promptOverride: values.promptOverride?.trim() || null,
      });
      message.success("已添加镜头");
      setAddOpen(false);
      form.resetFields();
      const s = await storyboardApi.listShots(id);
      setShots(s);
    } catch (e) {
      if (e && typeof e === "object" && "errorFields" in (e as Record<string, unknown>)) return;
      message.error(e instanceof Error ? e.message : "添加失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateShot = async (shotId: string, patch: Record<string, unknown>) => {
    if (!id) return;
    try {
      // adapt field names to backend expectations
      const payload: Record<string, unknown> = {};
      if ("description" in patch) payload.description = patch.description;
      if ("camera" in patch) payload.camera = patch.camera;
      if ("durationSec" in patch) payload.durationSec = patch.durationSec;
      if ("ipAssetId" in patch) payload.ipAssetId = patch.ipAssetId;
      if ("promptOverride" in patch) payload.promptOverride = patch.promptOverride;
      await storyboardApi.updateShot(id, shotId, payload as never);
      const s = await storyboardApi.listShots(id);
      setShots(s);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "更新失败");
    }
  };

  const handleDeleteShot = async (shotId: string) => {
    if (!id) return;
    try {
      await storyboardApi.removeShot(id, shotId);
      message.success("已删除");
      const s = await storyboardApi.listShots(id);
      setShots(s);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  const handleReorder = async (orderedIds: string[]) => {
    if (!id) return;
    try {
      const s = await storyboardApi.reorder(id, orderedIds);
      setShots(s);
      message.success("已重新排序");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "排序失败");
    }
  };

  const handleGenerate = async () => {
    if (!id) return;
    if (!shots.length) {
      message.warning("暂无分镜");
      return;
    }
    setGenerating(true);
    try {
      const res = await storyboardApi.generate(id);
      message.success(`已创建 ${res.jobs.length} 个生成任务`);
      setJobs(res.jobs);
      // 立即刷新一次
      setTimeout(() => void fetchJobs(), 800);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "生成失败");
    } finally {
      setGenerating(false);
    }
  };

  const handleRetry = async (jobId: string) => {
    try {
      const job = await storyboardApi.retryJob(jobId);
      message.success("已创建重试任务");
      setJobs((prev) => [job, ...prev]);
      setTimeout(() => void fetchJobs(), 800);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "重试失败");
    }
  };

  const getJobIdForShot = (shotId: string): string | null => {
    const match = jobs.find((j) => String((j.payload as Record<string, unknown>)?.shotId || j.nodeId) === shotId);
    return match ? match.id : null;
  };

  const handleApprove = async (shotId: string, jobId?: string | null) => {
    const generationJobId = jobId || getJobIdForShot(shotId) || undefined;
    try {
      const body: Record<string, unknown> = { verdict: "approved" };
      if (generationJobId) body.generationJobId = generationJobId;
      const res = await fetch(`/api/shots/${encodeURIComponent(shotId)}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "审核失败");
      message.success("审核成功");
      void fetchJobs();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "审核失败");
    }
  };

  const openRejectModal = (shotId: string, jobId?: string | null) => {
    setReviewShotId(shotId);
    setReviewJobId(jobId || getJobIdForShot(shotId));
    setReviewReason("face_collapse");
    setReviewComment("");
    setReviewModalOpen(true);
  };

  const handleRejectSubmit = async () => {
    if (!reviewShotId) return;
    if (!reviewReason) {
      message.warning("请选择不通过原因");
      return;
    }
    setReviewSubmitting(true);
    try {
      const body: Record<string, unknown> = { verdict: "rejected", reason: reviewReason, comment: reviewComment };
      if (reviewJobId) body.generationJobId = reviewJobId;
      const res = await fetch(`/api/shots/${encodeURIComponent(reviewShotId)}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "审核失败");
      message.success("审核成功");
      setReviewModalOpen(false);
      void fetchJobs();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "审核失败");
    } finally {
      setReviewSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Spin />
        <span className="ml-2 text-sm text-stone-500">加载中...</span>
      </div>
    );
  }

  if (!board) {
    return <div className="p-8 text-sm text-stone-500">分镜不存在</div>;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background text-stone-900 dark:text-stone-100">
      <main className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] px-6 py-6 [background-size:16px_16px] dark:bg-[radial-gradient(rgba(245,245,244,.14)_1px,transparent_1px)]">
        <div className="mx-auto max-w-7xl space-y-6">
          {/* 顶部标题区 */}
          <Card>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex-1">
                  {editingTitle ? (
                    <Form form={titleForm} layout="inline" className="flex flex-1 gap-2">
                      <Form.Item
                        name="title"
                        rules={[
                          { required: true, message: "请输入标题" },
                          { min: 2, message: "至少2字符" },
                          { max: 50, message: "最多50字符" },
                        ]}
                        className="mb-0 flex-1"
                      >
                        <Input placeholder="分镜标题" maxLength={50} />
                      </Form.Item>
                      <Button type="primary" onClick={() => void handleTitleSave()}>
                        保存
                      </Button>
                      <Button onClick={() => setEditingTitle(false)}>取消</Button>
                    </Form>
                  ) : (
                    <div className="flex items-center gap-3">
                      <h1 className="text-xl font-bold tracking-tight">{board.title}</h1>
                      <Button size="small" onClick={() => setEditingTitle(true)}>
                        编辑标题
                      </Button>
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                    <span className="text-stone-500">IP资产关联：</span>
                    {board.ipAssetIds.length ? (
                      board.ipAssetIds.map((aid) => {
                        const asset = ipAssets.find((a) => a.id === aid);
                        return (
                          <Tag key={aid} className="m-0">
                            {asset ? asset.name : aid.slice(0, 6)}
                          </Tag>
                        );
                      })
                    ) : (
                      <span className="text-stone-400">未关联</span>
                    )}
                    <span className="ml-3 text-stone-400">
                      创建于 {board.createdAt ? new Date(board.createdAt).toLocaleString("zh-CN") : "-"}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button type="primary" onClick={() => setAddOpen(true)}>
                    添加镜头
                  </Button>
                  <Button type="primary" danger loading={generating} onClick={() => void handleGenerate()}>
                    一键生成全片
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          {/* 中部表格 */}
          <Card title={`镜头列表 · ${shots.length} 镜`} className="overflow-hidden">
            <StoryboardShotTable
              shots={shots}
              ipAssets={ipAssets}
              onUpdate={handleUpdateShot}
              onDelete={handleDeleteShot}
              onReorder={handleReorder}
            />
          </Card>

          {/* 底部生成结果 */}
          <Card title="生成结果">
            {jobs.length ? (
              <div className="space-y-2">
                <div className="text-xs text-stone-500">轮询 GET /api/generation/jobs?projectId={board.id} 展示任务状态</div>
                <div className="divide-y divide-stone-100 rounded border border-stone-200 dark:divide-stone-800 dark:border-stone-700">
                  {jobs.map((job) => {
                    const shotId = String((job.payload as Record<string, unknown>)?.shotId || job.nodeId);
                    return (
                      <div key={job.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-mono text-xs">{job.id}</div>
                          <div className="truncate text-xs text-stone-500">
                            shot: {shotId} · prompt: {String((job.payload as Record<string, unknown>)?.prompt || "").slice(0, 40)}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Tag
                            color={
                              job.status === "succeeded"
                                ? "success"
                                : job.status === "failed"
                                  ? "error"
                                  : job.status === "queued"
                                    ? "default"
                                    : "processing"
                            }
                          >
                            {job.status}
                          </Tag>
                          {(job.status === "failed" || job.status === "cancelled") && (
                            <Button size="small" onClick={() => void handleRetry(job.id)}>
                              重试
                            </Button>
                          )}
                          <Button size="small" type="primary" ghost onClick={() => void handleApprove(shotId, job.id)}>
                            通过
                          </Button>
                          <Button size="small" danger onClick={() => openRejectModal(shotId, job.id)}>
                            不通过
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-sm text-stone-400">暂无生成任务，点击“一键生成全片”创建批量任务</div>
            )}
          </Card>

          {/* 镜头审核 - 支持无 job 场景 */}
          <Card title="镜头审核">
            {shots.length ? (
              <div className="space-y-2">
                <div className="text-xs text-stone-500">对每个镜头的生成结果进行人工审核，支持无生成任务时直接审核</div>
                <div className="divide-y divide-stone-100 rounded border border-stone-200 dark:divide-stone-800 dark:border-stone-700">
                  {shots.map((shot) => {
                    const jobId = getJobIdForShot(shot.id);
                    return (
                      <div key={shot.id} className="flex items-center justify-between gap-3 px-3 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{shot.description || "未命名镜头"}</div>
                          <div className="truncate text-xs text-stone-500">
                            {shot.camera} · {shot.durationSec}秒 · {jobId ? `关联任务 ${jobId.slice(0, 8)}` : "无关联任务"}
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <Button size="small" type="primary" ghost onClick={() => void handleApprove(shot.id, jobId)}>
                            通过
                          </Button>
                          <Button size="small" danger onClick={() => openRejectModal(shot.id, jobId)}>
                            不通过
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-sm text-stone-400">暂无镜头，请先添加镜头</div>
            )}
          </Card>
        </div>
      </main>

      <Modal
        title="添加镜头"
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={() => void handleAddShot()}
        okText="添加"
        cancelText="取消"
        confirmLoading={submitting}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" requiredMark={false} className="mt-4" initialValues={{ camera: "static", durationSec: 5 }}>
          <Form.Item
            name="description"
            label="画面描述"
            rules={[
              { required: true, message: "请输入画面描述" },
              { min: 1, message: "至少1字符" },
              { max: 500, message: "最多500字符" },
            ]}
          >
            <Input.TextArea rows={3} placeholder="如：远景废墟全景，晨光穿透烟尘" maxLength={500} showCount />
          </Form.Item>
          <Form.Item name="camera" label="运镜">
            <Select options={CAMERA_OPTIONS} />
          </Form.Item>
          <Form.Item name="durationSec" label="时长（秒）" rules={[{ required: true, message: "请选择时长" }]}>
            <InputNumber min={2} max={15} style={{ width: "100%" }} addonAfter="秒" />
          </Form.Item>
          <Form.Item name="ipAssetId" label="绑定IP资产">
            <Select allowClear placeholder="选择IP资产" options={ipAssets.map((a) => ({ label: a.name, value: a.id }))} />
          </Form.Item>
          <Form.Item name="promptOverride" label="提示词追加">
            <Input.TextArea rows={2} placeholder="可选：追加的提示词，如 风格追加词" maxLength={500} showCount />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="不通过原因"
        open={reviewModalOpen}
        onCancel={() => setReviewModalOpen(false)}
        onOk={() => void handleRejectSubmit()}
        okText="提交"
        cancelText="取消"
        confirmLoading={reviewSubmitting}
        destroyOnHidden
      >
        <div className="mt-4 space-y-4">
          <div>
            <div className="mb-2 text-sm font-medium">原因</div>
            <Select value={reviewReason} onChange={(v) => setReviewReason(v)} options={REASON_OPTIONS} style={{ width: "100%" }} />
          </div>
          <div>
            <div className="mb-2 text-sm font-medium">备注</div>
            <Input.TextArea rows={3} placeholder="可选：补充说明" maxLength={500} showCount value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
