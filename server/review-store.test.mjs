import { describe, it, expect } from "vitest";
import { normalizeReview, aggregateDashboard } from "./review-store.mjs";

describe("review-store", () => {
  it("validates verdict", () => {
    expect(() => normalizeReview({ verdict: "bad" })).toThrow();
  });
  it("aggregates dashboard stats", () => {
    const stats = aggregateDashboard({
      jobs: [{ status: "succeeded" }, { status: "failed" }],
      reviews: [{ verdict: "approved" }, { verdict: "rejected", reason: "face_collapse" }],
    });
    expect(stats.successRate).toBe(0.5);
    expect(stats.approvedRate).toBe(0.5);
  });
});
