# WF Cropper

A browser-based image cropping tool built around configurable templates. Drop a photo, pick a template, and it exports every configured output — different aspect ratios, dimensions, and formats — named consistently and bundled as a ZIP. All processing runs in the browser; nothing is uploaded to a server.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Built with React 19](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind-v4-38bdf8.svg)](https://tailwindcss.com)

Built for Webflow sites, where images aren't transformed at serve time — a single source photo often needs a 16:9 hero, a 4:3 card, a 1:1 square, and a 1200×630 OG image. The tool handles that in one pass. It works for any CMS with the same constraint.

Deploy to Vercel or Cloudflare Pages with one click — no CLI required. Docker is supported for self-hosting.

---

## Features

### Editor

- Crop with pan, zoom (1×–10×), straighten (±45°), and 90° rotation
- Horizon-draw tool — drag a line across a real-world horizontal; the image auto-levels to match
- Auto-suggest crop — saliency detection positions the crop around the subject; templates can specify hints (`face-center`, `face-top`, etc.) for portrait outputs
- Image adjustments: brightness, contrast, saturation, warmth, shadows, highlights, vibrance, sharpness
- Live RGB + luminance histogram sampled from the current crop area, not the full image
- One-click Auto Enhance, Auto Levels, and Auto Color
- Hold **Space** to compare against the unedited source
- Rule-of-thirds and detailed alignment grids
- Keyboard nudge and on-screen D-pad for fine crop positioning
- 20+ keyboard shortcuts with a `Shift + ?` cheatsheet

### Batch mode

Drop multiple images and step through them in a queue. Each image × output opens in the editor with an auto-suggested crop pre-applied. Adjustments are per-image and don't affect the rest of the queue. Export the whole set as one ZIP.

### Export

- WebP, JPEG, PNG, AVIF per output
- A single output can produce multiple formats in one pass via `additionalFormats` — useful for `<picture>` fallback stacks
- 3+ files bundle automatically as a ZIP; 1–2 files download individually
- Consistent filenames via a configurable pattern (`{basename}__{filenameKey}__{width}x{height}.{ext}`)

### Quality of life

- Undo / redo — 50-step ring buffer; per-image history in batch mode
- Edit history popover with labeled steps
- Per-output overrides — adjust width, format, or quality for one image without editing the template
- Live file-size estimate while adjusting quality
- Unsaved-changes protection in the admin UI
- Dark theme throughout

### Accessibility

Keyboard-navigable throughout. Focus-trapped dialogs, toast-based status messages, WCAG 2.2 AA targeted.

### Reliability

- `ErrorBoundary` around the editor — render errors show a recover-or-reload prompt, not a blank screen
- `zod`-validated config with three-tier fallback: Cloudflare KV → `public/config.json` → built-in defaults
- Pixel adjustments run in a Web Worker via `OffscreenCanvas` to keep the main thread responsive
- 108 unit and integration tests (vitest, jsdom, node-canvas)

---

## Privacy

All cropping, adjusting, and encoding happens via the browser's Canvas API. No files leave the browser. No accounts, no analytics, no cookies. Open DevTools → Network while using it — there are no uploads.

---

## Deploy

Pick the path that matches your setup. **Vercel and Cloudflare Pages require no CLI** — both are GitHub-connected, zero-terminal flows.

### 🚀 Vercel (~5 min)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FYOUR_ORG%2Fwf-cropper)

1. Click the button — Vercel forks the repo to your GitHub.
2. Click **Deploy**. No environment variables required.
3. Vercel gives you a `your-app.vercel.app` URL.
4. (Optional) add a custom domain in Vercel's dashboard.

The admin (`/admin`) and wizard (`/wizard`) pages save templates to `localStorage` in this mode. To set a permanent default, export the config as JSON and commit it to `public/config.json`.

### 🌩️ Cloudflare Pages (~10 min)

Recommended if you want templates saved server-side so they persist across browsers.

1. Fork this repo on GitHub.
2. Sign in to Cloudflare → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Select your fork. **Build command:** `npm run build`. **Output directory:** `dist`. Click **Save and Deploy**.
4. **(Optional) Enable server-persisted templates:**
   - **Settings → Functions → KV namespace bindings** → add a binding named `CONFIG_KV`. Create the namespace if needed.
   - **Settings → Environment variables** → add `ALLOW_CONFIG_WRITES=true`.

   Without these, `/admin` and `/wizard` fall back to Download JSON mode — no broken pages.

### 🐳 Docker (~10 min)

```bash
curl -O https://raw.githubusercontent.com/YOUR_ORG/wf-cropper/main/docker-compose.example.yml
mv docker-compose.example.yml docker-compose.yml
docker compose up -d
```

Serves on port **3000**. Reverse-proxy through Nginx, Caddy, or Apache for HTTPS.

Admin and wizard pages use Download JSON mode — no KV binding in this configuration.

---

## Get started locally

```bash
git clone https://github.com/YOUR_ORG/wf-cropper.git
cd wf-cropper
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Configuration

Templates live in `public/config.json`. Without a config file, the app falls back to four built-in templates: Blog Hero, Blog Card, Staff Headshot, Social Share.

Two ways to manage templates:

- **Setup Wizard** at `/wizard` — guided first-run flow with presets
- **Template Manager** at `/admin` — add, edit, and delete templates directly

Both work identically regardless of whether your host supports server-side persistence. With persistence (Cloudflare Pages + KV), Save writes directly. Without it, Download JSON gives you the file to commit or upload.

<details>
<summary>Config schema (click to expand)</summary>

```json
{
  "templates": [
    {
      "id": "blog-hero",
      "name": "Blog Hero",
      "description": "Wide banner for blog headers",
      "minInputWidth": 2000,
      "minInputShortSide": null,
      "outputs": [
        {
          "id": "blog-hero-main",
          "name": "Hero Image",
          "aspectRatio": [16, 9],
          "outputWidth": 2000,
          "outputHeight": null,
          "outputFormat": "webp",
          "quality": 80,
          "filenameKey": "blog-hero",
          "cropHint": "center",
          "additionalFormats": ["jpeg"]
        }
      ]
    }
  ],
  "filenamePattern": "{basename}__{filenameKey}__{width}x{height}.{ext}"
}
```

Validated with `zod` in strict mode — typos surface as errors rather than silently dropping fields. Filename tokens: `{basename}`, `{filenameKey}`, `{width}`, `{height}`, `{ext}`.

</details>

---

## Tech stack

| Layer | Choice |
|---|---|
| Build | Vite 7 |
| UI | React 19 + TypeScript |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Crop UI | react-easy-crop |
| Auto-suggest | smartcrop.js + native `FaceDetector` |
| ZIP export | jszip (lazy-loaded) |
| Config validation | zod |
| Tests | vitest — 108 tests against jsdom + node-canvas |

All image processing uses browser-native primitives (Canvas API, Web Worker, OffscreenCanvas). No Electron, no WASM, no server.

---

## Scripts

```bash
npm run dev            # Vite dev server at localhost:5173
npm run build          # tsc --build && vite build
npm run preview        # serve dist/ via wrangler pages dev
npm run deploy         # wrangler pages deploy dist
npm test               # vitest run
npm run lint           # eslint .
npm run format         # prettier --write .
```

---

## Contributing

Issues and pull requests welcome.

- Commit style: one concern per commit, present tense.
- No new dependencies without discussion — keeping the bundle lean is part of the "no server" contract.
- Tests come with the code: vitest against jsdom + node-canvas.

---

## License

[MIT](./LICENSE) — fork it, deploy it, adapt it. A link back is appreciated but not required.
