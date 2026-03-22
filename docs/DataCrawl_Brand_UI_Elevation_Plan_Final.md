# DataCrawl Brand UI Elevation Plan — Final

## Summary

- Introduce a new public landing page at `/` that becomes the first-touch experience for unauthenticated users.
- Move the authenticated workspace home to `/projects` and keep the rest of the app protected behind the existing Auth0 flow.
- Redesign the product around a single visual system: falling numeric data streams for "data" and animated spiders/web motifs for "crawl."
- Apply the theme across the full app, but keep the strongest motion and spectacle on the landing page; the authenticated workspace should feel premium, legible, and data-dense rather than chaotic.
- Layer in cursor-reactive behaviors, micro-interactions tied to user actions, and distinct motion signatures for real vs. synthetic data paths to make the product feel alive and intentional at every touchpoint.

## Key Changes

### Routing and app shell

- Make `/` a public landing page and scope `AuthGate` to protected routes only.
- Move the current dashboard home from `/` to `/projects`; keep existing project, run, dataset, and billing routes under the protected shell.
- Keep the sidebar/app shell for authenticated screens, but reskin it with the new DataCrawl identity instead of the current GitHub-like neutral theme.
- Create a reusable brand wordmark component for "DataCrawl" with both `a` letters replaced by spider glyphs; use it on the landing page hero and in the protected shell.

### Visual system and design language

- Replace the current blue-accent palette with a DataCrawl palette built around:
  - deep obsidian and graphite backgrounds, enhanced with subtle animated gradient meshes (very slow-moving dark green / graphite / deep teal blobs) on key surfaces like the sidebar and dashboard header to add organic depth without losing the dark aesthetic
  - phosphor/matrix greens for live data and numeric motion
  - muted web-gray neutrals for structure
  - a restrained secondary accent such as cool cyan or pale venom green for highlights
  - warm off-white only for key text and logo contrast
- Use a two-font system:
  - a sharper display sans for headlines/branding
  - a strong mono for numbers, dataset stats, badges, and ambient data rain
- Add new global design tokens for matrix greens, glow levels, glass overlays, web-line strokes, motion timing, spider-specific accents, gradient mesh parameters, and capture-animation durations.
- Keep the app dark-first; do not plan a separate light theme in this pass.

### Landing page design

- Build the landing page as a layered composition:
  - background canvas layer for falling green number rain with cursor-reactive behavior: number streams subtly repel or attract toward the user's cursor position, creating a "disturbing the data stream" effect calculated via lightweight proximity math on the canvas layer
  - midground SVG/DOM animation layer for spiders crawling, pausing, "capturing" number clusters, and occasional short jumps
  - foreground content layer with logo, headline, CTA, and supporting sections
  - mild parallax depth across all three layers: number rain, spider layer, and foreground text move at slightly different rates on scroll to reinforce physical depth without requiring WebGL
- Center the main spider-wordmark logo in the hero; the two spider `a` glyphs should feel like part of the wordmark, not added stickers.
- Hero behavior:
  - numbers stream vertically across the full viewport like cinematic hacker rain, reacting to cursor proximity
  - 2–3 spider actors move on authored paths instead of random motion
  - when a spider "finds" a cluster, nearby digits brighten, collect toward it, then fade into a stored/captured state
  - motion remains medium intensity and never overlaps core text enough to hurt readability
- Hero content structure:
  - primary headline focused on crawling the web into usable datasets
  - short subhead centered on financial data collection and synthetic generation
  - primary CTA to sign in / start crawling
  - secondary CTA to explore the workspace or learn how it works
- Supporting sections below the hero:
  - "How DataCrawl Works" presented as an interactive constellation map: data-source nodes (websites, APIs, feeds) connected by web threads that light up sequentially along a discover → collect → refine path; users can hover nodes to see example data types, turning a standard feature walkthrough into something explorable
  - "Two Ways to Build Data" as paired cards for real data and synthetic data, each using its distinct motion signature (see Synthetic-data theme treatment below)
  - "Inside the Workspace" as a stylized preview of projects, runs, and datasets
  - closing CTA section that echoes the number-rain/spider motif in a calmer form

### Landing page implementation decisions

- Use one canvas layer for the falling numbers and cursor-reactivity to keep performance predictable; proximity calculations should use spatial partitioning or throttled updates to avoid per-frame cost on large screens.
- Use SVG spiders and spider-path animations above the canvas; do not use WebGL or 3D libraries.
- Parallax scrolling should use CSS `transform: translate3d` for GPU compositing rather than scroll-driven layout recalculation.
- Use authored motion states rather than physics/random wandering, so the page feels intentional and repeatable.
- Use `prefers-reduced-motion` to disable number rain animation, cursor reactivity, spider jumps, capture pulses, and parallax while keeping the composition visually strong as a static layered illustration.

### Sound design layer

- Include an optional ambient sound layer, off by default, toggled via a small speaker icon fixed in the landing page corner.
- Sound palette: quiet digital keystrokes during number rain, soft chirps when spiders capture data clusters, a low ambient hum that fades in gradually.
- The toggle state should persist via a simple in-memory flag (no localStorage); the icon should be discoverable but visually unobtrusive.
- When `prefers-reduced-motion` is active, the sound toggle should still be available since audio is independent of visual motion preferences.

### Full app reskin

