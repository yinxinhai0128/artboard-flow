import { describe, it, expect } from "bun:test";

import {
  AGENT_PROMPT,
  CONFIG_DIR,
  CONFIG_FILE,
  DEFAULT_PORT,
  VERSION,
} from "./config.js";
import os from "node:os";
import path from "node:path";

describe("canvas-agent 配置", () => {
  it("版本号符合 semver", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("默认端口与配置路径", () => {
    expect(typeof DEFAULT_PORT).toBe("number");
    expect(DEFAULT_PORT).toBeGreaterThan(0);
    expect(CONFIG_DIR).toBe(path.join(os.homedir(), ".artboard-flow"));
    expect(CONFIG_FILE.endsWith("canvas-agent.json")).toBe(true);
  });

  it("Agent 提示词包含核心工具引导", () => {
    for (const keyword of [
      "site_navigate",
      "canvas_get_state",
      "canvas_apply_ops",
      "canvas_generate_image",
      "prompts_search",
    ]) {
      expect(AGENT_PROMPT.includes(keyword)).toBe(true);
    }
  });

  it("Agent 提示词面向 ArtboardFlow", () => {
    expect(AGENT_PROMPT.includes("ArtboardFlow")).toBe(true);
  });
});
