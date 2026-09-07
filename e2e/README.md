# Browser smoke tests

These scripts drive the real app in Chromium (Playwright) and take screenshots.

1. Start the app: `npm run dev`
2. In another terminal: `node e2e/smoke.mjs`, `node e2e/scenario.mjs` (a duel with a Trap response and attack animation), `node e2e/placement.mjs` (Crystal Beast placement), `node e2e/extradeck.mjs` (an Xyz Summon and a Link Summon with the Traptrix deck), `node e2e/mobile.mjs` (phone layout, card previews in prompts, the end-of-Duel animations; it ends the Duel through the development-only `window.__ygoDebug.endDuel()` helper) `node e2e/solo.mjs` (a Duel against the computer opponent: it plays a whole turn, Undo returns to the human's last move) or `node e2e/gallery.mjs` (screenshots every card illustration)

Screenshots are written to `$SHOTS_DIR` (default `/tmp/ygo-shots`).
`scenario.mjs` uses `?seed=3380`, `placement.mjs` `?seed=38` and `extradeck.mjs` `?seed=55` so the opening hands are always the same.

## Online play

`online.mjs` opens two browsers (host and guest) and plays through a room over real WebRTC. It needs a local
signalling server instead of the public one:

```
node e2e/peerserver.mjs        # PeerJS server on 127.0.0.1:9000
npm run dev                    # in another terminal
node e2e/online.mjs            # in a third terminal
```

The app is pointed at the local server with `?peerhost=127.0.0.1&peerport=9000` (see `src/net/peer.ts`).
