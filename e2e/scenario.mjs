import { chromium } from 'playwright';
const dir = process.env.SHOTS_DIR ?? '/tmp/ygo-shots';
import { mkdirSync } from 'node:fs';
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
await page.goto('http://localhost:5173/?seed=173');
await page.waitForSelector('text=Start Duel');
await page.click('text=Player 1 first');
await page.click('text=Start Duel');
await page.waitForSelector('.board');
await page.screenshot({ path: `${dir}/s01-board.png` });
// Turn 1 (P1): Normal Summon Kaibaman, Set CED, Set Kunai
const clickAction = async (text) => {
  await page.waitForTimeout(250);
  if (!(await page.$('.teach-panel'))) await page.locator('button.btn-teach').click();
  await page.waitForSelector('.teach-panel');
  await page.locator('.teach-list .btn-primary', { hasText: text }).first().click();
  await page.waitForTimeout(200);
};
const pickZone = async (n) => { await page.waitForSelector('.zone-selectable'); await page.click(`.zone-selectable >> nth=${n}`); await page.waitForSelector('.zone-selectable', { state: 'detached' }); await page.waitForTimeout(150); };
await clickAction('Normal Summon: Kaibaman');
await page.waitForSelector('.zone-selectable');
await page.screenshot({ path: `${dir}/s02-zone-prompt.png` });
await pickZone(2);
await clickAction('Set: Compulsory Evacuation Device');
await pickZone(0);
await clickAction('Set: Kunai with Chain');
await pickZone(0);
await page.screenshot({ path: `${dir}/s03-after-sets.png` });
await page.click('text=End Turn'); await page.waitForTimeout(500);
if (await page.$('.prompt-response')) { console.log('end-phase window:', await page.$eval('.prompt-response', (e) => e.innerText.slice(0, 200))); await page.click('text=Decline (do not respond)'); await page.waitForTimeout(300); }
// Turn 2 (P2): Normal Summon Emerald Tortoise -> P1 response window (CED / Kunai equip)
await clickAction('Normal Summon: Crystal Beast Emerald Tortoise');
await pickZone(2);
await page.waitForSelector('.prompt-response');
await page.screenshot({ path: `${dir}/s04-response-window.png` });
console.log('response prompt:', await page.$eval('.prompt-response', (e) => e.innerText.slice(0, 400)));
await page.click('text=Decline (do not respond)'); await page.waitForTimeout(400);
await page.click('text=Enter Battle Phase'); await page.waitForTimeout(400);
await page.screenshot({ path: `${dir}/s05-battle-phase.png` });
// Tortoise attacks Kaibaman? Tortoise 600 ATK vs Kaibaman 200 -> attack
await clickAction('Attack: Crystal Beast Emerald Tortoise');
await page.waitForSelector('.prompt-response');
await page.screenshot({ path: `${dir}/s06-attack-response.png` });
console.log('attack response prompt:', await page.$eval('.prompt-response', (e) => e.innerText.slice(0, 600)));
// Activate Kunai -> choose both -> equip target Kaibaman auto
await page.click('.response-option:has-text("Kunai") button');
await page.waitForTimeout(400);
await page.screenshot({ path: `${dir}/s07-kunai-options.png` });
await page.click('.btn-option:has-text("both")');
await page.waitForTimeout(800);
await page.screenshot({ path: `${dir}/s08-after-kunai.png` });
const logText = await page.$$eval('.log-entry', (els) => els.map((e) => e.textContent).slice(-10));
console.log(logText.join('\n'));
// Undo twice and check
await page.click('button:has-text("Undo")'); await page.waitForTimeout(300);
await page.screenshot({ path: `${dir}/s09-undo.png` });
console.log('errors:', errors);
await browser.close();
