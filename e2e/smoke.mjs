import { chromium } from 'playwright';
const dir = process.env.SHOTS_DIR ?? '/tmp/ygo-shots';
import { mkdirSync } from 'node:fs';
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
await page.goto('http://localhost:5173/');
await page.waitForSelector('text=Start Duel');
await page.screenshot({ path: `${dir}/01-setup.png` });
await page.click('text=Player 1 first');
await page.click('text=Start Duel');
await page.waitForSelector('.board');
await page.screenshot({ path: `${dir}/02-board.png` });
// Click "What can I do?"
await page.click('text=What can I do?');
await page.waitForSelector('.teach-panel');
await page.screenshot({ path: `${dir}/03-whatcanido.png` });
// Click first legal action in teach list
const first = await page.$('.teach-list .teach-row .btn-primary');
const label = first ? await first.textContent() : null;
console.log('first legal action:', label);
if (first) await first.click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${dir}/04-after-action.png` });
// If a zone prompt is showing, pick a zone
if (await page.$('.zone-selectable')) { await page.click('.zone-selectable'); await page.waitForTimeout(600); }
await page.screenshot({ path: `${dir}/05-after-zone.png` });
// Click a card in hand and open inspector
const handCard = await page.$('.hand-bottom .card');
if (handCard) await handCard.click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${dir}/06-inspector.png` });
// End turn
await page.click('text=End Turn');
await page.waitForTimeout(600);
await page.screenshot({ path: `${dir}/07-turn2.png` });
const logText = await page.$$eval('.log-entry', (els) => els.map((e) => e.textContent).slice(-8));
console.log(logText.join('\n'));
console.log('errors:', errors);
await browser.close();
