import { describe, it, expect } from "bun:test";

import {
  compactCanvasState,
  compactNode,
  isToolName,
  nextCanvasX,
  parseToolInput,
} from "./tools.js";
import type { CanvasNode, CanvasSnapshot } from "./types.js";

function makeNode(overrides: Partial<CanvasNode> = {}): CanvasNode {
  return {
    id: "n1",
    type: "text",
    title: "节点",
    position: { x: 0, y: 0 },
    width: 200,
    height: 120,
    metadata: {},
    ...overrides,
  } as CanvasNode;
}

describe("canvas-agent 工具辅助函数", () => {
  it("isToolName 区分合法与非法工具名", () => {
    expect(isToolName("canvas_get_state")).toBe(true);
    expect(isToolName("canvas_apply_ops")).toBe(true);
    expect(isToolName("not_a_tool")).toBe(false);
    expect(isToolName(123)).toBe(false);
    expect(isToolName(undefined)).toBe(false);
  });

  it("parseToolInput 校验输入并填充默认值", () => {
    const parsed = parseToolInput("canvas_create_text_node", {
      text: "你好",
    });
    expect(parsed.text).toBe("你好");
    expect(() =>
      parseToolInput("canvas_create_text_node", undefined),
    ).not.toThrow();
  });

  it("compactNode 截断超长文本并保留结构字段", () => {
    const long = "a".repeat(300);
    const node = compactNode(
      makeNode({ metadata: { content: long } }),
    );
    expect(node.id).toBe("n1");
    expect(node.type).toBe("text");
    expect(node.title).toBe("节点");
    expect((node.metadata.content as string).length).toBe(123);
    expect((node.metadata.content as string).endsWith("...")).toBe(true);

    const short = compactNode(makeNode({ metadata: { content: "短文本" } }));
    expect(short.metadata.content).toBe("短文本");
  });

  it("compactCanvasState 无画布时抛错，有画布时压缩全部节点", () => {
    expect(() => compactCanvasState(null)).toThrow("当前没有已连接画布");

    const state = {
      projectId: "p1",
      nodes: [makeNode(), makeNode({ id: "n2" })],
    } as unknown as CanvasSnapshot;
    const compacted = compactCanvasState(state);
    expect(compacted.projectId).toBe("p1");
    expect(compacted.nodes.length).toBe(2);
  });

  it("nextCanvasX 计算下一列摆放位置", () => {
    expect(nextCanvasX(null)).toBe(0);
    expect(
      nextCanvasX({ nodes: [] } as unknown as CanvasSnapshot),
    ).toBe(0);
    const state = {
      nodes: [
        makeNode({ position: { x: 0, y: 0 }, width: 200 }),
        makeNode({ id: "n2", position: { x: 500, y: 0 }, width: 300 }),
      ],
    } as unknown as CanvasSnapshot;
    expect(nextCanvasX(state)).toBe(880);
  });
});
