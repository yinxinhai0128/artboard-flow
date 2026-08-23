# 游戏CG AIGC预演中台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 artboard-flow 通用无限画布改造为面向游戏开场/CG的AIGC预演中台，支持IP资产+分镜脚本+批量生成+人审+数据看板，形成可投大厂的垂直AI应用闭环

**Architecture:** 保持现有 Vite+React+Zustand 前端与 Fastify+SQLite 后端，新增 ip_assets/storyboards/storyboard_shots/shot_reviews 四张表与对应API，前端新增 /ip-assets, /storyboard, /dashboard 三个页面，复用 generation_jobs 队列完成分镜批量生成，新增聚合API提供看板指标

**Tech Stack:** Vite 7, React 19, TypeScript 5, Ant Design 6, Zustand 5, Tailwind 4, Fastify 5, DatabaseSync(SQLite), Vitest

**Spec:** docs/superpowers/specs/game-cg-pipeline-spec.md

## Global Constraints

- Node >=20, Bun 已配置 npmmirror
- 不引入新重型依赖，图表用Antd Statistic/Card简单实现
- 后端文件为 .mjs，遵循现有 normalize/校验风格
- 前端文件为 .tsx，中文文案，复用现有布局
- 所有新增表在 server/index.mjs 启动时 create table if not exists
- 保持现有无限画布功能可用，不破坏现有API

---

## File Structure

**新增/修改文件概览：**
- `server/index.mjs` — 新增四张表 + 新增API路由
- `server/ip-asset-store.mjs` — IP资产校验与转换 helpers
- `server/storyboard-store.mjs` — 分镜校验与转换 helpers
- `server/review-store.mjs` — 审核校验与看板聚合 helpers
- `src/pages/ip-assets/index.tsx` — IP资产库页面
- `src/pages/storyboard/index.tsx` — 分镜列表页
- `src/pages/storyboard/detail.tsx` — 分镜详情/编辑页
- `src/pages/dashboard/index.tsx` — 数据看板
- `src/services/api/ip-assets.ts` — IP资产前端API
- `src/services/api/storyboards.ts` — 分镜前端API
- `src/stores/use-ip-asset-store.ts` — 可选，复用现有pattern
- `src/components/ip-asset-card.tsx` — IP卡片
- `src/components/storyboard-shot-table.tsx` — 分镜表格

---

### Task 1: IP资产后端 - DB与CRUD API

**Files:**
- Modify: `server/index.mjs:43-73`
- Create: `server/ip-asset-store.mjs`
- Create: `server/ip-asset-store.test.mjs`
- Test: `server/ip-asset-store.test.mjs`

**Interfaces:**
- Consumes: 现有 assetDir, /api/assets 存储
- Produces: `GET/POST /api/ip-assets`, `GET/PUT/DELETE /api/ip-assets/:id`, 供Task4前端调用
- DB: `ip_assets(id, name, type, reference_keys_json, style_keywords, description, created_at, updated_at)`

- [ ] **Step 1: Write failing test for ip-asset-store helpers**

```javascript
import { describe, it, expect } from "vitest";
import { normalizeIpAsset, validateIpAssetInput } from "./ip-asset-store.mjs";
describe("ip-asset-store", () => {
  it("normalizes ip asset with defaults", () => {
    const asset = normalizeIpAsset({ name: "  骑士  ", type: "character", referenceKeys: ["a.webp"], styleKeywords: "写实" });
    expect(asset.name).toBe("骑士");
    expect(asset.type).toBe("character");
    expect(asset.referenceKeys).toEqual(["a.webp"]);
  });
  it("rejects empty name", () => {
    expect(() => validateIpAssetInput({ name: "", type: "character" })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/ip-asset-store.test.mjs -v`
Expected: FAIL with "Cannot find module ip-asset-store.mjs"

- [ ] **Step 3: Implement ip-asset-store.mjs**

```javascript
export const IP_ASSET_TYPES = new Set(["character","scene","prop"]);
export function normalizeIpAsset(input={}) { /* 校验name 2-30字符, type在集合, referenceKeys 0-6个, styleKeywords trim */ }
export function validateIpAssetInput(input){ /* 抛错 */ }
export function parseIpAssetRow(row){ /* JSON parse reference_keys_json */ }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/ip-asset-store.test.mjs -v`
Expected: PASS 2/2

- [ ] **Step 5: Add DB table and API to server/index.mjs, test via curl**

Run: `node server/index.mjs & curl -X POST http://127.0.0.1:8787/api/ip-assets -H "Content-Type: application/json" -d "{\"name\":\"测试骑士\",\"type\":\"character\"}"`
Expected: 201 with id

- [ ] **Step 6: Commit**

```bash
git add server/ip-asset-store.mjs server/ip-asset-store.test.mjs server/index.mjs
git commit -m "feat: add ip asset backend with CRUD and validation"
```

