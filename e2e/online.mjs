// Online play end-to-end: two browsers, a local PeerServer for signalling, real WebRTC in between.
// Run: node e2e/peerserver.mjs &  npx vite --port 5173 --strictPort &  node e2e/online.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const dir = process.env.SHOTS_DIR ?? '/tmp/ygo-shots';
mkdirSync(dir, { recursive: true });
const PEER = 'peerhost=127.0.0.1&peerport=9000';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const errors = [];
const mk = async (name) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name} PAGEERROR ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name} console: ${m.text()}`); });
  return page;
};
const host = await mk('host');
const guest = await mk('guest');
const fail = async (e) => {
  console.log('FAILED:', e.message);
  await host.screenshot({ path: `${dir}/online-fail-host.png` }).catch(() => {});
  await guest.screenshot({ path: `${dir}/online-fail-guest.png` }).catch(() => {});
  for (const [n, p] of [['host', host], ['guest', guest]]) console.log(n, 'online:', await p.evaluate(() => JSON.stringify(window.__ygoStore?.().online, (k, v) => (k === 'remote' ? (v ? 'view:' + Object.keys(v) : v) : v))).catch(() => '?'));
  console.log('errors:', errors);
  await browser.close();
  process.exit(1);
};
process.on('unhandledRejection', fail);
process.on('uncaughtException', fail);
const helpers = (page) => ({
  clickAction: async (text) => {
    await page.waitForTimeout(250);
    if (!(await page.$('.teach-panel'))) await page.locator('button.btn-teach').click();
    await page.waitForSelector('.teach-panel');
    await page.locator('.teach-list .btn-primary', { hasText: text }).first().click();
    await page.waitForTimeout(200);
  },
  pickZone: async (n) => { await page.waitForSelector('.zone-selectable'); await page.click(`.zone-selectable >> nth=${n}`); await page.waitForSelector('.zone-selectable', { state: 'detached' }); },
  settle: async () => {
    for (let i = 0; i < 8; i++) {
      await page.waitForTimeout(300);
      if (await page.$('.prompt-response')) { await page.click('text=Decline (do not respond)'); continue; }
      const dont = await page.$('.btn-option:has-text("Do not activate")');
      if (dont) { await dont.click(); continue; }
      break;
    }
  },
});
const H = helpers(host);
const G = helpers(guest);

// --- Host opens a room
await host.goto(`http://localhost:5173/?${PEER}`);
await host.click('text=Host a duel');
await host.waitForSelector('.room-code', { timeout: 20000 });
const code = (await host.textContent('.room-code')).trim();
console.log('room code:', code);
await host.fill('.setup-player input[value="Player 1"]', 'Hosty').catch(() => {});
await host.click('text=Host (Hosty) first').catch(async () => host.click('text=Host (Player 1) first'));
await host.screenshot({ path: `${dir}/online01-host-lobby.png` });

// --- Guest joins with the link
await guest.goto(`http://localhost:5173/?join=${code}&${PEER}`);
await guest.fill('.setup-player input[value="Player 2"]', 'Guesty');
await guest.click('button:has-text("Join")');
await guest.waitForSelector('text=Connected to', { timeout: 30000 });
await host.waitForSelector('text=Guesty', { timeout: 10000 });
await guest.screenshot({ path: `${dir}/online02-guest-lobby.png` });

// --- Start
await host.click('button:has-text("Start Duel")');
await host.waitForSelector('.board');
await guest.waitForSelector('.board', { timeout: 10000 });
await guest.waitForTimeout(600);
const guestTopFacedown = await guest.$$eval('.hand-top .card', (els) => els.every((e) => e.classList.contains('facedown')));
const guestBottomFaceup = await guest.$$eval('.hand-bottom .card', (els) => els.length === 5 && els.every((e) => !e.classList.contains('facedown')));
const hostTopFacedown = await host.$$eval('.hand-top .card', (els) => els.every((e) => e.classList.contains('facedown')));
const guestWaiting = await guest.textContent('.waiting-banner').catch(() => null);
console.log('guest sees host hand face-down:', guestTopFacedown, '| own hand face-up:', guestBottomFaceup, '| host sees guest hand face-down:', hostTopFacedown);
console.log('guest waiting banner:', guestWaiting);
// Guest cannot look at the host's hidden cards through the view data either
const leaked = await guest.evaluate(() => Array.from(document.querySelectorAll('.hand-top .card')).map((e) => e.getAttribute('title')));
console.log('titles of host hand cards on guest screen:', [...new Set(leaked)]);
await host.screenshot({ path: `${dir}/online03-host-board.png` });
await guest.screenshot({ path: `${dir}/online04-guest-board.png` });

