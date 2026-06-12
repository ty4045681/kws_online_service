# Topbar status visibility and settings icon design

## Context

The KWS web UI topbar contains two status pills in the upper-right area:

- `本地 / 私密`
- the model status pill, such as `模型可用` plus a compact model label

The current typography is too small to read comfortably. The adjacent settings icon also looks visually off-center/asymmetric because of the current custom gear path.

Relevant files:

- `/Users/e4/PycharmProjects/kws_online_service/web/src/components/TopBar.tsx`
- `/Users/e4/PycharmProjects/kws_online_service/web/src/styles/global.css`

## Approved direction

Use the visually reviewed **C · more prominent** option.

This intentionally makes the status area more visible, even if it gives the upper-right controls slightly more visual weight. The existing topbar style, glass-panel treatment, colors, and interaction model should remain unchanged.

## UI changes

### Status pills

Update the shared `.status-pill` styling:

- Increase main status text from `11px` to `14px`.
- Increase minimum height from `40px` to `48px`.
- Increase padding from `7px 12px` to `9px 14px`.
- Keep the horizontal flex layout and existing color/border/background style.
- Increase the status dot from `7px` to `8px` so it stays proportional.

Update `.status-pill small`:

- Increase the model label text from `8px` to `10px`.
- Keep the ellipsis behavior and max-width constraint so long model labels still truncate.

### Settings button and icon

Update the shared `.icon-button` sizing used by the topbar settings button:

- Increase button size from `40px` to `44px`.
- Increase nested SVG size from `19px` to `21px`.
- Preserve the current border radius, hover behavior, stroke style, and glass background.

Replace the gear SVG paths in `TopBar.tsx`:

- Use a more geometrically balanced gear outline centered in a `24x24` viewBox.
- Keep it as a stroked line icon with no fill, matching the current CSS-driven icon style.
- Preserve the button label, title, and click behavior.

## Responsive behavior

Keep the current responsive rules:

- Under `680px`, `.private-pill` remains hidden.
- `.model-pill` remains constrained with `max-width: 150px`.
- No new responsive layout should be introduced unless verification shows overflow.

## Testing and verification

Run:

- `npm --prefix web run build`
- `npm --prefix web test`

Visually verify the topbar in the browser:

- The two status pills are easier to read.
- The model label still truncates cleanly if long.
- The settings gear appears centered and symmetric.
- The topbar does not overflow at normal desktop width.
- The existing mobile breakpoint behavior remains intact.

## Out of scope

- Reworking the full topbar layout.
- Changing brand typography or left-side branding.
- Changing status wording or runtime state logic.
- Adding new components or dependencies.
