import type { Shot } from "@/services/api/storyboards";
import type { IpAsset } from "@/services/api/ip-assets";

const CAMERA_OPTIONS = [
  { label: "推镜", value: "push" },
  { label: "拉镜", value: "pull" },
  { label: "环绕", value: "orbit" },
  { label: "固定", value: "static" },
  { label: "跟随", value: "follow" },
];

const statusColor: Record<string, string> = {
  pending: "default",
  queued: "processing",
  processing: "processing",
  running: "processing",
  succeeded: "success",
  failed: "error",
  cancelled: "default",
};

type Props = {
  shots: Shot[];
  ipAssets: IpAsset[];
  onUpdate: (shotId: string, patch: Partial<Record<string, unknown>>) => void | Promise<void>;
  onDelete: (shotId: string) => void | Promise<void>;
  onReorder: (orderedIds: string[]) => void | Promise<void>;
};

export default function StoryboardShotTable({ shots, ipAssets, onUpdate, onDelete, onReorder }: Props) {
  const sorted = [...shots].sort((a, b) => a.orderIndex - b.orderIndex);

  const handleMove = (index: number, direction: -1 | 1) => {
    const newIdx = index + direction;
    if (newIdx < 0 || newIdx >= sorted.length) return;
    const ids = sorted.map((s) => s.id);
    const tmp = ids[index];
    ids[index] = ids[newIdx];
    ids[newIdx] = tmp;
    void onReorder(ids);
  };

  return (
    <div className="overflow-x-auto rounded border border-stone-200 dark:border-stone-700">
      <table className="w-full text-sm">
        <thead className="bg-stone-50 dark:bg-stone-900">
          <tr>
            <th className="px-3 py-2 text-left font-medium text-stone-600 dark:text-stone-300">序号</th>
            <th className="px-3 py-2 text-left font-medium text-stone-600 dark:text-stone-300">画面描述</th>
            <th className="px-3 py-2 text-left font-medium text-stone-600 dark:text-stone-300">运镜</th>
            <th className="px-3 py-2 text-left font-medium text-stone-600 dark:text-stone-300">时长</th>
            <th className="px-3 py-2 text-left font-medium text-stone-600 dark:text-stone-300">绑定IP</th>
            <th className="px-3 py-2 text-left font-medium text-stone-600 dark:text-stone-300">状态</th>
            <th className="px-3 py-2 text-left font-medium text-stone-600 dark:text-stone-300">操作</th>
          </tr>
        </thead>
        <tbody>
          {sorted.length ? (
            sorted.map((shot, index) => (
              <tr key={shot.id} className="border-t border-stone-200 dark:border-stone-700">
                <td className="px-3 py-2 align-top">
                  <div className="flex items-center gap-1">
                    <span className="min-w-5 text-center text-sm">{index + 1}</span>
                    <div className="flex flex-col gap-0.5">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => handleMove(index, -1)}
                        style={{ height: 20, padding: "0 4px", fontSize: 11, border: "1px solid #d9d9d9", borderRadius: 4, background: index === 0 ? "#f5f5f5" : "#fff", cursor: index === 0 ? "not-allowed" : "pointer" }}
                      >
                        上移
                      </button>
                      <button
                        type="button"
                        disabled={index === sorted.length - 1}
                        onClick={() => handleMove(index, 1)}
                        style={{ height: 20, padding: "0 4px", fontSize: 11, border: "1px solid #d9d9d9", borderRadius: 4, background: index === sorted.length - 1 ? "#f5f5f5" : "#fff", cursor: index === sorted.length - 1 ? "not-allowed" : "pointer" }}
                      >
                        下移
                      </button>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 align-top" style={{ minWidth: 220 }}>
                  <textarea
                    defaultValue={shot.description}
                    rows={2}
                    placeholder="输入画面描述"
                    style={{ width: "100%", border: "1px solid #d9d9d9", borderRadius: 6, padding: "4px 8px", fontSize: 12, resize: "vertical" }}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== shot.description) void onUpdate(shot.id, { description: v });
                    }}
                  />
                </td>
                <td className="px-3 py-2 align-top">
                  <select
                    value={shot.camera}
                    style={{ width: 100, border: "1px solid #d9d9d9", borderRadius: 6, padding: "2px 6px", fontSize: 12 }}
                    onChange={(e) => void onUpdate(shot.id, { camera: e.target.value })}
                  >
                    {CAMERA_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2 align-top">
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={2}
                      max={15}
                      value={shot.durationSec}
                      style={{ width: 56, border: "1px solid #d9d9d9", borderRadius: 6, padding: "2px 6px", fontSize: 12 }}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (Number.isFinite(val) && val !== shot.durationSec) void onUpdate(shot.id, { durationSec: val });
                      }}
                    />
                    <span className="text-xs text-stone-500">秒</span>
                  </div>
                </td>
                <td className="px-3 py-2 align-top">
                  <select
                    value={shot.ipAssetId || ""}
                    style={{ width: 120, border: "1px solid #d9d9d9", borderRadius: 6, padding: "2px 6px", fontSize: 12 }}
                    onChange={(e) => void onUpdate(shot.id, { ipAssetId: e.target.value || null })}
                  >
                    <option value="">选择IP</option>
                    {ipAssets.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2 align-top">
                  <span
                    style={{
                      display: "inline-block",
                      padding: "0 6px",
                      fontSize: 12,
                      borderRadius: 4,
                      border: "1px solid #d9d9d9",
                      background: shot.status === "succeeded" ? "#f6ffed" : shot.status === "failed" ? "#fff2f0" : "#fafafa",
                      color: shot.status === "succeeded" ? "#389e0d" : shot.status === "failed" ? "#cf1322" : "#595959",
                    }}
                  >
                    {shot.status || "pending"}
                  </span>
                </td>
                <td className="px-3 py-2 align-top">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => handleMove(index, -1)}
                      style={{ fontSize: 12, color: index === 0 ? "#aaa" : "#1677ff", background: "none", border: "none", cursor: index === 0 ? "not-allowed" : "pointer", padding: "2px 4px" }}
                    >
                      上移
                    </button>
                    <button
                      type="button"
                      disabled={index === sorted.length - 1}
                      onClick={() => handleMove(index, 1)}
                      style={{ fontSize: 12, color: index === sorted.length - 1 ? "#aaa" : "#1677ff", background: "none", border: "none", cursor: index === sorted.length - 1 ? "not-allowed" : "pointer", padding: "2px 4px" }}
                    >
                      下移
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDelete(shot.id)}
                      style={{ fontSize: 12, color: "#ff4d4f", background: "none", border: "none", cursor: "pointer", padding: "2px 4px" }}
                    >
                      删除
                    </button>
                  </div>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={7} className="px-3 py-8 text-center text-sm text-stone-400">
                暂无镜头，请添加
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
