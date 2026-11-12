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
| Generated files | Regenerated with `npm run generate`. 51 hosts that left the catalog were retired in `shared/source-attribution-manifest.json`. |

## Running it

```
npm ci
VITE_VARIANT=tech npm run dev
```

News, markets and AI panels need the backend described in `SELF_HOSTING.md` (Vercel functions, Upstash Redis, API keys). Without those keys the dashboard renders but the data panels stay empty.

## Notes on the content

The scandal feeds are plain news searches. Many reports rely on anonymous sources and some allegations are unverified or denied. The dashboard aggregates headlines and does not endorse them.