- Update the protected app shell to feel like a "crawl control room" rather than a generic dashboard:
  - sidebar gets subtle web texture / numeric grain, underlaid with a slow-moving gradient mesh (dark green / graphite / deep teal) for organic warmth
  - active navigation states use green-lit highlights and thin glow rails
  - cards and panels get layered dark surfaces with subtle digit/web patterning
- Web-thread navigation transitions: when navigating between major sections (projects → runs → datasets), animate a thin silk-thread line that traces the path from the active sidebar item to the content area, as if the spider is laying a trail; this replaces generic fade/slide transitions with an on-brand motion.
- Dashboard/projects:
  - project cards become more data-forward with bigger numeric stats and calmer green scan accents
  - empty states should use a restrained spider/data illustration instead of plain text blocks
  - top-level project/run counts should read like live capture metrics, using a typewriter/odometer count-up animation when they first enter the viewport so numbers feel alive and earned rather than static
  - spider "capture" micro-interaction on project creation: when a user creates a new project or starts a new crawl run, a small spider descends on a thread to briefly "wrap" the new card before it settles into the grid, reinforcing the brand metaphor at a moment of user action
- Runs/chat:
  - keep the current structure, but restyle the chat view with a more purposeful crawler-console look
  - live reasoning/progress panels should use mono data presentation and subtle thread/web dividers
  - agent progress can visually suggest crawl paths or capture trails without changing behavior
  - phosphor glow pulse on live data: active crawl runs display a slow breathing glow on the run card's border or status indicator, like a heartbeat monitor, making it immediately obvious which runs are active vs. completed
- Dataset viewer:
  - make the table feel like a captured artifact with stronger numeric hierarchy, stickier headers, and cleaner mono emphasis
  - data "crystallization" effect on dataset completion: when a dataset finishes building, scattered/flowing numeric elements briefly snap into a clean grid formation as a visual metaphor for raw data becoming structured; this is a CSS animation on the dataset card or table header
  - lineage panel should look like a trace map / capture record rather than plain JSON
- Billing/modals/forms:
  - reskin with the same token system and calmer web/data accents
  - forms stay highly readable and should not inherit heavy animated backgrounds

### Synthetic-data theme treatment

- Treat synthetic generation as a sibling visual path to real crawling, not a fallback aesthetic.
- Distinct motion signatures for each path:
  - real data uses organic, slightly irregular spider-crawl movement — paths that waver, pause, and explore
  - synthetic data uses precise, geometric, crystalline animations — perfectly spaced grid pulses, clean lattice formations, and mathematical regularity
  - both paths share the same brand palette; the distinction is in physics and rhythm, not color
- On the landing page and in app badges/cards, distinguish:
  - real data = crawl/web/discovery language
  - synthetic data = controlled numeric fabrication/simulation language
- Synthetic-themed surfaces should reuse the same brand palette, but emphasize generated patterns and numeric synthesis rather than spiders crawling over websites.

## Test Plan

- Routing:
  - unauthenticated visit to `/` shows the new landing page
  - protected routes still require auth
  - authenticated "home" goes to `/projects`
- Responsiveness:
  - hero remains readable on desktop, tablet, and mobile
  - spiders and number streams do not obscure CTA/content on small screens
  - cursor-reactive number rain degrades gracefully to standard rain on touch devices (no hover available)
  - constellation map in "How DataCrawl Works" collapses to a sequential vertical layout on narrow viewports
- Motion/accessibility:
  - `prefers-reduced-motion` disables high-motion effects cleanly (number rain, cursor reactivity, parallax, spider jumps, capture pulses, crystallization, glow breathing, web-thread transitions, typewriter counts)
  - sound toggle remains functional regardless of reduced-motion preference
  - text contrast remains AA-compliant on all major surfaces, including over gradient mesh backgrounds
  - keyboard/focus states remain obvious after the reskin
- Performance:
  - landing page animation remains smooth on common laptops; cursor-reactivity uses throttled proximity calculations
  - canvas/SVG layers do not noticeably degrade app navigation or initial load
  - gradient mesh animations use GPU-composited transforms and do not trigger layout reflows
  - parallax uses `transform: translate3d` for compositor-level rendering
  - web-thread navigation transitions complete within 300–400 ms to avoid feeling sluggish
- Micro-interactions:
  - spider capture animation on project creation plays once and settles cleanly without blocking user interaction
  - typewriter/odometer stat counts complete within 1–2 seconds and land on accurate final values
  - glow pulse on active runs is visually distinct from static completed states at a glance
  - crystallization effect on dataset completion is noticeable but does not delay access to the finished dataset
- App consistency:
  - dashboard, project, run, dataset, and billing screens all share the same token system and brand vocabulary
  - synthetic-vs-real styling remains visually distinct (motion signature difference) but clearly part of one product family
  - gradient mesh intensity is consistent across sidebar and dashboard header without creating visual hotspots

## Assumptions and defaults

- The landing page is public and the authenticated workspace home moves to `/projects`.
- The redesign covers the full app, not just the landing page.
- Motion stays medium by default, with reduced-motion fallbacks and lighter animation on mobile.
- Sound is off by default and opt-in only.
- Cursor-reactive effects are desktop-only; touch devices receive the standard non-reactive version.
- This plan is UI-only: no backend/API behavior changes are required.
- Implementation should use React + CSS + SVG/canvas only; no 3D/WebGL dependency should be introduced for this pass.
- Gradient meshes use CSS/SVG techniques (radial gradients, blur filters, composited layers), not shader-based rendering.
- Marketing copy can be implementation-authored within the structure above if no separate copy deck exists.
