import { describe, it, expect } from "vitest";
import { normalizeStoryboard, normalizeShot } from "./storyboard-store.mjs";

describe("storyboard-store", () => {
  it("normalizes shot camera fallback", () => {
    expect(normalizeShot({ description: "远景", camera: "invalid" }).camera).toBe("static");
  });
  it("rejects empty storyboard title", () => {
    expect(() => normalizeStoryboard({ title: "" })).toThrow();
  });
});
