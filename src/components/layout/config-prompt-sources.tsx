import { App, Button, Select, Switch } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";

import { PromptSourceEditorDrawer } from "./prompt-source-editor-drawer";
import { PromptSourceContentModal } from "./prompt-source-content-modal";
import { refreshAllSources, refreshSource } from "@/services/api/prompts";
import { PROMPT_SOURCE_INTERVAL_OPTIONS, usePromptSourceStore } from "@/stores/use-prompt-source-store";
import type { PromptSource } from "@/services/api/prompt-source-presets";

export function ConfigPromptSources() {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const sources = usePromptSourceStore((state) => state.sources);
    const schedule = usePromptSourceStore((state) => state.schedule);
    const addSource = usePromptSourceStore((state) => state.addSource);
    const saveSource = usePromptSourceStore((state) => state.saveSource);
    const removeSource = usePromptSourceStore((state) => state.removeSource);
    const toggleSource = usePromptSourceStore((state) => state.toggleSource);
    const updateSchedule = usePromptSourceStore((state) => state.updateSchedule);

    const [editingId, setEditingId] = useState("");
    const [viewingId, setViewingId] = useState("");
    const [refreshingId, setRefreshingId] = useState("");
    const [refreshingAll, setRefreshingAll] = useState(false);

    const editingSource = sources.find((item) => item.id === editingId) || null;
    const viewingSource = sources.find((item) => item.id === viewingId) || null;

    const invalidatePrompts = () => queryClient.invalidateQueries({ queryKey: ["prompts"] });

    const handleAdd = () => {
        const source = addSource();
        setEditingId(source.id);
    };

    const handleSave = (source: PromptSource) => {
        saveSource(source);
        void invalidatePrompts();
    };

    const handleDelete = (source: PromptSource) => {
        if (sources.length <= 1) {
            message.warning("至少保留一个来源");
            return;
        }
        removeSource(source.id);
        void invalidatePrompts();
    };

    const handleRefreshOne = async (source: PromptSource) => {
        setRefreshingId(source.id);
        try {
            const count = await refreshSource(source.id);
            await invalidatePrompts();
            message.success(`「${source.name}」已拉取 ${count} 条`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "拉取失败");
        } finally {
            setRefreshingId("");
        }
    };

    const handleRefreshAll = async () => {
        setRefreshingAll(true);
        try {
            const count = await refreshAllSources();
            updateSchedule("lastFetchedAt", new Date().toISOString());
            await invalidatePrompts();
            message.success(`全部来源已拉取，共 ${count} 条`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "拉取失败");
        } finally {
            setRefreshingAll(false);
        }
    };

    return (
        <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-stone-500">每个来源是一段拉取脚本，可自定义、可查看内容；系统内置几个默认来源，你也可以本地新增。</div>
                <Button type="primary" icon={<Plus className="size-4" />} onClick={handleAdd}>
                    新增来源
                </Button>
            </div>

            <div className="space-y-2">
                {sources.map((source) => (
                    <div key={source.id} className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 px-4 py-3 dark:border-stone-800">
                        <div className="flex min-w-0 items-center gap-3">
                            <Switch size="small" checked={source.enabled} onChange={(checked) => toggleSource(source.id, checked)} />
                            <div className="min-w-0">
                                <div className="truncate text-sm font-semibold">{source.name || "未命名来源"}</div>
                                <div className="mt-1 truncate text-xs text-stone-500">{source.githubUrl || "无 GitHub 地址"}</div>
                            </div>
                        </div>
                        <div className="flex shrink-0 gap-2">
                            <Button size="small" icon={<Eye className="size-3.5" />} onClick={() => setViewingId(source.id)}>
                                查看内容
                            </Button>
                            <Button size="small" icon={<RefreshCw className="size-3.5" />} loading={refreshingId === source.id} onClick={() => void handleRefreshOne(source)}>
                                立即拉取
                            </Button>
                            <Button size="small" icon={<Pencil className="size-3.5" />} onClick={() => setEditingId(source.id)}>
                                编辑脚本
                            </Button>
                            <Button size="small" danger icon={<Trash2 className="size-3.5" />} onClick={() => handleDelete(source)} />
                        </div>
                    </div>
                ))}
            </div>

            <section className="mt-5 rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                <div className="mb-3 text-sm font-semibold">定时拉取</div>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-stone-500">拉取周期</span>
                        <Select size="small" className="w-36" value={schedule.intervalMinutes} options={PROMPT_SOURCE_INTERVAL_OPTIONS} onChange={(value) => updateSchedule("intervalMinutes", value)} />
                    </div>
                    <Button size="small" type="primary" icon={<RefreshCw className="size-3.5" />} loading={refreshingAll} onClick={() => void handleRefreshAll()}>
                        全部立即拉取
                    </Button>
                    <span className="text-xs text-stone-500">{schedule.lastFetchedAt ? `上次拉取 ${formatTime(schedule.lastFetchedAt)}` : "尚未定时拉取"}</span>
                </div>
                <div className="mt-2 text-xs text-stone-400">开启周期后，页面打开期间会按周期自动拉取所有启用的来源。</div>
            </section>

            <PromptSourceEditorDrawer open={Boolean(editingSource)} source={editingSource} onSave={handleSave} onClose={() => setEditingId("")} />
            <PromptSourceContentModal source={viewingSource} onClose={() => setViewingId("")} />
        </div>
    );
}

function formatTime(value: string) {
    return new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