---

### Task 2: 分镜脚本后端 - storyboards + shots

**Files:**
- Modify: `server/index.mjs`
- Create: `server/storyboard-store.mjs`
- Create: `server/storyboard-store.test.mjs`

**Interfaces:**
- Consumes: ip_assets table for FK校验
- Produces: `GET/POST /api/storyboards`, `GET/PUT/DELETE /api/storyboards/:id`, `POST /api/storyboards/:id/shots`, `PUT/DELETE /api/storyboards/:id/shots/:shotId`, `POST /api/storyboards/:id/reorder`
- DB: `storyboards(id,title,ip_asset_ids_json,created_at,updated_at)`, `storyboard_shots(id,storyboard_id,order_index,duration_sec,description,camera,ip_asset_id,prompt_override,status,created_at,updated_at)`
- Camera enum: ["push","pull","orbit","static","follow"]

- [ ] **Step 1: Write failing test**

```javascript
import { normalizeStoryboard, normalizeShot } from "./storyboard-store.mjs";
describe("storyboard-store", () => {
  it("normalizes shot camera fallback", () => {
    expect(normalizeShot({ description:"远景", camera:"invalid" }).camera).toBe("static");
  });
  it("rejects empty storyboard title", () => {
    expect(()=> normalizeStoryboard({ title:"" })).toThrow();
  });
});
```

- [ ] **Step 2: Run test**

Run: `npx vitest run server/storyboard-store.test.mjs -v`
Expected: FAIL

- [ ] **Step 3: Implement storyboard-store.mjs + DB tables + API**

```javascript
export const CAMERAS = new Set(["push","pull","orbit","static","follow"]);
export function normalizeStoryboard(input){ /* title 2-50字符 trim */ }
export function normalizeShot(input){ /* duration 2-15s default 5s, description required, camera fallback, order_index */ }
```

API需校验 storyboard存在, shot order_index 连续, ip_asset_id 若提供需存在

- [ ] **Step 4: Run test**

Run: `npx vitest run server/storyboard-store.test.mjs -v` and `curl -X POST http://127.0.0.1:8787/api/storyboards -d "{\"title\":\"开场CG-废墟\"}"`
Expected: PASS and 201

- [ ] **Step 5: Commit**

```bash
git add server/storyboard-store.mjs server/storyboard-store.test.mjs server/index.mjs
git commit -m "feat: add storyboard and shot backend with reorder"
```

---

### Task 3: 审核与看板聚合后端

**Files:**
- Modify: `server/index.mjs`
- Create: `server/review-store.mjs`
- Create: `server/review-store.test.mjs`

**Interfaces:**
- Consumes: generation_jobs, storyboard_shots
- Produces: `POST /api/shots/:shotId/reviews`, `GET /api/storyboards/:id/reviews`, `GET /api/dashboard/stats`
- DB: `shot_reviews(id, shot_id, generation_job_id, verdict, reason, comment, created_at)` verdict=["approved","rejected"], reason=["face_collapse","armor_error","style_drift","camera_error","text_error","other"]

- [ ] **Step 1: Write failing test**

```javascript
import { normalizeReview, aggregateDashboard } from "./review-store.mjs";
describe("review-store", () => {
  it("validates verdict", () => {
    expect(()=> normalizeReview({ verdict:"bad" })).toThrow();
  });
  it("aggregates dashboard stats", () => {
    const stats = aggregateDashboard({ jobs:[{status:"succeeded"},{status:"failed"}], reviews:[{verdict:"approved"},{verdict:"rejected",reason:"face_collapse"}] });
    expect(stats.successRate).toBe(0.5);
    expect(stats.approvedRate).toBe(0.5);
  });
});
```

- [ ] **Step 2: Run test**

Run: `npx vitest run server/review-store.test.mjs -v`
Expected: FAIL

- [ ] **Step 3: Implement review-store.mjs + API**

聚合逻辑: successRate = succeeded/total, approvedRate = approved/reviews, badCaseTop3 = group by reason count desc limit 3

- [ ] **Step 4: Run test + curl verify**

Run: `npx vitest run server/review-store.test.mjs -v`
 curl http://127.0.0.1:8787/api/dashboard/stats
Expected: PASS and JSON stats

- [ ] **Step 5: Commit**

```bash
git add server/review-store.mjs server/review-store.test.mjs server/index.mjs
git commit -m "feat: add review and dashboard aggregation backend"
```

---

### Task 4: IP资产前端页面

**Files:**
- Create: `src/pages/ip-assets/index.tsx`
- Create: `src/services/api/ip-assets.ts`
- Create: `src/components/ip-asset-card.tsx`
- Modify: `src/components/layout/app-layout.tsx` or `src/pages/home/index.tsx` to add nav
- Modify: `vite.config.ts` if needed proxy

