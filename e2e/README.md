# Browser smoke tests

These scripts drive the real app in Chromium (Playwright) and take screenshots.

1. Start the app: `npm run dev`
2. In another terminal: `node e2e/smoke.mjs` or `node e2e/scenario.mjs`

Screenshots are written to `$SHOTS_DIR` (default `/tmp/ygo-shots`).
`scenario.mjs` uses `?seed=173` so the opening hands are always the same.
