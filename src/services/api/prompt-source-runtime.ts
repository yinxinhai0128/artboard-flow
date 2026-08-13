/**
 * Runtime for user-authored prompt-source scripts. A script is an async function body that fetches
 * a remote list (markdown / json) and `return`s an array of prompt items. It runs with a set of flat
 * helper locals (see PROMPT_SOURCE_VARIABLES) so scripts stay short and declarative.
 */

export type RawPrompt = {
    id: string;
    title: string;
    coverUrl: string;
    prompt: string;
    tags: string[];
    preview: string;
    createdAt: string;
    updatedAt: string;
};

type RunOptions = { signal?: AbortSignal };

async function fetchText(url: string) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`${url} 拉取失败`);
    return response.text();
}

async function fetchJson<T = unknown>(url: string) {
    return JSON.parse(await fetchText(url)) as T;
}

/** Split markdown into blocks, each starting at a line that begins with `prefix` (e.g. "## " / "### "). */
function splitSections(markdown: string, prefix: string) {
    const blocks: string[] = [];
    let current: string[] = [];
    for (const line of markdown.split("\n")) {
        if (line.startsWith(prefix) && current.length) {
            blocks.push(current.join("\n"));
            current = [];
        }
        current.push(line);
    }
    blocks.push(current.join("\n"));
    return blocks;
}

function firstMatch(value: string, pattern: RegExp) {
    return pattern.exec(value)?.[1] || "";
}

function absoluteUrl(baseUrl: string, path: string) {
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    return `${baseUrl}/${path.replace(/^\.?\//, "")}`;
}

function extractImages(baseUrl: string, markdown: string) {
    return Array.from(markdown.matchAll(/!\[[^\]]*]\(([^)]+)\)/g), (match) => absoluteUrl(baseUrl, match[1])).filter(Boolean);
}

function splitTags(value: string, pattern: RegExp) {
    return value
        .split(pattern)
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean);
}

function tagsFromHeading(heading: string) {
    return splitTags(heading.replace(/[^\p{L}\p{N}/&、与 ]/gu, ""), /\s*(?:\/|&|、|与)\s*/);
}

function markdownPreview(images: string[]) {
    return images
        .filter(Boolean)
        .map((image) => `![](${image})`)
        .join("\n\n");
}

function leftPad(value: number) {
    return String(value).padStart(4, "0");
}

function makePrompt(input: { id: string; title: string; prompt: string; coverUrl?: string; tags?: string[]; preview?: string; createdAt?: string; updatedAt?: string }): RawPrompt {
    return {
        id: input.id,
        title: input.title,
        prompt: input.prompt,
        coverUrl: input.coverUrl || "",
        tags: input.tags || [],
        preview: input.preview || "",
        createdAt: input.createdAt || "",
        updatedAt: input.updatedAt || "",
    };
}

/** Run a prompt-source script and normalize its result into a deduped RawPrompt[]. */
export async function runPromptSource(script: string, options?: RunOptions): Promise<RawPrompt[]> {
    const body = script.trim();
    if (!body) throw new Error("提示词来源脚本为空");
    const runner = new Function(
        "fetchText",
        "fetchJson",
        "splitSections",
        "firstMatch",
        "extractImages",
        "absoluteUrl",
        "tagsFromHeading",
        "splitTags",
        "markdownPreview",
        "leftPad",
        "makePrompt",
        "signal",
        `"use strict"; return (async () => {\n${body}\n})();`,
    ) as (...args: unknown[]) => Promise<unknown>;
    let result: unknown;
    try {
        result = await runner(fetchText, fetchJson, splitSections, firstMatch, extractImages, absoluteUrl, tagsFromHeading, splitTags, markdownPreview, leftPad, makePrompt, options?.signal);
    } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`提示词来源脚本执行失败：${message}`);
    }
    if (!Array.isArray(result)) throw new Error("提示词来源脚本需要 return 一个数组");
    const seen = new Set<string>();
    const items: RawPrompt[] = [];
    for (const raw of result) {
        if (!raw || typeof raw !== "object") continue;
        const record = raw as Record<string, unknown>;
        const title = String(record.title || "").trim();
        const prompt = String(record.prompt || "").trim();
        if (!title || !prompt) continue;
        const id = String(record.id || "").trim() || `prompt-${leftPad(items.length + 1)}`;
        if (seen.has(id)) continue;
        seen.add(id);
        items.push(
            makePrompt({
                id,
                title,
                prompt,
                coverUrl: String(record.coverUrl || ""),
                tags: Array.isArray(record.tags) ? record.tags.map((tag) => String(tag)).filter(Boolean) : [],
                preview: String(record.preview || ""),
                createdAt: String(record.createdAt || ""),
                updatedAt: String(record.updatedAt || ""),
            }),
        );
    }
    return items;
}

export type PromptSourceVariable = { name: string; type: string; desc: string };

/** Documentation surface shown in the prompt-source script editor. */
export const PROMPT_SOURCE_VARIABLES: PromptSourceVariable[] = [
    { name: "fetchText", type: "function", desc: "fetchText(url) 拉取纯文本（README 等），失败抛错" },
    { name: "fetchJson", type: "function", desc: "fetchJson(url) 拉取并解析 JSON" },
    { name: "splitSections", type: "function", desc: "splitSections(markdown, prefix) 按标题前缀（如 '### '）切分成段落数组" },
    { name: "firstMatch", type: "function", desc: "firstMatch(text, /正则/) 返回第一个捕获组，未匹配返回空串" },
    { name: "extractImages", type: "function", desc: "extractImages(baseUrl, markdown) 提取 markdown 图片并补全为绝对地址" },
    { name: "absoluteUrl", type: "function", desc: "absoluteUrl(baseUrl, path) 把相对路径拼成绝对 URL" },
    { name: "tagsFromHeading", type: "function", desc: "tagsFromHeading(heading) 从标题按 / & 、与 切出标签（小写去重前）" },
    { name: "splitTags", type: "function", desc: "splitTags(value, /分隔符/) 切分标签并转小写去空" },
    { name: "markdownPreview", type: "function", desc: "markdownPreview(images) 把图片数组拼成 markdown 预览文本" },
    { name: "leftPad", type: "function", desc: "leftPad(n) 数字左补零到 4 位，用于生成有序 id" },
    { name: "makePrompt", type: "function", desc: "makePrompt({id,title,prompt,coverUrl,tags,preview}) 构造一条提示词；title 和 prompt 必填" },
    { name: "signal", type: "AbortSignal", desc: "取消信号，可透传给需要的请求" },
];
