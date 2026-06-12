# Topbar Status Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the topbar status pills easier to read and replace the settings gear with a visually centered, symmetric icon.

**Architecture:** This is a focused presentation-layer change. A source-level Vitest regression test locks the approved visual sizing and SVG path choices, then the existing `TopBar.tsx` and global CSS are updated with no runtime state changes.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, CSS.

---

## File structure

- Modify `/Users/e4/PycharmProjects/kws_online_service/web/src/components/TopBar.tsx`
  - Responsibility: Render the topbar status pills and settings button.
  - Change: Replace only the gear SVG paths.
- Modify `/Users/e4/PycharmProjects/kws_online_service/web/src/styles/global.css`
  - Responsibility: Global presentation styles for topbar controls.
  - Change: Increase approved status pill, dot, settings button, and SVG sizes.
- Create `/Users/e4/PycharmProjects/kws_online_service/web/src/components/TopBar.visual.test.tsx`
  - Responsibility: Lock the approved visual constants and gear path in a fast regression test.

## Task 1: Add failing visual regression test

**Files:**
- Create: `/Users/e4/PycharmProjects/kws_online_service/web/src/components/TopBar.visual.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `/Users/e4/PycharmProjects/kws_online_service/web/src/components/TopBar.visual.test.tsx` with:

```tsx
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
```

- [ ] **Step 2: Run the focused test to verify RED**

Run:

```bash
npm --prefix web test -- TopBar.visual.test.tsx
```

Expected: FAIL because `TopBar.tsx` still contains the old asymmetric gear path.

## Task 2: Implement approved topbar sizing and gear icon

**Files:**
- Modify: `/Users/e4/PycharmProjects/kws_online_service/web/src/styles/global.css`
- Modify: `/Users/e4/PycharmProjects/kws_online_service/web/src/components/TopBar.tsx`
- Test: `/Users/e4/PycharmProjects/kws_online_service/web/src/components/TopBar.visual.test.tsx`

- [ ] **Step 1: Update CSS sizing**

In `/Users/e4/PycharmProjects/kws_online_service/web/src/styles/global.css`, update these existing declarations:

```css
.status-pill {
  gap: 8px;
  min-height: 48px;
  padding: 9px 14px;
  border: 1px solid rgb(206 228 255 / 11%);
  border-radius: 12px;
  color: #c5d4e9;
  background: rgb(6 15 30 / 35%);
  font-size: 14px;
}

.status-pill small {
  display: block;
  max-width: 150px;
  margin-top: 2px;
  overflow: hidden;
  color: var(--text-muted);
  font: 600 10px/1.2 var(--font-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-dot {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--amber);
  box-shadow: 0 0 12px currentColor;
}

.icon-button {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 1px solid rgb(214 233 255 / 13%);
  border-radius: 12px;
  background: rgb(255 255 255 / 5%);
  cursor: pointer;
  transition: border-color 160ms ease, background 160ms ease, transform 160ms ease;
}

.icon-button svg {
  width: 21px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
}
```

- [ ] **Step 2: Replace the gear paths**

In `/Users/e4/PycharmProjects/kws_online_service/web/src/components/TopBar.tsx`, replace only the two `<path>` elements inside the settings button SVG with:

```tsx
<circle cx="12" cy="12" r="3.35" />
<path d="M12 3.5 14.64 5.63 18.01 5.99 18.37 9.36 20.5 12 18.37 14.64 18.01 18.01 14.64 18.37 12 20.5 9.36 18.37 5.99 18.01 5.63 14.64 3.5 12 5.63 9.36 5.99 5.99 9.36 5.63Z" />
```

- [ ] **Step 3: Run the focused test to verify GREEN**

Run:

```bash
npm --prefix web test -- TopBar.visual.test.tsx
```

Expected: PASS, with the two `TopBar approved visual sizing` tests passing.

## Task 3: Full verification and browser review

**Files:**
- Verify: `/Users/e4/PycharmProjects/kws_online_service/web/src/components/TopBar.tsx`
- Verify: `/Users/e4/PycharmProjects/kws_online_service/web/src/styles/global.css`
- Verify: `/Users/e4/PycharmProjects/kws_online_service/web/src/components/TopBar.visual.test.tsx`

- [ ] **Step 1: Run all web tests**

Run:

```bash
npm --prefix web test
```

Expected: PASS.

- [ ] **Step 2: Run production build**

Run:

```bash
npm --prefix web run build
```

Expected: PASS.

- [ ] **Step 3: Visually verify in browser**

Run or reuse a local web server, then open the app in the in-app Browser. Verify:

- The right-side `本地 / 私密` and model status pills are visibly larger.
- The model label still truncates in the status pill.
- The settings gear is visually centered and symmetric.
- Desktop topbar does not overflow at the normal browser width.
- At the `680px` breakpoint, `.private-pill` is hidden and the model pill remains constrained.

- [ ] **Step 4: Commit**

Run:

```bash
git add web/src/components/TopBar.visual.test.tsx web/src/components/TopBar.tsx web/src/styles/global.css docs/superpowers/plans/2026-06-12-topbar-status-visibility.md
git commit -m "ui: improve topbar status visibility"
```
