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
