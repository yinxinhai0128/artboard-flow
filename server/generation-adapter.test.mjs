import { describe, expect, it } from "vitest";
import {
  normalizeGenerationJobPayload,
  normalizeGenerationJobResult,
  normalizeGenerationJobStatus,
  parseGenerationJob,
} from "./generation-adapter.mjs";

describe("generation adapter normalization", () => {
  it("normalizes payloads for adapter job submission", () => {
    const payload = normalizeGenerationJobPayload({
      mode: "video",
      model: " seedance ",
      size: "1280x720",
      count: 99,
      prompt: "make it cinematic",
      inputs: [
        { nodeId: "text-1", type: "text", title: "Prompt", text: "story" },
        {
          nodeId: "image-1",
          type: "image",
          title: "Reference",
          media: {
            url: "data:image/png;base64,abc",
            mimeType: "image/png",
            width: 12,
            height: 8,
          },
        },
        {
          nodeId: "audio-1",
          type: "audio",
          title: "Voice",
          media: { url: "data:audio/mpeg;base64,abc", mimeType: "audio/mpeg" },
        },
      ],
    });

    expect(payload).toMatchObject({
      mode: "video",
      model: "seedance",
      size: "1280x720",
      count: 15,
      prompt: "make it cinematic",
      summary: { text: 1, image: 1, video: 0, audio: 1 },
    });
    expect(payload.inputs).toHaveLength(3);
  });

  it("preserves image edit payload masks when normalizing generation submissions", () => {
    expect(
      normalizeGenerationJobPayload({
        mode: "image",
        generationType: "edit",
        model: "image-model",
        size: "1536x1024",
        count: 1,
        prompt: "只修改蒙版透明区域，其他区域保持不变。replace the jacket",
        summary: { text: 0, image: 1, video: 0, audio: 0 },
        inputs: [
          {
            nodeId: "source",
            type: "image",
            title: "Source",
            media: {
              url: "/api/assets/source.png",
              mimeType: "image/png",
              bytes: 100,
              width: 1200,
              height: 900,
            },
          },
        ],
        editMask: {
          url: "/api/assets/mask.png",
          storageKey: "mask.png",
          mimeType: "image/png",
          bytes: 20,
          width: 1200,
          height: 900,
        },
        createdAt: "2026-07-26T02:00:00.000Z",
      }),
    ).toMatchObject({
      mode: "image",
      generationType: "edit",
      editMask: {
        url: "/api/assets/mask.png",
        storageKey: "mask.png",
        mimeType: "image/png",
        bytes: 20,
        width: 1200,
        height: 900,
      },
    });
  });

  it("preserves video options when normalizing generation submissions", () => {
    expect(
      normalizeGenerationJobPayload({
        mode: "video",
        model: "video-model",
        size: "16:9",
        count: 1,
        prompt: "make this image move",
        video: {
          seconds: "8",
          resolution: "1080p",
          generateAudio: true,
          watermark: false,
        },
        inputs: [
          {
            nodeId: "source",
            type: "image",
            title: "Source",
            media: { url: "/api/assets/source.png", mimeType: "image/png" },
          },
        ],
        createdAt: "2026-07-26T06:10:00.000Z",
      }),
    ).toMatchObject({
      mode: "video",
      video: {
        seconds: "8",
        resolution: "1080p",
        generateAudio: true,
        watermark: false,
      },
    });
  });

  it("normalizes job statuses and external results", () => {
    expect(normalizeGenerationJobStatus("running")).toBe("running");
    expect(normalizeGenerationJobStatus("cancelled")).toBe("cancelled");
    expect(normalizeGenerationJobStatus("unknown")).toBe("queued");
    expect(
      normalizeGenerationJobResult({
        url: "https://cdn/result.png",
        mimeType: "image/png",
        width: 640,
        height: 480,
      }),
    ).toEqual({
      content: "https://cdn/result.png",
      mimeType: "image/png",
      bytes: undefined,
      naturalWidth: 640,
      naturalHeight: 480,
      outputs: [
        {
          content: "https://cdn/result.png",
          mimeType: "image/png",
          bytes: undefined,
          naturalWidth: 640,
          naturalHeight: 480,
        },
      ],
    });
    expect(
      normalizeGenerationJobResult({
        outputs: [
          {
            url: "https://cdn/one.png",
            mimeType: "image/png",
            width: 512,
            height: 512,
          },
          {
            content: "https://cdn/two.png",
            mimeType: "image/png",
            width: 768,
            height: 512,
          },
        ],
      }),
    ).toEqual({
      content: "https://cdn/one.png",
      mimeType: "image/png",
      bytes: undefined,
      naturalWidth: 512,
      naturalHeight: 512,
      outputs: [
        {
          content: "https://cdn/one.png",
          mimeType: "image/png",
          bytes: undefined,
          naturalWidth: 512,
          naturalHeight: 512,
        },
        {
          content: "https://cdn/two.png",
          mimeType: "image/png",
          bytes: undefined,
          naturalWidth: 768,
          naturalHeight: 512,
        },
      ],
    });
  });

  it("parses persisted rows into API jobs", () => {
    const job = parseGenerationJob({
      id: "job-1",
      project_id: "project-1",
      node_id: "node-1",
      status: "queued",
      created_at: "2026-07-19T00:00:00.000Z",
      updated_at: "2026-07-19T00:00:00.000Z",
      payload_json: '{"prompt":"hello"}',
      result_json: null,
      error: null,
    });

    expect(job).toMatchObject({
      id: "job-1",
      projectId: "project-1",
      nodeId: "node-1",
      status: "queued",
      payload: { prompt: "hello" },
      result: null,
    });
  });
});
