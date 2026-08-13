import { FolderPlus, Search, Sparkles } from "lucide-react";
import { type UIEvent, useEffect, useState } from "react";
import { App, Button, Empty, Input, Spin, Tag } from "antd";

import { PromptCard } from "@/components/prompts/prompt-card";
import { usePromptList } from "@/components/prompts/use-prompt-list";
import { PromptDetailDialog } from "./components/prompt-detail-dialog";
import { useCopyText } from "@/hooks/use-copy-text";
import { cn } from "@/lib/utils";
import { useAssetStore } from "@/stores/use-asset-store";
import { ALL_PROMPTS_OPTION, type Prompt } from "@/services/api/prompts";

export default function PromptsPage() {
    const { message } = App.useApp();
    const [titleKeyword, setTitleKeyword] = useState("");
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [selectedCategory, setSelectedCategory] = useState(ALL_PROMPTS_OPTION);
    const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null);
    const addAsset = useAssetStore((state) => state.addAsset);
    const copyText = useCopyText();
    const { query, items: promptItems, tags: promptTags, categories: promptCategoryOptions, total: totalPrompts } = usePromptList({ keyword: titleKeyword, tags: selectedTags, category: selectedCategory });

    useEffect(() => {
        if (query.isError) {
            message.error(query.error instanceof Error ? query.error.message : "获取提示词失败");
        }
    }, [message, query.error, query.isError]);

    const toggleTag = (tag: string) => {
        if (tag === ALL_PROMPTS_OPTION) return setSelectedTags([]);
        setSelectedTags((items) => (items.includes(tag) ? items.filter((item) => item !== tag) : [...items, tag]));
    };

    const savePromptAsset = (item: Prompt) => {
        addAsset({ kind: "text", title: item.title, coverUrl: item.coverUrl, tags: item.tags, source: item.category, data: { content: item.prompt }, metadata: { source: "prompt-library", promptId: item.id, githubUrl: item.githubUrl } });
        message.success("已加入我的资产");
    };

    const handleListScroll = (event: UIEvent<HTMLDivElement>) => {
        const target = event.currentTarget;
        if (query.hasNextPage && !query.isFetchingNextPage && target.scrollTop + target.clientHeight >= target.scrollHeight - 160) {
            void query.fetchNextPage();
        }
    };

    return (
        <div className="flex h-full flex-col overflow-hidden bg-[#0d0d0d] text-stone-100">
            <main
                className="min-h-0 flex-1 overflow-y-auto bg-[#0d0d0d] px-6 py-8"
                onScroll={handleListScroll}
            >
                <div className="pb-8">
                    {/* 头部：Skills 市场 */}
                    <div className="relative overflow-hidden rounded-2xl border border-white/8 bg-gradient-to-br from-[#1a1a1a] via-[#141414] to-[#0d0d0d] px-8 py-10 text-center">
                        <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-white/[0.04] blur-3xl" />
                        <div className="pointer-events-none absolute -bottom-20 -left-10 size-56 rounded-full bg-white/[0.03] blur-3xl" />
                        <div className="relative">
                            <Tag className="mb-4 !border-white/15 !bg-white/[0.06] !text-stone-300">
                                <Sparkles className="mr-1 inline size-3" />
                                Skills 市场
                            </Tag>
                            <h1 className="text-4xl font-bold tracking-tight text-white">提示词中心</h1>
                            <p className="mt-3 text-sm text-stone-400">共 {totalPrompts} 条提示词，按标题、标签与分类快速查找灵感。</p>
                            <div className="mx-auto mt-6 w-full max-w-xl">
                                <Input
                                    size="large"
                                    variant="filled"
                                    prefix={<Search className="size-4 text-stone-400" />}
                                    value={titleKeyword}
                                    placeholder="搜索提示词…"
                                    onChange={(event) => setTitleKeyword(event.target.value)}
                                    className="!rounded-xl !border-white/10 !bg-white/[0.05] !text-white placeholder:!text-stone-500"
                                />
                            </div>
                        </div>
                    </div>

                    {query.isLoading ? (
                        <div className="flex h-60 items-center justify-center">
                            <Spin />
                        </div>
                    ) : (
                        <>
                            <div className="mx-auto mt-6 grid max-w-6xl gap-3 text-left">
                                <div className="grid gap-2 sm:grid-cols-[56px_minmax(0,1fr)] sm:items-start">
                                    <div className="pt-2 text-xs font-medium text-stone-500">分类</div>
                                    <div className="flex flex-wrap gap-2">
                                        {promptCategoryOptions.map((category) => (
                                            <Tag.CheckableTag
                                                key={category}
                                                checked={selectedCategory === category}
                                                className={cn(
                                                    "rounded-full border px-3.5 py-1 text-sm transition",
                                                    selectedCategory === category
                                                        ? "border-white/40 !bg-white/15 !text-white"
                                                        : "border-white/10 bg-white/[0.03] !text-stone-400 hover:!text-white",
                                                )}
                                                onChange={() => setSelectedCategory(category)}
                                            >
                                                {category}
                                            </Tag.CheckableTag>
                                        ))}
                                    </div>
                                </div>
                                <div className="grid gap-2 sm:grid-cols-[56px_minmax(0,1fr)] sm:items-start">
                                    <div className="pt-2 text-xs font-medium text-stone-500">标签</div>
                                    <div className="flex flex-wrap gap-2">
                                        {promptTags.map((tag) => (
                                            <Tag.CheckableTag
                                                key={tag}
                                                checked={tag === ALL_PROMPTS_OPTION ? selectedTags.length === 0 : selectedTags.includes(tag)}
                                                className={cn(
                                                    "rounded-full border px-3.5 py-1 text-sm transition",
                                                    (tag === ALL_PROMPTS_OPTION ? selectedTags.length === 0 : selectedTags.includes(tag))
                                                        ? "border-white/40 !bg-white/15 !text-white"
                                                        : "border-white/10 bg-white/[0.03] !text-stone-400 hover:!text-white",
                                                )}
                                                onChange={() => toggleTag(tag)}
                                            >
                                                {tag}
                                            </Tag.CheckableTag>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {!query.isLoading ? (
                    <div>
                        <div className="mx-auto grid max-w-7xl gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                            {promptItems.map((item) => (
                                <PromptCard
                                    key={item.id}
                                    item={item}
                                    onOpen={() => setSelectedPrompt(item)}
                                    onCopy={() => copyText(item.prompt, "提示词已复制")}
                                    extraAction={
                                        <Button size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => savePromptAsset(item)}>
                                            加入我的资产
                                        </Button>
                                    }
                                />
                            ))}
                        </div>
                        {promptItems.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有找到匹配的提示词" className="py-16 !text-stone-500" /> : null}
                        <div className="mx-auto mt-6 max-w-7xl text-center text-xs text-stone-500">
                            {query.isFetchingNextPage ? "加载中..." : query.hasNextPage ? "继续向下滚动加载更多" : promptItems.length > 0 ? "已经到底了" : null}
                        </div>
                    </div>
                ) : null}
            </main>

            <PromptDetailDialog prompt={selectedPrompt} onClose={() => setSelectedPrompt(null)} onCopy={(prompt) => copyText(prompt, "提示词已复制")} onSaveAsset={savePromptAsset} />
        </div>
    );
}
