# Seedance 官方能力对齐 · 差距证据与修正记录

> 记录 ArtboardFlow 现有 Seedance 视频生成实现与官方能力的差距、以及已完成的增量修正。
> 结论均来自公开官方/官方控制台/官方使用手册/多源交叉印证，逐条标注来源与置信度，不依赖记忆。

## 一、结论摘要

| 项 | 现状（改前） | 官方能力 | 本次处置 |
|---|---|---|---|
| Seedance 2.5 单段时长 | 15s 封顶 | **4–30s（`-1` 或 4–30）** | ✅ 已修 |
| Seedance 2.5 参考图 | 9 张 | **最多 30 张** | ✅ 已修 |
| Seedance 2.5 参考视频 | 3 段 / 单个<50MB / 2-15s / 合计≤15s | **最多 10 段 / <200MB / 2-30s / 合计≤30s** | ✅ 已修 |
| Seedance 2.5 参考音频 | 3 段 / 2-15s / 合计≤15s / 不可单独用 | **最多 10 段 / 2-30s / 合计≤30s / 支持仅音频参考** | ✅ 已修 |
| Seedance 设置面板可达性 | `config.model` 误取生图模型，Seedance 面板无法渲染 | 应按 `videoModel` 判定 | ✅ 已修 |
| 能力参数架构 | 散落 if/else + 一刀切常量 | 按模型能力画像 | ✅ 已收敛为 `seedanceModelProfile` |
| 输出分辨率 | 480p/720p/1080p | 即梦 2.5 输出 480p/720p（4K 是「输入参考」范围，非输出） | ⏳ 仅记录 |
| 预设网关路径时长 | `seconds` 封顶 20s | 网关侧语义待确认 | ⏳ 仅记录 |

## 二、模型 ID 真实性确认

`src/stores/use-config-store.ts`「团队网关 Seedance」渠道的模型 ID 均真实：

- `doubao-seedance-2-5-260628`（Seedance 2.5）— 火山方舟官方控制台 `ark.volcengine.com/region:cn-beijing/experience/gen_video?model=doubao-seedance-2-5-260628`（官方，高置信）
- `doubao-seedance-2-0-260128` / `-fast` / `-mini`（Seedance 2.0 系列）— Cloudflare AI、Replicate、GMI Cloud、compshare 等交叉印证（中高置信）

## 三、官方能力依据

主要来源：**《即梦 Seedance 2.5 使用手册》**（字节 Lark 官方 wiki，2026-08-02 读取，revision 8502），辅以火山方舟控制台、Replicate 官方模型页、BytePlus、火山引擎公告。

关键事实（手册口径，已注明「对每个 API/路由不构成普遍承诺」）：

1. **时长**：基础生成 4–30s（`duration -1` 或 4–30，97–721 帧）；超长模式 30–180s；原生延长 4–30s。
2. **输出分辨率**：480p / 720p。
3. **参考图**：最多 30 张；jpeg/png/webp/bmp/tiff/gif/heic/heif；宽高比 0.4–2.5；宽高 300–6000px；单张 <30MB。
4. **参考视频**：最多 10 段、合计时长 ≤30s；mp4/mov；输入 480p–4K；24–60fps；单段约 2–30s；单个 <200MB。
5. **参考音频**：最多 10 段、合计时长 ≤30s；wav/mp3；单段约 2–30s；单个 <15MB。
6. **仅音频参考**：支持（不再强制必须有图/视频）。

## 四、本次代码修正（已批准 Scope 内，增量、向后兼容）

1. `src/lib/seedance-video.ts`
   - 新增 `SeedanceReferenceLimits` 类型与 `SEEDANCE_25_REFERENCE_LIMITS`；`SEEDANCE_REFERENCE_LIMITS` 保留为 2.0 系列并补齐时长/audioOnly 字段。
   - 新增 `isSeedance25Model` / `seedanceMaxDuration` / `seedanceDurationOptionsFor` / `seedanceReferenceLimitsFor` / `seedanceModelProfile`（单一能力画像来源）。
   - `normalizeSeedanceDuration(value, model)` 按模型区分上限（2.5→30s，其余→15s）。
   - `seedanceVideoReferenceError(videos, limits)` / 新增 `seedanceAudioReferenceError(audios, limits)`，按模型校验数量/大小/时长/合计时长。
   - `isSeedanceVideoConfig` 改用 `videoModel || model`（修复视频工作台误取生图模型、导致 Seedance 设置面板无法渲染的 Bug）。
2. `src/services/api/video.ts`
   - `createSeedanceTask` 通过 `seedanceModelProfile` 取参考上限与仅音频约束，时长/分辨率传模型名；参考切片按模型上限。
   - `assertSeedanceVideoReferences` / `assertSeedanceAudioReferences` 复用 `seedance*ReferenceError`，消除重复硬编码。
3. `src/components/video-settings-panel.tsx`
   - 时长选项与输入上限按模型区分（2.5 出现 30s）；模型判定改用 `videoModel`。
4. `src/pages/video/index.tsx`
   - 上传/剪切板/资产插入/空态文案/音频时长过滤全部改为按 `seedanceReferenceLimitsFor(model)` 动态取值；`buildVideoConfig` 对 Seedance 用模型感知时长。

## 五、素材引用体验（LibTV 式）审查结论

审查 `canvas-resource-references.ts`、`canvas-resource-mention-textarea.tsx`、`canvas-prompt-chip-input.tsx`、`canvas-node-generation.ts`、`image-reference-prompt.ts`：

- 已具备：连接解析出引用资源、`@` 提及 + 候选菜单 + 高亮、contentEditable 内嵌缩略图 chip、`@[node:ID]` composer token、原子删除引用。
- 引用 label（图片N/视频N/音频N/文本N）按「类型独立编号」，在 3 处生产点与视频 API 消费点之间语义一致，无错位。
- 结论：未发现确证缺陷，无需改动（避免臆造范围）。

## 六、待后续 Scope（需先取官方/网关方确认）

- Ark 方舟 `contents/generations/tasks` 对 Seedance 2.5 输出分辨率的精确枚举（是否保留 1080p）——即梦手册为 480p/720p，但 Ark API 枚举可能不同。
- 预设「团队网关 Seedance」（new-api，OpenAI 兼容 `/videos`）的 `seconds` 语义与 30s 支持，需与网关负责人确认（当前 `normalizeVideoSeconds` 封顶 20s）。
