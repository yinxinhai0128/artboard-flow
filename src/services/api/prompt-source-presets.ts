import { nanoid } from "nanoid";

export type PromptSource = {
    id: string;
    name: string;
    githubUrl: string;
    enabled: boolean;
    script: string;
};

export function createPromptSource(source?: Partial<PromptSource>): PromptSource {
    return {
        id: source?.id?.trim() || nanoid(),
        name: source?.name?.trim() || "新来源",
        githubUrl: source?.githubUrl?.trim() || "",
        enabled: source?.enabled ?? true,
        script: source?.script ?? "",
    };
}

const awesomeGptImageScript = `// awesome-gpt-image：从 README.zh-CN.md 解析，## 为标签分组，### 为单条提示词。
const base = "https://raw.githubusercontent.com/ZeroLu/awesome-gpt-image/main";
const markdown = await fetchText(\`\${base}/README.zh-CN.md\`);
const items = [];
for (const section of splitSections(markdown, "## ")) {
  const tags = tagsFromHeading(firstMatch(section, /^##\\s+(.+)$/m));
  for (const block of splitSections(section, "### ")) {
    const title = firstMatch(block, /^###\\s+(.+)$/m).replace(/\\[([^\\]]+)]\\([^)]+\\)/g, "$1").trim();
    const prompt = firstMatch(block, /\\*\\*提示词:\\*\\*\\s*\\r?\\n\\s*\\\`\\\`\\\`[\\w-]*\\r?\\n(.*?)\\r?\\n\\\`\\\`\\\`/s).trim();
    if (!title || !prompt) continue;
    const images = extractImages(base, block);
    items.push(makePrompt({ id: \`awesome-gpt-image-\${leftPad(items.length + 1)}\`, title, prompt, coverUrl: images[0] || "", tags, preview: markdownPreview(images) }));
  }
}
return items;`;

const awesomeGpt4oImageScript = `// Awesome-GPT4o-Image-Prompts：README.zh-CN.md 里每个 ### 段落一条提示词。
const base = "https://raw.githubusercontent.com/ImgEdify/Awesome-GPT4o-Image-Prompts/main";
const markdown = await fetchText(\`\${base}/README.zh-CN.md\`);
const items = [];
for (const block of splitSections(markdown, "### ")) {
  const title = firstMatch(block, /^###\\s+(.+)$/m).trim();
  const prompt = firstMatch(block, /- \\*\\*提示词文本：\\*\\*\\s*\\\`(.*?)\\\`/s).trim();
  if (!title || !prompt) continue;
  const images = extractImages(base, block);
  items.push(makePrompt({ id: \`awesome-gpt4o-image-prompts-\${leftPad(items.length + 1)}\`, title, prompt, coverUrl: images[0] || "", tags: ["gpt4o"], preview: markdownPreview(images) }));
}
return items;`;

function youMindScript(base: string, idPrefix: string, modelTag: string) {
    return `// YouMind 系列：README_zh.md 里 "### No.N: 标题" + "#### ...提示词" 代码块。
const base = "${base}";
const idPrefix = "${idPrefix}";
const modelTag = "${modelTag}";
const markdown = await fetchText(\`\${base}/README_zh.md\`);
const items = [];
for (const block of splitSections(markdown, "### ")) {
  const title = firstMatch(block, /^###\\s+No\\.\\s*\\d+:\\s*(.+)$/m).trim();
  const prompt = firstMatch(block, /#### .*?提示词\\s*\\r?\\n\\s*\\\`\\\`\\\`[\\w-]*\\r?\\n(.*?)\\r?\\n\\\`\\\`\\\`/s).trim();
  if (!title || !prompt) continue;
  const images = extractImages(base, block);
  const [, prefix] = title.match(/^(.+?) - /) || [];
  const tags = [modelTag, ...tagsFromHeading(prefix || "")];
  items.push(makePrompt({ id: \`\${idPrefix}-\${leftPad(items.length + 1)}\`, title, prompt, coverUrl: images[0] || "", tags, preview: markdownPreview(images) }));
}
return items;`;
}

const davidWuGptImage2Script = `// davidwu：prompts.json 结构化数据，逐条转换。
const base = "https://raw.githubusercontent.com/davidwuw0811-boop/awesome-gpt-image2-prompts/main";
const data = await fetchJson(\`\${base}/prompts.json\`);
const items = [];
data.forEach((item, index) => {
  const title = (item.title_cn || item.title_en || "").trim();
  const prompt = (item.prompt || "").trim();
  if (!title || !prompt) return;
  const image = absoluteUrl(base, item.image || "");
  const tags = splitTags([item.category_cn, item.category, item.author, item.source].filter(Boolean).join("/"), /\\//);
  if (item.needs_ref) tags.push("需要参考图");
  const preview = [item.title_en, item.note, image ? \`![](\${image})\` : ""].filter(Boolean).join("\\n\\n");
  items.push(makePrompt({ id: \`davidwu-gpt-image2-prompts-\${leftPad(item.id || index + 1)}\`, title, prompt, coverUrl: image, tags, preview }));
});
return items;`;

export const DEFAULT_PROMPT_SOURCES: PromptSource[] = [
    { id: "davidwu-gpt-image2-prompts", name: "davidwu-gpt-image2-prompts", githubUrl: "https://github.com/davidwuw0811-boop/awesome-gpt-image2-prompts", enabled: true, script: davidWuGptImage2Script },
    { id: "awesome-gpt-image", name: "awesome-gpt-image", githubUrl: "https://github.com/ZeroLu/awesome-gpt-image", enabled: true, script: awesomeGptImageScript },
    { id: "awesome-gpt4o-image-prompts", name: "awesome-gpt4o-image-prompts", githubUrl: "https://github.com/ImgEdify/Awesome-GPT4o-Image-Prompts", enabled: true, script: awesomeGpt4oImageScript },
    {
        id: "youmind-gpt-image-2",
        name: "youmind-gpt-image-2",
        githubUrl: "https://github.com/YouMind-OpenLab/awesome-gpt-image-2",
        enabled: true,
        script: youMindScript("https://raw.githubusercontent.com/YouMind-OpenLab/awesome-gpt-image-2/main", "youmind-gpt-image-2", "gpt-image-2"),
    },
    {
        id: "youmind-nano-banana-pro",
        name: "youmind-nano-banana-pro",
        githubUrl: "https://github.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts",
        enabled: true,
        script: youMindScript("https://raw.githubusercontent.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts/main", "youmind-nano-banana-pro", "nano-banana-pro"),
    },
];

/** Starter script inserted when a user creates a blank source. */
export const PROMPT_SOURCE_TEMPLATE = `// 拉取远程列表并 return 一个提示词数组；每条至少含 title 和 prompt。
// 可用辅助见右侧「可用变量」，例如 fetchText / splitSections / makePrompt。
const base = "https://raw.githubusercontent.com/owner/repo/main";
const markdown = await fetchText(\`\${base}/README.md\`);
const items = [];
for (const block of splitSections(markdown, "### ")) {
  const title = firstMatch(block, /^###\\s+(.+)$/m).trim();
  const prompt = firstMatch(block, /\\\`\\\`\\\`[\\w-]*\\r?\\n(.*?)\\r?\\n\\\`\\\`\\\`/s).trim();
  if (!title || !prompt) continue;
  const images = extractImages(base, block);
  items.push(makePrompt({ id: \`my-source-\${leftPad(items.length + 1)}\`, title, prompt, coverUrl: images[0] || "", tags: [], preview: markdownPreview(images) }));
}
return items;`;