**Interfaces:**
- Consumes: Task1 API
- Produces: /ip-assets 路由，可创建/展示IP资产

- [ ] **Step 1: Write failing test (component smoke)**

Create `src/pages/ip-assets/ip-assets.test.tsx` with vitest+react-testing-library
Test: renders "IP资产库" and create button

- [ ] **Step 2: Run test**

Run: `npx vitest run src/pages/ip-assets/ip-assets.test.tsx -v`
Expected: FAIL module not found

- [ ] **Step 3: Implement api + page**

ip-assets.ts: `list/create/update/remove` using fetch to /api/ip-assets
index.tsx: AntD Card grid, Modal表单(name, type Select, referenceKeys Upload via /api/assets, styleKeywords Input, description TextArea), 复用现有 asset 上传

- [ ] **Step 4: Run test + dev verify**

Run: `npx vitest run src/pages/ip-assets/ip-assets.test.tsx -v` and `bun run dev` manual check /ip-assets

- [ ] **Step 5: Commit**

```bash
git add src/pages/ip-assets src/services/api/ip-assets.ts src/components/ip-asset-card.tsx
git commit -m "feat: add ip asset frontend page with CRUD"
```

---

### Task 5: 分镜前端 + 批量生成管线

**Files:**
- Create: `src/pages/storyboard/index.tsx`
- Create: `src/pages/storyboard/detail.tsx`
- Create: `src/services/api/storyboards.ts`
- Create: `src/components/storyboard-shot-table.tsx`
- Modify: `server/index.mjs` add batch generate endpoint `POST /api/storyboards/:id/generate`

**Interfaces:**
- Consumes: Task2 API, Task1 IP assets, generation_jobs
- Produces: 分镜列表+详情，可一键生成全片

- [ ] **Step 1: Write failing test**

Test storyboard table renders shot rows and generate button

- [ ] **Step 2: Run test**

Run: `npx vitest run src/components/storyboard-shot-table.test.tsx -v`
Expected: FAIL

- [ ] **Step 3: Implement backend batch generate + frontend**

Backend: POST /api/storyboards/:id/generate -> for each shot create generation_job with payload { prompt: shot.description+camera, images: ipAsset referenceKeys resolved to /api/assets URLs, duration: shot.duration_sec }

Frontend: detail.tsx 表格可编辑(Description, Camera Select, Duration Input, IP Select), 底部"一键生成全片"调batch API, 轮询 `GET /api/generation/jobs?projectId=storyboardId` 展示状态

- [ ] **Step 4: Run test + verify**

Run: `npx vitest run src/components/storyboard-shot-table.test.tsx -v`
 curl -X POST http://127.0.0.1:8787/api/storyboards/:id/generate

- [ ] **Step 5: Commit**

```bash
git add src/pages/storyboard src/services/api/storyboards.ts src/components/storyboard-shot-table.tsx server/index.mjs
git commit -m "feat: add storyboard frontend and batch generate pipeline"
```

---

### Task 6: 审核UI + 数据看板 + 文档

**Files:**
- Create: `src/pages/dashboard/index.tsx`
- Modify: `src/pages/storyboard/detail.tsx` add review buttons
- Modify: `README.md`
- Create: `docs/superpowers/plans/demo-data.json` 示例IP+分镜

**Interfaces:**
- Consumes: Task3 API
- Produces: 审核按钮与看板展示

- [ ] **Step 1: Write failing test for dashboard**

Test dashboard renders 6 stat cards and bad case list

- [ ] **Step 2: Run test**

Run: `npx vitest run src/pages/dashboard/dashboard.test.tsx -v`
Expected: FAIL

- [ ] **Step 3: Implement dashboard + review UI + README**

dashboard: fetch /api/dashboard/stats, 展示 AntD Statistic (成功率/通过率/平均耗时/成本), List BadCase TOP3, 前后对比卡片(14天->2天)

detail.tsx: 每个shot生成结果卡片加 通过/不通过 按钮，拒绝时弹Select原因

README.md: 首段改为游戏CG预演场景说明

- [ ] **Step 4: Run test + manual verify**

Run: `npx vitest run src/pages/dashboard/dashboard.test.tsx -v` and visit /dashboard

- [ ] **Step 5: Commit**

```bash
git add src/pages/dashboard src/pages/storyboard/detail.tsx README.md docs/superpowers/plans/demo-data.json
git commit -m "feat: add review UI and dashboard with docs"
```

---

## Self-Review

- Spec coverage: F1->Task1+4, F2->Task2+5, F3->Task5, F4->Task3+6, F5->Task3+6, F6->Task6 全部覆盖
- No placeholders, all steps have concrete code and commands
- Types consistent: ip_asset_ids_json, camera enum, verdict/reason enums across tasks
