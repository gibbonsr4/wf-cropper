# Project: WF Cropper

## Commit Guidelines

- Do NOT include `Co-Authored-By` lines in commit messages
- Keep commits focused (one concern per commit)
- Ask before installing new tooling (especially heavy test / browser-
  automation frameworks)

## Tech Stack

- Vite 7 + React 19 + TypeScript
- Tailwind CSS v4 + shadcn/ui
- react-easy-crop (crop UI), smartcrop.js (saliency suggestions)
- zod (runtime config validation)
- jszip (multi-file ZIP export, lazy-loaded)
- OffscreenCanvas + Web Worker for pixel-adjustment preview pipeline
- Static site deployed to Cloudflare Pages (optional Pages Functions +
  KV for admin persistence)

## Scripts

```
npm run dev            # Vite dev server at localhost:5173
npm run build          # tsc --build && vite build
npm run preview        # serve dist/ via wrangler pages dev
npm run deploy         # wrangler pages deploy dist
npm test               # vitest run (unit + integration)
npm run test:watch     # vitest watch mode
npm run lint           # eslint .
npm run lint:fix       # eslint . --fix
npm run format         # prettier --write .
```

## Key Paths

**Config / types**
- `public/config.json` — runtime template config (falls back to defaults)
- `src/config/default-config.ts` — built-in default templates
- `src/config/schema.ts` — zod validation (strict mode)
- `src/config/loader.ts` / `api.ts` — three-tier load chain (API → static → defaults)
- `src/types/index.ts` — shared TypeScript types

**Image pipeline**
- `src/utils/canvas.ts` — export pipeline (crop, resize, encode)
- `src/utils/adjustments.ts` — pixel + auto adjustments, canvas-agnostic
- `src/utils/smartcrop.ts` — saliency + FaceDetector integration
- `src/utils/zip.ts` — jszip wrapper (lazy import)
- `src/utils/pixel-worker-client.ts` — main-thread worker client with
  latest-only cancellation
- `src/workers/pixel.worker.ts` — OffscreenCanvas pipeline

**Editor**
- `src/components/editor/CropEditor.tsx` — 3-panel editor shell + state
  (cropStates per output, baseRotations, overrides, adjustments, undo
  history)
- `src/components/editor/CropControls.tsx` — bottom toolbar
- `src/components/editor/AdjustmentSliders.tsx` — right panel sliders +
  auto buttons
- `src/components/editor/Histogram.tsx` — live RGB+luminance overlay
- `src/components/editor/OutputNavigator.tsx` — per-output list with
  inline OverridePanel as renderActiveAddon
- `src/components/editor/HorizonDrawOverlay.tsx` — keyboard + mouse
  horizon-draw tool
- `src/components/editor/ShortcutsOverlay.tsx` — cheatsheet (Shift + ?)
- `src/components/editor/HistoryPopover.tsx` — labeled step list with
  live-reposition anchor
- `src/components/editor/BatchExportView.tsx` — multi-file batch flow

**Hooks**
- `src/hooks/useImageLoader.ts` — single + batch loader w/ unmount cleanup
- `src/hooks/useUndoHistory.ts` — ring-buffer history (push / undo /
  redo / jumpTo / reset)
- `src/hooks/useHistogram.ts` — crop-aware histogram computation
- `src/hooks/useKeyboardShortcuts.ts` — global shortcut hook with
  input-focus guards

**Layout**
- `src/components/layout/NarrowViewportGate.tsx` — gates the app on
  viewports < 1024 px (modeled on Webflow Designer)
- `src/components/layout/Header.tsx` — static-page header

**Pages (lazy-loaded)**
- `src/pages/HomePage.tsx` — routes + export orchestration (eager)
- `src/pages/AdminPage.tsx` — template CRUD (lazy chunk)
- `src/pages/WizardPage.tsx` — guided setup (lazy chunk)

## Architecture Notes

- **Per-output state lives in `cropStates: Map<string, CropState>`**
  keyed by output ID. `baseRotations` tracks 90° rotations separately
  from `straighten` so the straighten slider can stay bounded to ±45°.
- **Adjustments are global per template** (applied to all outputs).
  Auto-adjust buttons analyze the currently-active output's crop, not
  the whole image.
- **Undo/Redo covers everything except template/image swap**. Snapshots
  are coalesced on a 400 ms debounce; `flushPendingSnapshot()` runs
  before undo/redo so a just-made edit is recoverable.
- **Pixel adjustments prefer the worker** when OffscreenCanvas is
  available; silently falls back to the main-thread path otherwise.
  The `adjustments.ts` functions are typed `HTMLCanvasElement |
  OffscreenCanvas` so the same code runs in both contexts.
- **Export pipeline**: render per crop × per format. ≥3 files auto-ZIP
  via lazy jszip import. 1-2 files download individually.
- **Batch export** runs Suggest Crop with pool-of-4 concurrency before
  the render loop, so decode + saliency don't serialize the entire
  batch.

