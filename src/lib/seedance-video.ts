import {
  modelOptionName,
  resolveModelRequestConfig,
  type AiConfig,
} from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";

export type SeedanceReferenceLimits = {
  images: number;
  videos: number;
  audios: number;
  imageMaxBytes: number;
  videoMaxBytes: number;
  audioMaxBytes: number;
  /** 单个参考视频/音频的时长范围（秒） */
  minAssetSeconds: number;
  maxAssetSeconds: number;
  /** 参考视频总时长 / 参考音频总时长上限（秒） */
  maxCombinedSeconds: number;
  /** 是否允许仅用参考音频（无图/视频）生成 */
  audioOnlyAllowed: boolean;
};

/** Seedance 2.0 系列参考资产约束（沿用既有行为，向后兼容）。 */
export const SEEDANCE_REFERENCE_LIMITS: SeedanceReferenceLimits = {
  images: 9,
  videos: 3,
  audios: 3,
  imageMaxBytes: 30 * 1024 * 1024,
  videoMaxBytes: 50 * 1024 * 1024,
  audioMaxBytes: 15 * 1024 * 1024,
  minAssetSeconds: 2,
  maxAssetSeconds: 15,
  maxCombinedSeconds: 15,
  audioOnlyAllowed: false,
};

/** Seedance 2.5 参考资产约束（即梦官方使用手册：图 30 / 视频 10 / 音频 10；视频 <200MB、2-30s、合计≤30s；音频 <15MB、2-30s、合计≤30s；支持仅音频参考）。 */
export const SEEDANCE_25_REFERENCE_LIMITS: SeedanceReferenceLimits = {
  images: 30,
  videos: 10,
  audios: 10,
  imageMaxBytes: 30 * 1024 * 1024,
  videoMaxBytes: 200 * 1024 * 1024,
  audioMaxBytes: 15 * 1024 * 1024,
  minAssetSeconds: 2,
  maxAssetSeconds: 30,
  maxCombinedSeconds: 30,
  audioOnlyAllowed: true,
};

export const seedanceResolutionOptions = [
  { value: "480p", label: "480p" },
  { value: "720p", label: "720p" },
  { value: "1080p", label: "1080p" },
  { value: "4k", label: "4K" },
] as const;

/** 按模型返回可选分辨率：仅 Seedance 2.0 标准版支持 1080p/4K；2.5、fast、mini 均只有 480p/720p。 */
export function seedanceResolutionOptionsFor(model: string) {
  return isSeedance20StandardModel(model)
    ? seedanceResolutionOptions
    : seedanceResolutionOptions.slice(0, 2);
}

export const seedanceRatioOptions = [
  { value: "16:9", label: "横屏" },
  { value: "9:16", label: "竖屏" },
  { value: "1:1", label: "方形" },
  { value: "4:3", label: "标准横屏" },
  { value: "3:4", label: "标准竖屏" },
  { value: "21:9", label: "宽银幕" },
  { value: "adaptive", label: "自适应" },
] as const;

export const seedanceDurationOptions = [-1, 4, 5, 6, 8, 10, 12, 15] as const;

/** Seedance 2.5 原生支持最长 30 秒单段生成（官方/多源确认）。 */
export const seedance25DurationOptions = [
  -1, 4, 5, 6, 8, 10, 12, 15, 20, 30,
] as const;

const seedancePixels = {
  "480p": {
    "16:9": "864x496",
    "4:3": "752x560",
    "1:1": "640x640",
    "3:4": "560x752",
    "9:16": "496x864",
    "21:9": "992x432",
  },
  "720p": {
    "16:9": "1280x720",
    "4:3": "1112x834",
    "1:1": "960x960",
    "3:4": "834x1112",
    "9:16": "720x1280",
    "21:9": "1470x630",
  },
  "1080p": {
    "16:9": "1920x1080",
    "4:3": "1664x1248",
    "1:1": "1440x1440",
    "3:4": "1248x1664",
    "9:16": "1080x1920",
    "21:9": "2206x946",
  },
  "4k": {
    "16:9": "3840x2160",
    "4:3": "3328x2496",
    "1:1": "2880x2880",
    "3:4": "2496x3328",
    "9:16": "2160x3840",
    "21:9": "4412x1892",
  },
} as const;

