# Nvidia Monitor: a focused edition of World Monitor

This repository is a fork of [koala73/worldmonitor](https://github.com/koala73/worldmonitor) (version 2.11.8, upstream commit `640b766437d687b99a117255ee0cb79d2903a48a`), licensed under AGPL-3.0-only like the original. All credit for the platform goes to the upstream authors.

## What this fork changes

The `tech` edition is repurposed into a single-topic dashboard: the Nvidia CEO scandal of November 2026, AI chips, AI infrastructure, and the policy around them. Nothing else in the platform is redesigned.

| Area | Change |
| --- | --- |
| `shared/news-catalog.json` | The tech edition now has six categories: `tech` (Nvidia CEO scandal), `policy` (chip export controls, bills in Congress, US and China), `hardware` (chips and supply chain), `cloud` (data centers, power, GPU clouds), `ai` (AI industry), `finance` (Nvidia and AI chip stocks). 19 new Google News query feeds were added. The startup, VC, podcast and developer feeds of the old tech edition were removed. |
| `src/config/panels.ts`, `src/config/variants/tech.ts` | The tech edition shows only the map, headlines, insights, the six news panels, tech stocks and monitors. Panels are renamed through `VARIANT_PANEL_OVERRIDES`. |
| `src/app/panel-layout.ts` | News panels honour a variant rename. |
| `src/config/variant.ts` | An unrecognised host serves the edition the build was made with, so a `*.vercel.app` deployment shows the tech edition. |
| `vercel.json` | The build command is `npm run build:tech`. |
| `api/fork-digest.js`, `api/_fork-feeds.js`, `scripts/fork-feeds.mjs` | A keyless news digest. It fetches the tech edition's RSS feeds on the edge and answers in the upstream `ListFeedDigestResponse` shape, so news panels work without the session secret, Redis or seed workers. Run `node scripts/fork-feeds.mjs` after changing tech feeds in the catalog. |
| `src/app/data-loader.ts` | The dashboard reads `/api/fork-digest` instead of `/api/news/v1/list-feed-digest`. |
| `src/styles/fork-theme.css` | Dark terminal theme for the tech edition: black field, amber function bars, numbered headline rows, Nvidia green, US blue, China red. Hides the edition switcher, sign-in, Pro banner and scoring badges that have no backend here. |
| `src/App.ts`, `src/app/event-handlers.ts` | The Pro banner and the mission preset prompt are not mounted in the tech edition. |
| Panels and layers | AI Insights and Tech Stocks are off by default (they need the upstream LLM and market backends). Map layers that need live APIs (outages, natural events, tech events) are off by default. |
| `vite.config.ts`, `src/utils/theme-manager.ts` | Fixes a syntax error in the pre-paint script of every non-full build, and makes the tech edition default to dark. |
| Globe | The tech edition opens on the 3D globe with the NASA texture, anisotropic filtering, a 2x pixel-ratio cap and no beta badge. `src/components/fork-map-pulse.ts` surfaces real headlines on the flat map and the globe as short-lived cards pinned to a place inferred from keywords in the headline; selecting one opens a dialog with the headline, related headlines and the article link. The undersea-cable layer is off. |
| `src/components/fork-ticker.ts`, `api/fork-quotes.js` | The footer is a running strip of the newest headlines and share prices (Yahoo Finance chart endpoint, keyless). It also carries the source link the AGPL asks for. |
| `src/components/fork-video-panel.ts` | Two fixed live channels (Yahoo Finance, CNA Asia) in the row under the main video panel. |
| Map layers | Layer controls are folded by default and list only layers backed by bundled data. |
| Generated files | Regenerated with `npm run generate`. 51 hosts that left the catalog were retired in `shared/source-attribution-manifest.json`. |

## Running it

```
npm ci
VITE_VARIANT=tech npm run dev
```

News panels work on a plain Vercel deployment through `api/fork-digest.js`. Markets and AI panels still need the backend described in `SELF_HOSTING.md` (Upstash Redis, API keys) and are off by default.

## Notes on the content

The scandal feeds are plain news searches. Many reports rely on anonymous sources and some allegations are unverified or denied. The dashboard aggregates headlines and does not endorse them.
