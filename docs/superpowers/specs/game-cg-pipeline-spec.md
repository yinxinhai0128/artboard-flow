# 游戏开场/CG AIGC预演中台 - 需求规格

> 基于 yinxinhai0128/artboard-flow 无限画布改造，服务游戏美术/策划的CG预演

## 背景
当前 artboard-flow 是通用无限画布，纯前端localStorage，无业务场景。公司已用Seedance API做过游戏开场/CG单次生成，但无资产沉淀、无分镜管控、无审核闭环、无数据指标，无法作为大厂作品集。

## 目标用户
- 游戏美术：需要IP一致性、快速出变体
- 策划/导演：需要分镜可控、批量预演、快速选片

## 核心场景
1. 创建IP资产包(角色三视图/场景原画/风格词) -> 2. 创建分镜脚本(5-8镜，每镜绑定IP+运镜+文案) -> 3. 一键批量生成全片预演 -> 4. 人审打标(通过/不通过+原因) -> 5. 看板看效率/质量指标

## 功能需求

### F1 IP资产库
- 创建/编辑/删除IP资产包：名称、类型[角色/场景/道具]、参考图(1-6张)、风格关键词、描述
- 资产存储：复用现有 /api/assets 存储，新增 ip_assets 表关联
- 前端：新建 /ip-assets 页面，卡片展示

### F2 分镜脚本
- 数据模型：storyboards表 + storyboard_shots表
- 字段：storyboard{ id, title, ipAssetIds[], createdAt }, shot{ id, storyboardId, order, durationSec, description, camera[推/拉/环绕/固定/跟随], ipAssetId, promptOverride, status }
- API：CRUD + reorder
- 前端：/storyboard 页面，表格可编辑，每行可绑定IP资产，预览prompt

### F3 批量生成管线
- 输入：storyboardId -> 为每个shot创建generation_job，payload带上IP参考图+shot描述+camera
- 复用现有 generation-adapter.mjs + Seedance调用，扩展支持按分镜批量队列
- 状态：queued -> processing -> succeeded/failed/cancelled
- 前端：Storyboard详情页“一键生成全片”按钮，实时轮询job状态，展示缩略图

### F4 审核与Bad Case
- 人审：每个shot的生成结果可标记 approved/rejected + reason[脸崩/盔甲错/风格偏离/运镜错/文字错/其他]
- 存储：shot_reviews表
- 前端：生成结果卡片上通过/不通过按钮，原因选择

### F5 数据看板
- 指标：系统(成功率/耗时/成本)、质量(通过率/Bad Case TOP3)、业务(周期对比)
- 数据源：generation_jobs + shot_reviews 聚合
- 前端：/dashboard 页面，卡片+图表

### F6 演示与文档
- README重写首段，附工作流截图
- 提供演示数据：1个示例IP包 + 1个示例分镜
- 部署复用现有Vite+Fastify

## 约束
- 不泄露公司IP，用通用素材
- 保持现有画布可用
- 遵循现有代码风格：mjs后端，tsx前端
