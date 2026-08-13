import { javascript } from "@codemirror/lang-javascript";
import CodeMirror from "@uiw/react-codemirror";
import { Button, Drawer, Input, Space } from "antd";
import { useEffect, useState } from "react";

import { PROMPT_SOURCE_VARIABLES } from "@/services/api/prompt-source-runtime";
import { PROMPT_SOURCE_TEMPLATE, type PromptSource } from "@/services/api/prompt-source-presets";

function isDarkMode() {
    return typeof document !== "undefined" && document.documentElement.classList.contains("dark");
}

export function PromptSourceEditorDrawer({ open, source, onSave, onClose }: { open: boolean; source: PromptSource | null; onSave: (source: PromptSource) => void; onClose: () => void }) {
    const [draft, setDraft] = useState<PromptSource | null>(source);

    useEffect(() => {
        if (open && source) setDraft(source);
    }, [open, source]);

    if (!draft) return null;

    const patch = (value: Partial<PromptSource>) => setDraft((current) => (current ? { ...current, ...value } : current));

    const save = () => {
        onSave({ ...draft, name: draft.name.trim() || "未命名来源", githubUrl: draft.githubUrl.trim(), script: draft.script.trim() });
        onClose();
    };

    return (
        <Drawer
            open={open}
            width={880}
            title="编辑提示词来源"
            onClose={onClose}
            styles={{ body: { paddingTop: 16 } }}
            extra={
                <Space>
                    <Button onClick={onClose}>取消</Button>
                    <Button type="primary" onClick={save}>
                        保存
                    </Button>
                </Space>
            }
        >
            <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                    <span className="mb-1 block text-sm font-medium">来源名称</span>
                    <Input value={draft.name} onChange={(event) => patch({ name: event.target.value })} placeholder="用于分类展示" />
                </label>
                <label className="block">
                    <span className="mb-1 block text-sm font-medium">GitHub 地址（可选）</span>
                    <Input value={draft.githubUrl} onChange={(event) => patch({ githubUrl: event.target.value })} placeholder="https://github.com/owner/repo" />
                </label>
            </div>

            <div className="mt-6 mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                    <div className="text-sm font-semibold">拉取脚本</div>
                    <div className="mt-0.5 text-xs text-stone-500">脚本是一段异步函数体，直接使用下方变量，最后 return 一个提示词数组（每条至少含 title 和 prompt）。</div>
                </div>
                <Button size="small" onClick={() => patch({ script: PROMPT_SOURCE_TEMPLATE })}>
                    插入模板
                </Button>
            </div>

            <div className="flex h-[56vh] min-h-[420px] overflow-hidden rounded-lg border border-stone-200 dark:border-stone-800">
                <aside className="flex w-[300px] shrink-0 flex-col overflow-y-auto border-r border-stone-200 bg-stone-50/80 dark:border-stone-800 dark:bg-stone-900/40">
                    <div className="px-4 py-3">
                        <div className="mb-2.5 flex items-center justify-between">
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">可用变量</span>
                            <span className="text-[10px] text-stone-400">点击插入</span>
                        </div>
                        <div className="space-y-1.5">
                            {PROMPT_SOURCE_VARIABLES.map((variable) => (
                                <button
                                    key={variable.name}
                                    type="button"
                                    onClick={() => patch({ script: draft.script ? `${draft.script}\n${variable.name}` : variable.name })}
                                    className="group block w-full rounded-lg border border-transparent px-2.5 py-2 text-left transition-colors hover:border-stone-200 hover:bg-white dark:hover:border-stone-700 dark:hover:bg-stone-800/60"
                                >
                                    <div className="flex flex-wrap items-baseline gap-1.5">
                                        <code className="rounded bg-stone-200/80 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-stone-800 group-hover:bg-blue-100 group-hover:text-blue-700 dark:bg-stone-800 dark:text-stone-100 dark:group-hover:bg-blue-950 dark:group-hover:text-blue-300">
                                            {variable.name}
                                        </code>
                                        <span className="font-mono text-[10px] text-stone-400">{variable.type}</span>
                                    </div>
                                    <div className="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">{variable.desc}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                </aside>
                <div className="min-w-0 flex-1 overflow-hidden bg-white dark:bg-stone-950">
                    <CodeMirror
                        value={draft.script}
                        onChange={(value) => patch({ script: value })}
                        height="100%"
                        theme={isDarkMode() ? "dark" : "light"}
                        extensions={[javascript()]}
                        placeholder={"// return 一个提示词数组；点击右上角「插入模板」查看示例。"}
                        style={{ height: "100%", fontSize: 13 }}
                        className="h-full [&_.cm-editor]:h-full [&_.cm-gutters]:border-none [&_.cm-scroller]:overflow-auto"
                    />
                </div>
            </div>
        </Drawer>
    );
}
