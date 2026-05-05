# WF Cropper

**The image-cropping tool Webflow doesn't ship.** Upload one photo, pick a template, get every variant your site needs — blog hero, card thumbnail, square headshot, OG image — as a single download in seconds. Built for Webflow, works for any CMS. Runs entirely in your browser. No accounts. No uploads. No cost.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Built with React 19](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind-v4-38bdf8.svg)](https://tailwindcss.com)

[[SCREENSHOT: hero shot of the crop editor with a multi-output template active, sidebar showing image queue, right panel adjustments visible. Wide aspect, ~1440×900. Sunset/landscape photo works well as a subject since it shows off the crop + adjustment tooling.]]

---

## Why I built this

**Webflow is great at a lot of things. Cropping images isn't one of them.** You upload a photo at whatever size it happened to be, and that's what Webflow serves — if you want a 16:9 blog hero and a 4:3 card thumbnail and a 1200×630 OG image from the same source, that's on you.

Publishing a single blog post typically needs five crops of one photo: hero, card, OG, maybe a square for sidebars, maybe a portrait for mobile. A team page wants both square and landscape headshots of every person. Product pages want hero + card + thumbnail for every item.

The expected workflow today is: open Photoshop (or Figma, or Affinity), set the crop, export, rename, repeat. Ten minutes per image. Multiply by a team page of 40 people or a 200-item product catalog and you've lost an afternoon — and paid for a Creative Cloud license to do it.

WF Cropper collapses that into one pass. Define your templates once, then every image goes through the same pipeline: **upload → smart crop → adjust → export every variant**. A team page of 40 headshots takes five minutes, not five hours. No Photoshop required.

The tool was built specifically for Webflow sites, but the problem isn't Webflow-specific — **any CMS that doesn't transform images at serve time has this gap**. WordPress with stock themes, Shopify, static Markdown blogs, Jekyll, Astro, your hand-rolled Next.js site. If you're shipping images at multiple sizes from a single source, this is for you.

---

## What it does

### The core loop

**One image in, every variant out.** Define a template (aspect ratios, output dimensions, formats, quality) once. Every photo you drop gets cropped to every output in that template, named consistently, and packaged as a single ZIP.

[[SCREENSHOT: the template-pick screen — PreCropShell with an uploaded image on the left and the four default template cards in the center (Blog Hero, Blog Card, Staff Headshot, Social Share Image, Custom). Hero for "pick a template".]]

### Batch mode

Drop 30 photos for a team page and step through them. Each image × each output shows in the editor with an auto-suggested crop already applied — accept it, nudge it, or reposition freely. Per-image adjustments (brightness, warmth, etc.) stay isolated so tuning one portrait doesn't affect the others. Export the whole set as one ZIP at the end.

[[SCREENSHOT: the multi-image crop editor with 4+ images queued in the left sidebar, a checkmark or two on completed images, the current image actively cropped with the crop rectangle visible, and the histogram + adjustment sliders populated on the right. Shows the "queue in action" story.]]

### Smart crop

Don't know where to crop? The tool uses saliency detection (with `FaceDetector` upgrade when the browser supports it) to auto-position the crop around the subject. Templates can specify hints like `face-center` or `face-top` for portraits so your headshots come out centered on the face, not the collarbone.

### Pro-grade adjustments

Brightness, contrast, saturation, warmth, shadows, highlights, vibrance, and sharpness — with a live RGB + luminance histogram that samples the current crop (not the whole image) so you're tuning what you'll actually ship. One-click Auto Enhance / Auto Levels / Auto Color buttons for when you just need a quick lift.

[[SCREENSHOT: close-up of the adjustments panel on the right side of the editor — histogram at the top, Auto Enhance / Auto Levels / Auto Color buttons, then the slider sections (Light / Color / Detail). Shows the depth of the editing tooling.]]

### Multi-format export

A single output can ship as WebP + JPEG + AVIF in one pass (set `additionalFormats` per template output). Perfect for `<picture>` element fallbacks or modern-format delivery with legacy safety nets.

### Browser-only, zero trust required

Every pixel stays in your browser. Files don't touch a server. No accounts, no analytics, no trackers. Works offline after first load. Self-host it on any static CDN and the privacy story is airtight.

---

## Who it's for

- **Webflow designers and developers** — the primary audience. Webflow's no-transform image pipeline means this gap hits every publish cycle; WF Cropper slots right into your normal image-prep workflow.
- **Content and marketing teams** running blog libraries, team pages, and social assets on any CMS
- **Web agencies** standardizing asset prep across client projects (Webflow, WordPress, Shopify, Framer, custom)
- **Solo creators and freelancers** who don't want to pay for Adobe just to crop photos consistently
- **E-commerce operators** shipping product images in multiple layouts

"WF" stands for Webflow in the name, but templates aren't Webflow-specific — anything that needs images at specific sizes benefits from the same pipeline. The tool doesn't care what your backend looks like.

---

## How it works

**1. Define your templates** — once, either through the setup wizard or by editing a JSON config. Name, aspect ratio, output width, format, quality, and optional crop hints.

[[SCREENSHOT: the Template Manager (`/admin`) showing the default templates list with Edit/Delete buttons visible, the aspect glyphs, and format badges (WEBP/JPEG/PNG). Shows the "no-code configuration" story.]]

