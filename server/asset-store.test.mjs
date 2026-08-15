import { describe, expect, it } from "vitest";
import {
  assetExtensionFromMimeType,
  assetKindFromMimeType,
  assetRecordFromKey,
  createAssetKey,
  decodeDataUrlAsset,
  mimeTypeFromAssetKey,
} from "./asset-store.mjs";

describe("asset store helpers", () => {
  it("decodes base64 data urls into mime typed bytes", () => {
    const asset = decodeDataUrlAsset("data:image/png;base64,aGVsbG8=");

    expect(asset.mimeType).toBe("image/png");
    expect(new TextDecoder().decode(asset.data)).toBe("hello");
    expect(asset.bytes).toBe(5);
  });

  it("creates safe asset keys from mime types", () => {
    expect(assetExtensionFromMimeType("image/svg+xml")).toBe("svg");
    expect(assetExtensionFromMimeType("video/mp4")).toBe("mp4");
    expect(createAssetKey("abc-123", "image/webp")).toBe("abc-123.webp");
    expect(mimeTypeFromAssetKey("abc-123.webp")).toBe("image/webp");
  });

  it("builds reusable asset records from stored file keys", () => {
    expect(assetKindFromMimeType("image/svg+xml")).toBe("image");
    expect(assetKindFromMimeType("video/mp4")).toBe("video");
    expect(assetKindFromMimeType("audio/mpeg")).toBe("audio");
    expect(assetKindFromMimeType("text/plain")).toBe("text");
    expect(assetKindFromMimeType("application/octet-stream")).toBe("file");

    expect(
      assetRecordFromKey("abc-123.svg", { size: 123, mtimeMs: 1000 }),
    ).toEqual({
      storageKey: "abc-123.svg",
      url: "/api/assets/abc-123.svg",
      mimeType: "image/svg+xml",
      bytes: 123,
      extension: "svg",
      kind: "image",
      updatedAt: "1970-01-01T00:00:01.000Z",
    });
    expect(
      assetRecordFromKey("note.txt", { size: 12, mtimeMs: 2000 }),
    ).toMatchObject({
      storageKey: "note.txt",
      url: "/api/assets/note.txt",
      mimeType: "text/plain",
      extension: "txt",
      kind: "text",
    });
  });
});
