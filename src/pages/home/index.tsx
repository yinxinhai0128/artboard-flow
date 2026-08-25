import {
  ArrowRight,
  Clapperboard,
  ImagePlus,
  Layers,
  Play,
  Plus,
  Search,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { App, Button, Input, Tag } from "antd";
import { useNavigate } from "react-router-dom";

import { fetchPrompts, type Prompt } from "@/services/api/prompts";
import { navigationTools } from "@/constant/navigation-tools";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/use-auth-store";

/** 黑白灰极简首页：Hero + 功能入口 + 提示词作品流 */

const HERO_FEATURES = [
  { icon: Wand2, title: "AI 生视频", desc: "万相 2.1 原生直出", slug: "video" },
  {
    icon: ImagePlus,
    title: "AI 生图",
    desc: "Qwen-Image 多风格直出",
    slug: "image",
  },
  {
    icon: Layers,
    title: "创作画布",
    desc: "节点编排，连接创意",
    slug: "canvas",
  },
] as const;

const SHOW_TABS = [
  "全部",
  "精选",
  "广告设计",
  "人像",
  "3d",
  "风景",
  "动漫",
] as const;

export default function IndexPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [primaryTool] = navigationTools;
  const user = useAuthStore((state) => state.user);
  const [promptShowcase, setPromptShowcase] = useState<Prompt[]>([]);
  const [activeTab, setActiveTab] =
    useState<(typeof SHOW_TABS)[number]>("全部");
  const [keyword, setKeyword] = useState("");

  useEffect(() => {
    void fetchPrompts({ pageSize: 20 })
      .then((data) => setPromptShowcase(data.items))
      .catch((error) =>
        message.error(
          error instanceof Error ? error.message : "获取提示词失败",
        ),
      );
  }, [message]);

  const filtered = promptShowcase.filter((item) => {
    if (
      activeTab !== "全部" &&
      !item.tags.some((tag) => tag.includes(activeTab))
    )
      return false;
    if (
      keyword &&
      !item.title.includes(keyword) &&
      !item.prompt.includes(keyword)
    )
      return false;
    return true;
  });

  return (
    <main className="h-full overflow-y-auto bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-6 pb-20 pt-10">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-2xl border border-border bg-card px-8 py-14">
          <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-foreground/[0.04] blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-16 size-72 rounded-full bg-foreground/[0.03] blur-3xl" />
          <div className="relative">
            <Tag className="mb-4 !border-foreground/15 !bg-foreground/[0.04] !text-muted-foreground">
              ArtboardFlow
            </Tag>
            <h1 className="text-balance text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
              只需一张画布
              <br />
              连接你的多种创意想法
            </h1>
            <p className="mt-5 max-w-xl text-balance text-base leading-7 text-muted-foreground">
              在画布上生成、连接和重组图片、文字与视频，让创作从单次生成变成连续推演。
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button
                type="primary"
                size="large"
                onClick={() => navigate(`/${primaryTool.slug}`)}
                icon={<Plus className="size-4" />}
              >
                新建画布创作
              </Button>
              <Button
                size="large"
                onClick={() => navigate("/image")}
                icon={<ImagePlus className="size-4" />}
              >
                去生图
              </Button>
            </div>
          </div>
        </section>

        {/* 功能入口 */}
        <section className="mt-8 grid gap-4 sm:grid-cols-3">
          {HERO_FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <button
                key={feature.title}
                type="button"
                onClick={() => navigate(`/${feature.slug}`)}
                className="group rounded-xl border border-border bg-card p-5 text-left transition hover:border-foreground/25 hover:bg-accent"
              >
                <span className="mb-3 flex size-9 items-center justify-center rounded-lg bg-foreground/[0.05] text-foreground/70 transition group-hover:bg-foreground group-hover:text-background">
                  <Icon className="size-4" />
                </span>
                <div className="text-sm font-medium">{feature.title}</div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">
                  {feature.desc}
                </div>
              </button>
            );
          })}
        </section>

        {/* 提示词作品流 */}
        <section className="mt-12">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-foreground/[0.06] text-foreground/70">
                <Clapperboard className="size-4" />
              </span>
              <h2 className="text-xl font-semibold">提示词精选</h2>
            </div>
            <div className="flex w-full max-w-xs items-center gap-2 rounded-lg border border-border bg-card px-3">
              <Search className="size-3.5 shrink-0 text-muted-foreground" />
              <Input
                variant="borderless"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索提示词"
                className="!bg-transparent"
              />
            </div>
          </div>

          <div className="mb-5 flex flex-wrap gap-2">
            {SHOW_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm transition",
                  activeTab === tab
                    ? "bg-foreground text-background"
                    : "bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {tab}
              </button>
            ))}
          </div>

          {filtered.length ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {filtered.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate("/prompts")}
                  className="group overflow-hidden rounded-xl border border-border bg-card text-left transition hover:border-foreground/25"
                >
                  <div className="relative aspect-video overflow-hidden bg-muted">
                    <img
                      src={item.coverUrl}
                      alt={item.title}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.05]"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                    <div className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] text-white backdrop-blur">
                      <Play className="size-2.5" />
                      {item.tags[0] || "精选"}
                    </div>
                  </div>
                  <div className="p-3">
                    <h3 className="line-clamp-1 text-sm font-medium">
                      {item.title}
                    </h3>
                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="line-clamp-1">
                        {user?.username || "ArtboardFlow"}
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        <Sparkles className="size-3" />
                        {item.tags.length * 97 + 12}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
              <Clapperboard className="mb-3 size-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                该分类下暂无提示词
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
