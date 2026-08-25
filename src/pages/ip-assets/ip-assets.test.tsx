import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "antd";

import IpAssetsPage from "./index";

describe("IP资产库页面", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [],
      } as Response)
    );
  });

  it("渲染标题和新建按钮", async () => {
    render(
      <App>
        <IpAssetsPage />
      </App>
    );
    expect(await screen.findByText("IP资产库")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /新建IP资产/ })).toBeInTheDocument();
  }, 30000);
});
