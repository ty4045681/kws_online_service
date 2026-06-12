import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import topBarSource from "./TopBar.tsx?raw";
import { TopBar } from "./TopBar";

describe("TopBar approved visual sizing", () => {
  test("renders the two status pills and settings button", () => {
    render(
      <TopBar
        modelLabel="sherpa-kws · v1"
        modelStatus="ready"
        promptSound={false}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("系统状态")).toBeInTheDocument();
    expect(screen.getByText("本地 / 私密")).toBeInTheDocument();
    expect(screen.getByText("模型可用")).toBeInTheDocument();
    expect(screen.getByText("sherpa-kws · v1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开专业设置" })).toBeInTheDocument();
  });

  test("uses the centered settings gear path", () => {
    expect(topBarSource).toContain(
      '<circle cx="12" cy="12" r="3.35" />',
    );
    expect(topBarSource).toContain(
      "M12 3.5 14.64 5.63 18.01 5.99 18.37 9.36 20.5 12 18.37 14.64 18.01 18.01 14.64 18.37 12 20.5 9.36 18.37 5.99 18.01 5.63 14.64 3.5 12 5.63 9.36 5.99 5.99 9.36 5.63Z",
    );
    expect(topBarSource).not.toContain("M19.43 12.98");
  });
});
