import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

describe("StoryboardShotTable", () => {
  it("渲染表头和镜头行", async () => {
    const { default: StoryboardShotTable } = await import("./storyboard-shot-table");
    const shots = [
      {
        id: "shot-1",
        storyboardId: "board-1",
        orderIndex: 0,
        durationSec: 5,
        description: "远景废墟全景",
        camera: "push" as const,
        ipAssetId: null,
        promptOverride: null,
        status: "pending",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "shot-2",
        storyboardId: "board-1",
        orderIndex: 1,
        durationSec: 3,
        description: "角色特写",
        camera: "static" as const,
        ipAssetId: null,
        promptOverride: null,
        status: "pending",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    const ipAssets = [
      { id: "ip-1", name: "骑士", type: "character" as const, referenceKeys: [], styleKeywords: "", description: "", createdAt: "", updatedAt: "" },
    ];
    render(
      <StoryboardShotTable
        shots={shots}
        ipAssets={ipAssets}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onReorder={vi.fn()}
      />
    );
    expect(screen.getByText("序号")).toBeInTheDocument();
    expect(screen.getByText("画面描述")).toBeInTheDocument();
    expect(screen.getByText("运镜")).toBeInTheDocument();
    expect(screen.getByText("时长")).toBeInTheDocument();
    expect(screen.getByText("绑定IP")).toBeInTheDocument();
    expect(screen.getByText("状态")).toBeInTheDocument();
    expect(screen.getByText("操作")).toBeInTheDocument();
    expect(screen.getByText("远景废墟全景")).toBeInTheDocument();
    expect(screen.getByText("角色特写")).toBeInTheDocument();
  });

  it("空镜头时显示空状态", async () => {
    const { default: StoryboardShotTable } = await import("./storyboard-shot-table");
    render(
      <StoryboardShotTable shots={[]} ipAssets={[]} onUpdate={vi.fn()} onDelete={vi.fn()} onReorder={vi.fn()} />
    );
    expect(screen.getByText("序号")).toBeInTheDocument();
  });
});
