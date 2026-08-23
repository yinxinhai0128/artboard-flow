import { describe, expect, it } from "bun:test";
import {
  estimateGenerationCostCny,
  summarizeGenerationMetrics,
} from "./metrics-store.mjs";

describe("generation metrics", () => {
  it("estimates five-second Seedance cost from the model rate", () => {
    expect(
      estimateGenerationCostCny({ model: "doubao-seedance-2-5-260628", duration: 5 }),
    ).toBe(0.4);
  });

  it("returns 0 for unknown models or missing duration instead of guessing", () => {
    expect(estimateGenerationCostCny({ model: "unknown-model", duration: 8 })).toBe(0);
    expect(estimateGenerationCostCny({ model: "doubao-seedance-2-5-260628" })).toBe(0);
  });

  it("splits cost into succeeded vs unproduced (failed/cancelled) buckets", () => {
    const jobs = [
      { status: "succeeded", payload: { model: "doubao-seedance-2-5-260628", duration: 5 } },
      { status: "failed", payload: { model: "doubao-seedance-2-5-260628", duration: 10 } },
      { status: "cancelled", payload: { model: "doubao-seedance-2-5-260628", duration: 5 } },
      { status: "running", payload: { model: "doubao-seedance-2-5-260628", duration: 5 } },
      // 存量任务：无 estimatedCostCny 时按 payload 现算；未知模型不计成本但计秒数
      { status: "queued", payload: { model: "unknown-model", duration: 8 } },
    ];
    expect(summarizeGenerationMetrics(jobs)).toEqual({
      totalEstimatedCostCny: 2, // 0.4 + 0.8 + 0.4 + 0.4
      succeededEstimatedCostCny: 0.4,
      unproducedCostCny: 1.2, // failed 0.8 + cancelled 0.4
      totalVideoSeconds: 33,
      knownCostJobs: 4,
    });
  });

  it("prefers stored estimatedCostCny and tolerates malformed payloads", () => {
    expect(
      summarizeGenerationMetrics([
        { status: "succeeded", payload: { model: "x", duration: 5, estimatedCostCny: 1.234 } },
        { status: "failed", payload: null },
        { status: "failed" },
        { status: "failed", payload: { estimatedCostCny: "not-a-number" } },
      ]),
    ).toEqual({
      totalEstimatedCostCny: 1.234,
      succeededEstimatedCostCny: 1.234,
      unproducedCostCny: 0,
      totalVideoSeconds: 5,
      knownCostJobs: 1,
    });
  });
});
