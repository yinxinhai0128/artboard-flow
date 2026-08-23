import { useEffect, useState } from "react";
import { App, Button, Card, Empty, Form, Input, Modal, Select, Spin, Tag } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import * as storyboardApi from "@/services/api/storyboards";
import type { Storyboard } from "@/services/api/storyboards";
import * as ipAssetApi from "@/services/api/ip-assets";
import type { IpAsset } from "@/services/api/ip-assets";

export default function StoryboardListPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [boards, setBoards] = useState<Storyboard[]>([]);
  const [ipAssets, setIpAssets] = useState<IpAsset[]>([]);
  const [shotCounts, setShotCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchBoards = async () => {
    setLoading(true);
    try {
      const data = await storyboardApi.list();
      setBoards(data);
      // 拉取每个分镜的镜头数
      const counts: Record<string, number> = {};
      await Promise.all(
        data.map(async (b) => {
          try {
            const shots = await storyboardApi.listShots(b.id);
            counts[b.id] = shots.length;
          } catch {
            counts[b.id] = 0;
          }
        })
      );
      setShotCounts(counts);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  const fetchIpAssets = async () => {
    try {
      const data = await ipAssetApi.list();
      setIpAssets(data);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    void fetchBoards();
    void fetchIpAssets();
  }, []);

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const created = await storyboardApi.create({
        title: values.title.trim(),
        ipAssetIds: values.ipAssetIds || [],
      });
      message.success("已创建分镜");
      setModalOpen(false);
      form.resetFields();
      navigate(`/storyboard/${created.id}`);
    } catch (e) {
      if (e && typeof e === "object" && "errorFields" in (e as Record<string, unknown>)) {
        // 表单校验
      } else if (e instanceof Error) {
        message.error(e.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background text-stone-900 dark:text-stone-100">
      <main className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] px-6 py-8 [background-size:16px_16px] dark:bg-[radial-gradient(rgba(245,245,244,.14)_1px,transparent_1px)]">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">分镜脚本</h1>
              <p className="mt-2 text-sm leading-6 text-stone-500 dark:text-stone-400">
                管理游戏CG预演分镜，配置镜头脚本并一键批量生成视频
              </p>
            </div>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                form.setFieldsValue({ title: "", ipAssetIds: [] });
                setModalOpen(true);
              }}
            >
              新建分镜
            </Button>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20">
              <Spin />
              <span className="text-sm text-stone-500">加载中...</span>
            </div>
          ) : boards.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {boards.map((board) => (
                <Card
                  key={board.id}
                  hoverable
                  onClick={() => navigate(`/storyboard/${board.id}`)}
                  title={<span className="truncate text-sm font-semibold">{board.title}</span>}
                  className="cursor-pointer"
                >
                  <div className="space-y-2 text-xs text-stone-500">
                    <div className="flex items-center gap-2">
                      <Tag>镜头数 {shotCounts[board.id] ?? "-"}</Tag>
                      <span>{board.createdAt ? new Date(board.createdAt).toLocaleString("zh-CN") : ""}</span>
                    </div>
                    {board.ipAssetIds.length ? (
                      <div className="flex flex-wrap gap-1">
                        {board.ipAssetIds.map((aid) => {
                          const asset = ipAssets.find((a) => a.id === aid);
                          return (
                            <Tag key={aid} className="m-0 text-[11px]">
                              {asset ? asset.name : aid.slice(0, 6)}
                            </Tag>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-[11px] text-stone-400">未关联IP资产</div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="py-10">
              <Empty description="暂无分镜，点击“新建分镜”创建第一个分镜脚本" />
            </Card>
          )}
        </div>
      </main>

      <Modal
        title="新建分镜"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => void handleCreate()}
        okText="创建"
        cancelText="取消"
        confirmLoading={submitting}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" requiredMark={false} className="mt-4">
          <Form.Item
            name="title"
            label="标题"
            rules={[
              { required: true, message: "请输入标题" },
              { min: 2, message: "标题至少 2 字符" },
              { max: 50, message: "标题最多 50 字符" },
            ]}
          >
            <Input placeholder="如：开场CG-废墟逃亡" maxLength={50} showCount />
          </Form.Item>
          <Form.Item name="ipAssetIds" label="关联IP资产">
            <Select
              mode="multiple"
              allowClear
              placeholder="选择关联的角色/场景/道具"
              options={ipAssets.map((a) => ({ label: a.name, value: a.id }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
