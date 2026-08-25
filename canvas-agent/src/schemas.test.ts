import { describe, it, expect } from "bun:test";

import { toolInputSchemas, toolNames } from "./schemas.js";

describe("canvas-agent 工具清单", () => {
  it("工具名非空且唯一", () => {
    expect(toolNames.length).toBeGreaterThan(10);
    expect(new Set(toolNames).size).toBe(toolNames.length);
  });

  it("每个工具都有对应的输入 schema，且没有多余 schema", () => {
    for (const name of toolNames) {
      expect(toolInputSchemas[name]).toBeDefined();
    }
    expect(Object.keys(toolInputSchemas).sort()).toEqual(
      [...toolNames].sort(),
    );
  });

  it("site_navigate 必须提供 path", () => {
    const schema = toolInputSchemas.site_navigate;
    expect(() => schema.parse({})).toThrow();
    expect(schema.parse({ path: "/canvas" }).path).toBe("/canvas");
  });

  it("canvas_apply_ops 必须提供 ops 数组", () => {
    const schema = toolInputSchemas.canvas_apply_ops;
    expect(() => schema.parse({})).toThrow();
  });

  it("只读类工具接受空参数", () => {
    for (const name of [
      "canvas_get_state",
      "canvas_get_selection",
      "canvas_export_snapshot",
      "canvas_list_projects",
    ] as const) {
      expect(() => toolInputSchemas[name].parse({})).not.toThrow();
    }
  });
});