// --- Host's turn: summon something, end turn
await host.locator('button.btn-teach').click();
await host.waitForSelector('.teach-panel');
const summonBtn = host.locator('.teach-list .btn-primary', { hasText: 'Normal Summon' }).first();
const summonLabel = await summonBtn.textContent();
await summonBtn.click();
await H.pickZone(2);
await H.settle();
await G.settle();
console.log('host did:', summonLabel.trim());
await host.waitForTimeout(500);
await host.click('button:has-text("End Turn")');
// End Phase windows: whoever is asked declines; the guest must get one, and the host must show "waiting" meanwhile.
let guestGotWindow = false;
let hostWaitingText = null;
for (let i = 0; i < 12; i++) {
  await host.waitForTimeout(400);
  if (await guest.$('.prompt-response')) {
    guestGotWindow = true;
    hostWaitingText = await host.textContent('.waiting-banner').catch(() => null);
    await guest.screenshot({ path: `${dir}/online05-guest-response.png` });
    await guest.click('text=Decline (do not respond)');
    continue;
  }
  if (await host.$('.prompt-response')) { await host.click('text=Decline (do not respond)'); continue; }
  const dont = (await host.$('.btn-option:has-text("Do not activate")')) || (await guest.$('.btn-option:has-text("Do not activate")'));
  if (dont) { await dont.click(); continue; }
  if (await guest.$('.turn-player:has-text("Guesty")')) break;
}
console.log('guest got an End Phase response window:', guestGotWindow, '| host banner meanwhile:', hostWaitingText);
await guest.waitForSelector('.turn-player:has-text("Guesty")', { timeout: 10000 });

// --- Guest's turn: summon; host must wait during the zone choice
await guest.locator('button.btn-teach').click();
await guest.waitForSelector('.teach-panel');
const gSummon = guest.locator('.teach-list .btn-primary', { hasText: 'Normal Summon' }).first();
const gLabel = (await gSummon.textContent()).trim();
await gSummon.click();
await guest.waitForSelector('.zone-selectable');
await host.waitForTimeout(400);
const hostWaitZone = await host.textContent('.waiting-banner');
console.log('guest did:', gLabel, '| host banner during guest zone choice:', hostWaitZone);
const owners = await guest.$$eval('.zone-selectable', (els) => [...new Set(els.map((e) => e.getAttribute('data-zone-owner')))]);
console.log('guest highlighted zone owners:', owners);
await guest.click('.zone-selectable >> nth=2');
await G.settle();
await H.settle();
await host.waitForTimeout(500);
const hostSeesMonster = await host.$$eval('.zone-monster .card, .zone .card', (els) => els.length);
console.log('cards on host board after guest summon:', hostSeesMonster);
await host.screenshot({ path: `${dir}/online06-host-after-guest-summon.png` });

// --- Guest asks to undo; host allows
await guest.click('button:has-text("Ask to undo")');
await host.waitForSelector('text=asks to undo', { timeout: 10000 });
await host.screenshot({ path: `${dir}/online07-undo-request.png` });
await host.click('button:has-text("Allow")');
await guest.waitForTimeout(600);
const afterUndo = await host.$$eval('.zone .card', (els) => els.length);
console.log('cards on host board after undo:', afterUndo);

// --- Guest reload: reconnects and gets the game back
await guest.reload();
await guest.waitForSelector('button:has-text("Join")');
await guest.fill('.setup-player input[value="Player 2"]', 'Guesty');
await guest.click('button:has-text("Join")');
await guest.waitForSelector('.board', { timeout: 30000 });
console.log('guest reconnected, board visible; turn label:', (await guest.textContent('.turn-player')).trim());

// --- Logs
console.log('host log tail:', (await host.$$eval('.log-entry', (els) => els.map((e) => e.textContent).slice(-3))).join(' | '));
console.log('errors:', errors);
await browser.close();