**2. Upload your image(s)** — drop a single photo for the full editor, or drop a batch for the queue. Auto-suggest fires per image × output so you start from a reasonable crop instead of a blank one.

**3. Review, adjust, export** — step through every image × output, nudge crops that need it, apply adjustments per image, then hit Export. Multi-output exports bundle automatically as a ZIP.

---

## Privacy, in plain terms

- **Nothing leaves your browser.** All cropping, adjusting, and encoding happens client-side via the Canvas API.
- **No accounts.** No sign-up, no login, no password reset flows.
- **No tracking.** No analytics, no cookies, no fingerprinting.
- **Works offline.** Load it once, then pull the plug — it keeps working.
- **Self-hostable.** Your own domain, your own CDN, your rules.

This isn't marketing fluff. Open DevTools → Network while you use it. You won't see an upload.

---

## Get started

### Try it locally in 60 seconds

```bash
git clone https://github.com/YOUR_ORG/wf-cropper.git
cd wf-cropper
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Drop an image, pick a template, start cropping.

### Deploy your own

It's a pure static site — any CDN works. Pick your path:

**Netlify (one-click fork + deploy):**

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/YOUR_ORG/wf-cropper)

**Vercel (one-click fork + deploy):**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FYOUR_ORG%2Fwf-cropper)

**Cloudflare Pages** (recommended for the optional admin-persistence feature):

```bash
npm run build
npx wrangler pages deploy dist
```

Or connect your fork in the Cloudflare dashboard — build command `npm run build`, output directory `dist`. To enable browser-persisted template edits, bind a KV namespace named `CONFIG_KV` under Settings → Functions → KV bindings.

**Any other static host** (GitHub Pages, S3+CloudFront, nginx, Caddy, etc.):

```bash
npm run build
# Upload the contents of dist/ to your host.
```

On hosts without the Cloudflare Pages Function, the `/admin` and `/wizard` surfaces automatically drop to **Download JSON** mode — configure templates in the browser, save the file, upload it to `/config.json` on your site. No code changes needed.

---

## Configuration

Templates live in `public/config.json`. With no config file, the app falls back to four sensible built-in templates (Blog Hero, Blog Card, Staff Headshot, Social Share).

Two ways to manage templates:

1. **Setup Wizard** at `/wizard` — guided first-run flow with presets
2. **Template Manager** at `/admin` — direct add / edit / delete of templates

Both UIs work identically whether or not your host supports server-side persistence. With persistence (Cloudflare Pages + KV), Save writes directly. Without it, Download JSON gives you the file to upload.

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

Validated with `zod` in strict mode — typos surface as errors instead of silently dropping fields. Filename tokens: `{basename}`, `{filenameKey}`, `{width}`, `{height}`, `{ext}`.

</details>

---

## What's in the box

### Editing
- Zoom (log-scale slider, 1×–10×), straighten (±45°), 90° rotation
- Horizon-draw tool — drag a line along a real-world horizontal and the image auto-levels
- Keyboard shortcuts (20+ bindings) with a `Shift + ?` cheatsheet
- Nudge arrows for fine positioning (keyboard and on-screen D-pad)
- Hold **Space** to compare against the original
- Rule-of-thirds + detailed alignment grids

### Quality of life
- **Undo / redo** — 50-step ring buffer, per-image history in batch mode
- **Edit history popover** with labeled steps (e.g., "Auto Enhance", "Rotate +90°", "Straighten +2.3°")
- **Per-output overrides** — tweak width / format / quality for one image without editing the template
- **Live file-size estimate** as you adjust quality
- **Unsaved-changes protection** in the admin UI
- **Dark theme** throughout, modeled on Webflow Designer

### Accessibility
WCAG 2.2 AA targeted. Full keyboard navigation, focus-trapped dialogs, toast-based status messaging, visible-when-focused nudge controls as a single-pointer alternative to dragging.

### Reliability
- `ErrorBoundary` around the editor — render errors show a recover-or-reload card, not a white screen
- `zod`-validated config with fallthrough sourcing (API → static → defaults)
- `Web Worker` + `OffscreenCanvas` for pixel adjustments (keeps the main thread responsive during slider drags)
- 108 unit + integration tests (vitest against jsdom + node-canvas)

---

## Tech stack

- **Vite 7** — build
- **React 19** + **TypeScript** — UI
- **Tailwind CSS v4** + **shadcn/ui** — styling
- **react-easy-crop** — crop UI (pan / zoom / rotate)
- **smartcrop.js** + native `FaceDetector` — saliency-based crop suggestions
- **jszip** — lazy-loaded for multi-file ZIP export
- **zod** — runtime config validation
- **vitest** — 108 unit + integration tests against jsdom + node-canvas

All processing (Canvas API, Web Worker, OffscreenCanvas) uses browser-native primitives — no Electron, no WASM, no hidden server.

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

Issues and pull requests welcome. A few things worth knowing:

- The `docs/audit/` directory holds a UX/UI/accessibility audit (Claude + Codex independent passes, reconciled). Check there before proposing UX changes — the decisions behind the current design are documented.
- Commit style: focused, one concern per commit, present tense.
- No new dependencies without discussion — the "zero backend, browser-only" story depends on staying lean.
- Tests come with the code: `vitest` against `jsdom` + `node-canvas`.

---

## License

[MIT](./LICENSE) — fork it, deploy it, sell it with your own branding. A link back is appreciated but not required.
