# Browser smoke tests

These scripts drive the real app in Chromium (Playwright) and take screenshots.

1. Start the app: `npm run dev`
2. In another terminal: `node e2e/smoke.mjs`, `node e2e/scenario.mjs` (a duel with a Trap response and attack animation) or `node e2e/gallery.mjs` (screenshots every card illustration)

Screenshots are written to `$SHOTS_DIR` (default `/tmp/ygo-shots`).
`scenario.mjs` uses `?seed=3380` and `placement.mjs` `?seed=38` so the opening hands are always the same.

## Online play

`online.mjs` opens two browsers (host and guest) and plays through a room over real WebRTC. It needs a local
signalling server instead of the public one:

```
node e2e/peerserver.mjs        # PeerJS server on 127.0.0.1:9000
npm run dev                    # in another terminal
node e2e/online.mjs            # in a third terminal
```

The app is pointed at the local server with `?peerhost=127.0.0.1&peerport=9000` (see `src/net/peer.ts`).