export function isSeedanceVideoConfig(
  config: AiConfig | Pick<AiConfig, "model" | "videoModel" | "baseUrl">,
) {
  const requestConfig =
    "channels" in config
      ? resolveModelRequestConfig(config, config.videoModel || config.model)
      : config;
  return isArkBaseUrl(requestConfig.baseUrl) || isArkPlanBaseUrl(requestConfig.baseUrl);
}

/** 火山方舟（Volcano Ark）直连 base URL。 */
export function isArkBaseUrl(baseUrl: string) {
  return baseUrl.toLowerCase().includes("ark.cn-beijing.volces.com");
}

/** new-api 网关 base URL（走团队网关，OpenAI 兼容 /v1 接口）。 */
export function isGatewayBaseUrl(baseUrl: string) {
  const v = baseUrl.toLowerCase();
  return v.includes(":32124") || v.includes("/gateway");
}

export function isSeedanceVideoModel(model: string) {
  const value = model.toLowerCase();
  return value.includes("seedance") || value.includes("doubao-seedance");
}

export function isSeedanceFastModel(model: string) {
  const value = model.toLowerCase();
  return isSeedanceVideoModel(value) && value.includes("fast");
}

/** Seedance 2.5（doubao-seedance-2-5-*）模型判断。 */
export function isSeedance25Model(model: string) {
  const value = model.toLowerCase();
  return isSeedanceVideoModel(value) && /2[-.]5/.test(value);
}

/** Seedance 2.0 标准版（doubao-seedance-2-0-260128，非 fast/mini）——唯一支持 1080p/4K 的模型。 */
export function isSeedance20StandardModel(model: string) {
  const value = model.toLowerCase();
  return (
    isSeedanceVideoModel(value) &&
    /2[-.]0/.test(value) &&
    !value.includes("fast") &&
    !value.includes("mini")
  );
}

export function seedanceReferenceLimitsFor(model: string) {
  return isSeedance25Model(model)
    ? SEEDANCE_25_REFERENCE_LIMITS
    : SEEDANCE_REFERENCE_LIMITS;
}

export type SeedanceModelProfile = {
  maxDuration: number;
  referenceLimits: SeedanceReferenceLimits;
};

/** Seedance 模型能力画像（单一来源，供 API 与 UI 共用，避免散落 if/else）。 */
export function seedanceModelProfile(model: string): SeedanceModelProfile {
  return {
    maxDuration: seedanceMaxDuration(model),
    referenceLimits: seedanceReferenceLimitsFor(model),
  };
}

export function seedanceDurationOptionsFor(model: string) {
  return isSeedance25Model(model)
    ? seedance25DurationOptions
    : seedanceDurationOptions;
}

export function seedanceMaxDuration(model: string) {
  return isSeedance25Model(model) ? 30 : 15;
}

export function isArkPlanBaseUrl(baseUrl: string) {
  return (
    baseUrl.toLowerCase().includes("ark.cn-beijing.volces.com/api/plan/v3") ||
    baseUrl.toLowerCase().includes("/api/plan/v3")
  );
}

export function normalizeSeedanceResolution(value: string, model = "") {
  const normalized = normalizeResolutionToken(value);
  const allowed = seedanceResolutionOptionsFor(model);
  return allowed.some((item) => item.value === normalized) ? normalized : "720p";
}

export function normalizeResolutionToken(value: string) {
  if (value === "low") return "480p";
  if (value === "auto" || value === "high" || value === "medium") return "720p";
  const resolution = String(value || "").replace(/p$/i, "") || "720";
  return `${resolution}p`;
}

export function normalizeSeedanceDuration(value: string, model = "") {
  if (String(value).trim() === "-1") return -1;
  const seconds = Math.floor(Number(value) || 5);
  return Math.max(4, Math.min(seedanceMaxDuration(model), seconds));
}

export function normalizeSeedanceRatio(value: string) {
  if (!value || value === "auto" || value === "adaptive") return "adaptive";
  if (seedanceRatioOptions.some((item) => item.value === value)) return value;
  const match = value.match(/^(\d+)x(\d+)$/);
  if (!match) return "adaptive";
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!width || !height) return "adaptive";
  const ratio = width / height;
  const options = [
    ["16:9", 16 / 9],
    ["4:3", 4 / 3],
    ["1:1", 1],
    ["3:4", 3 / 4],
    ["9:16", 9 / 16],
    ["21:9", 21 / 9],
  ] as const;
  return options.reduce(
    (best, item) =>
      Math.abs(item[1] - ratio) < Math.abs(best[1] - ratio) ? item : best,
    options[0],
  )[0];
}

