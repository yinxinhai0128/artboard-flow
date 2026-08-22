import { Card, Tag, Typography, Space, Button } from "antd";
import { EditOutlined, DeleteOutlined } from "@ant-design/icons";
import type { IpAsset } from "@/services/api/ip-assets";

const typeLabel: Record<string, string> = {
  character: "角色",
  scene: "场景",
  prop: "道具",
};

const typeColor: Record<string, string> = {
  character: "blue",
  scene: "green",
  prop: "orange",
};

type Props = {
  asset: IpAsset;
  onEdit: () => void;
  onDelete: () => void;
};

export default function IpAssetCard({ asset, onEdit, onDelete }: Props) {
  return (
    <Card
      hoverable
      className="overflow-hidden"
      title={
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold">{asset.name}</span>
          <Tag color={typeColor[asset.type] || "default"} className="m-0 shrink-0">
            {typeLabel[asset.type] || asset.type}
          </Tag>
        </div>
      }
      actions={[
        <Button key="edit" type="text" icon={<EditOutlined />} onClick={onEdit} size="small">
          编辑
        </Button>,
        <Button key="delete" type="text" danger icon={<DeleteOutlined />} onClick={onDelete} size="small">
          删除
        </Button>,
      ]}
    >
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5 text-xs">
          <Tag className="m-0">参考图 {asset.referenceKeys.length} 张</Tag>
          {asset.styleKeywords ? <Tag className="m-0">{asset.styleKeywords}</Tag> : null}
        </div>
        <Typography.Paragraph
          type="secondary"
          ellipsis={{ rows: 2 }}
          className="!mb-0 !text-xs !leading-5"
        >
          {asset.description || "暂无描述"}
        </Typography.Paragraph>
        <Space size={4} className="text-[11px] text-stone-500">
          <span>{asset.updatedAt ? new Date(asset.updatedAt).toLocaleString("zh-CN") : ""}</span>
        </Space>
        {asset.referenceKeys.length ? (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {asset.referenceKeys.slice(0, 4).map((key) => (
              <span
                key={key}
                className="max-w-[90px] truncate rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-600 dark:bg-stone-800 dark:text-stone-300"
                title={key}
              >
                {key}
              </span>
            ))}
            {asset.referenceKeys.length > 4 ? (
              <span className="text-[10px] text-stone-400">+{asset.referenceKeys.length - 4}</span>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
