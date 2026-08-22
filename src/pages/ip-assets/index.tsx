import { useEffect, useState } from "react";
import { App, Button, Card, Col, Empty, Form, Input, Modal, Row, Select, Spin, Tag, Upload } from "antd";
import { PlusOutlined, UploadOutlined } from "@ant-design/icons";
import IpAssetCard from "@/components/ip-asset-card";
import * as ipAssetApi from "@/services/api/ip-assets";
import type { IpAsset, IpAssetInput } from "@/services/api/ip-assets";

type FormValues = {
  name: string;
  type: "character" | "scene" | "prop";
  styleKeywords: string;
  description: string;
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.readAsDataURL(file);
  });
}

export default function IpAssetsPage() {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [assets, setAssets] = useState<IpAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<IpAsset | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [referenceKeys, setReferenceKeys] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const fetchList = async () => {
    setLoading(true);
    try {
      const data = await ipAssetApi.list();
      setAssets(data);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchList();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setReferenceKeys([]);
    form.setFieldsValue({ name: "", type: "character", styleKeywords: "", description: "" });
    setModalOpen(true);
  };

  const openEdit = (asset: IpAsset) => {
    setEditing(asset);
    setReferenceKeys(asset.referenceKeys || []);
    form.setFieldsValue({
      name: asset.name,
      type: asset.type,
      styleKeywords: asset.styleKeywords || "",
      description: asset.description || "",
    });
    setModalOpen(true);
  };

  const handleDelete = async (asset: IpAsset) => {
    try {
      await ipAssetApi.remove(asset.id);
      message.success("已删除");
      void fetchList();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  const handleUpload = async (file: File) => {
    if (referenceKeys.length >= 6) {
      message.warning("参考图最多 6 张");
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const res = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "上传失败");
      const key: string = json.storageKey || json.key || json.url || "";
      if (!key) throw new Error("上传返回异常");
      setReferenceKeys((prev) => (prev.length >= 6 ? prev : [...prev, key]));
      message.success("上传成功");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (referenceKeys.length > 6) {
        message.error("参考图最多 6 张");
        return;
      }
      setSubmitting(true);
      const payload: IpAssetInput = {
        name: values.name.trim(),
        type: values.type,
        referenceKeys,
        styleKeywords: values.styleKeywords?.trim() || "",
        description: values.description?.trim() || "",
      };
      if (editing) {
        await ipAssetApi.update(editing.id, payload);
        message.success("已更新");
      } else {
        await ipAssetApi.create(payload);
        message.success("已创建");
      }
      setModalOpen(false);
      void fetchList();
    } catch (e) {
      if (e instanceof Error && e.message.includes("请求失败")) {
        message.error(e.message);
      } else if (e && typeof e === "object" && "errorFields" in (e as Record<string, unknown>)) {
        // 表单校验失败，不提示
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
              <h1 className="text-2xl font-bold tracking-tight">IP资产库</h1>
              <p className="mt-2 text-sm leading-6 text-stone-500 dark:text-stone-400">
                沉淀角色 / 场景 / 道具的参考图与风格词，保障游戏IP全流程一致性
              </p>
            </div>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              新建IP资产
            </Button>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20">
              <Spin />
              <span className="text-sm text-stone-500">加载中...</span>
            </div>
          ) : assets.length ? (
            <Row gutter={[16, 16]}>
              {assets.map((asset) => (
                <Col key={asset.id} xs={24} sm={12} md={8} lg={6}>
                  <IpAssetCard
                    asset={asset}
                    onEdit={() => openEdit(asset)}
                    onDelete={() => void handleDelete(asset)}
                  />
                </Col>
              ))}
            </Row>
          ) : (
            <Card className="py-10">
              <Empty description="暂无IP资产，点击“新建IP资产”创建第一个角色/场景/道具" />
            </Card>
          )}
        </div>
      </main>

      <Modal
        title={editing ? "编辑IP资产" : "新建IP资产"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => void handleSubmit()}
        okText={editing ? "保存" : "创建"}
        cancelText="取消"
        confirmLoading={submitting}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" requiredMark={false} className="mt-4">
          <Form.Item
            name="name"
            label="名称"
            rules={[
              { required: true, message: "请输入名称" },
              { min: 2, message: "名称至少 2 字符" },
              { max: 30, message: "名称最多 30 字符" },
            ]}
          >
            <Input placeholder="如：骑士-主角" maxLength={30} showCount />
          </Form.Item>
          <Form.Item name="type" label="类型" rules={[{ required: true, message: "请选择类型" }]}>
            <Select
              placeholder="选择资产类型"
              options={[
                { label: "角色", value: "character" },
                { label: "场景", value: "scene" },
                { label: "道具", value: "prop" },
              ]}
            />
          </Form.Item>
          <Form.Item label="参考图">
            <div className="space-y-2">
              {referenceKeys.length ? (
                <div className="flex flex-wrap gap-2">
                  {referenceKeys.map((key) => (
                    <Tag
                      key={key}
                      closable
                      onClose={() => setReferenceKeys((prev) => prev.filter((k) => k !== key))}
                      className="max-w-[160px] truncate"
                    >
                      {key}
                    </Tag>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-stone-500">暂无参考图，最多 6 张</div>
              )}
              <Upload
                accept="image/*"
                showUploadList={false}
                beforeUpload={(file) => {
                  void handleUpload(file);
                  return false;
                }}
                disabled={uploading || referenceKeys.length >= 6}
              >
                <Button icon={<UploadOutlined />} loading={uploading} disabled={referenceKeys.length >= 6}>
                  上传参考图
                </Button>
              </Upload>
              <div className="text-xs text-stone-400">支持 jpg/png/webp，上传后自动存入 /api/assets</div>
            </div>
          </Form.Item>
          <Form.Item name="styleKeywords" label="风格关键词">
            <Input placeholder="如：写实、赛博朋克、吉卜力" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} placeholder="补充说明该资产的用途、细节或注意事项" maxLength={500} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