export function seedancePixelLabel(resolution: string, ratio: string) {
  const normalizedResolution = normalizeSeedanceResolution(
    resolution,
  ) as keyof typeof seedancePixels;
  const normalizedRatio = normalizeSeedanceRatio(ratio) as
    | keyof (typeof seedancePixels)[typeof normalizedResolution]
    | "adaptive";
  if (normalizedRatio === "adaptive") return "自动匹配";
  return seedancePixels[normalizedResolution][normalizedRatio] || "";
}

export function boolConfig(value: string | undefined, fallback: boolean) {
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

export function seedanceReferenceLabel(
  kind: "image" | "video" | "audio",
  index: number,
) {
  if (kind === "image") return `图片${index + 1}`;
  if (kind === "video") return `视频${index + 1}`;
  return `音频${index + 1}`;
}

export function buildSeedancePromptText(
  prompt: string,
  images: ReferenceImage[],
  videos: ReferenceVideo[],
  audios: ReferenceAudio[],
) {
  const labels = [
    ...images.map((_, index) => seedanceReferenceLabel("image", index)),
    ...videos.map((_, index) => seedanceReferenceLabel("video", index)),
    ...audios.map((_, index) => seedanceReferenceLabel("audio", index)),
  ];
  const text = prompt.trim();
  if (!labels.length) return text;
  return `参考资产编号：${labels.join("、")}。请按这些编号理解提示词中的图片、视频和音频引用。\n\n${text}`;
}

export function seedanceVideoReferenceError(
  videos: ReferenceVideo[],
  limits: SeedanceReferenceLimits = SEEDANCE_REFERENCE_LIMITS,
) {
  let totalDurationMs = 0;
  for (let index = 0; index < videos.length; index += 1) {
    const video = videos[index];
    const label = seedanceReferenceLabel("video", index);
    if (video.bytes && video.bytes > limits.videoMaxBytes)
      return `${label} 超过 ${limits.videoMaxBytes / (1024 * 1024)}MB，请压缩后再上传`;
    if (video.durationMs) {
      if (
        video.durationMs < limits.minAssetSeconds * 1000 ||
        video.durationMs > limits.maxAssetSeconds * 1000
      )
        return `${label} 时长需要在 ${limits.minAssetSeconds}-${limits.maxAssetSeconds} 秒之间`;
      totalDurationMs += video.durationMs;
    }
    if (video.width && video.height) {
      if (
        video.width < 300 ||
        video.width > 6000 ||
        video.height < 300 ||
        video.height > 6000
      )
        return `${label} 宽高需要在 300-6000px 之间`;
      const ratio = video.width / video.height;
      if (ratio < 0.4 || ratio > 2.5)
        return `${label} 宽高比需要在 0.4-2.5 之间`;
      const pixels = video.width * video.height;
      if (pixels < 640 * 640 || pixels > 2206 * 946)
        return `${label} 像素总量不符合 Seedance 要求，请转成 480p/720p/1080p 后再上传`;
    }
  }
  if (totalDurationMs > limits.maxCombinedSeconds * 1000)
    return `Seedance 参考视频总时长不能超过 ${limits.maxCombinedSeconds} 秒`;
  return "";
}

export function seedanceAudioReferenceError(
  audios: ReferenceAudio[],
  limits: SeedanceReferenceLimits = SEEDANCE_REFERENCE_LIMITS,
) {
  let totalDurationMs = 0;
  for (let index = 0; index < audios.length; index += 1) {
    const audio = audios[index];
    if (!audio.durationMs) continue;
    const label = seedanceReferenceLabel("audio", index);
    if (
      audio.durationMs < limits.minAssetSeconds * 1000 ||
      audio.durationMs > limits.maxAssetSeconds * 1000
    )
      return `${label} 时长需要在 ${limits.minAssetSeconds}-${limits.maxAssetSeconds} 秒之间`;
    totalDurationMs += audio.durationMs;
  }
  if (totalDurationMs > limits.maxCombinedSeconds * 1000)
    return `Seedance 参考音频总时长不能超过 ${limits.maxCombinedSeconds} 秒`;
  return "";
}

export const seedanceVideoReferenceHint =
  "参考视频需为 mp4/mov，H.264/H.265，FPS 24-60；含真人人脸资产请使用火山授权 asset:// 资产。";
