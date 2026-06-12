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
      "M12 15.25a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Z",
    );
    expect(topBarSource).toContain(
      "M19.43 12.98c.04-.32.07-.65.07-.98s-.02-.66-.07-.98l2.05-1.6-1.95-3.38-2.42.98a7.4 7.4 0 0 0-1.7-.98L15.05 3.5h-3.9l-.36 2.54a7.4 7.4 0 0 0-1.7.98l-2.42-.98-1.95 3.38 2.05 1.6c-.04.32-.07.65-.07.98s.02.66.07.98l-2.05 1.6 1.95 3.38 2.42-.98c.52.4 1.1.74 1.7.98l.36 2.54h3.9l.36-2.54c.6-.24 1.18-.57 1.7-.98l2.42.98 1.95-3.38-2.05-1.6Z",
    );
    expect(topBarSource).not.toContain("m19.2 13.7");
  });
});
