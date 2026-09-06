import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const dir = process.env.SHOTS_DIR ?? '/tmp/ygo-shots';
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
await page.goto('http://localhost:5173/?seed=173');
await page.click('text=Player 1 first');
await page.click('text=Start Duel');
await page.waitForSelector('.board');
const clickAction = async (text) => {
  await page.waitForTimeout(250);
  if (!(await page.$('.teach-panel'))) await page.locator('button.btn-teach').click();
  await page.waitForSelector('.teach-panel');
  await page.locator('.teach-list .btn-primary', { hasText: text }).first().click();
  await page.waitForTimeout(200);
};
const pickZone = async (n) => { await page.waitForSelector('.zone-selectable'); await page.click(`.zone-selectable >> nth=${n}`); await page.waitForSelector('.zone-selectable', { state: 'detached' }); };
const settle = async () => {
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(250);
    if (await page.$('.prompt-response')) { await page.click('text=Decline (do not respond)'); continue; }
    const dont = await page.$('.btn-option:has-text("Do not activate")');
    if (dont) { await dont.click(); continue; }
    break;
  }
};
await clickAction('Normal Summon: Divine Dragon Apocralyph'); await pickZone(2); await settle();
await page.click('text=End Turn'); await settle();
await clickAction('Normal Summon: Crystal Beast Emerald Tortoise'); await pickZone(2); await settle();
await page.click('text=End Turn'); await settle();
await page.click('text=Enter Battle Phase'); await settle();
await clickAction('Attack: Divine Dragon Apocralyph');
await page.waitForTimeout(600);
await page.screenshot({ path: `${dir}/p01-attack.png` });
await settle();
// Player 2 is asked whether to place the destroyed Tortoise
await page.waitForSelector('.btn-option:has-text("Yes")');
await page.screenshot({ path: `${dir}/p02-place-question.png` });
await page.click('.btn-option:has-text("Yes")');
await page.waitForSelector('.zone-selectable');
await page.waitForTimeout(300);
await page.screenshot({ path: `${dir}/p03-zone-choice.png` });
console.log('zone owners highlighted:', await page.$$eval('.zone-selectable', (els) => els.map((e) => e.getAttribute('data-zone-owner'))));
console.log('banner:', await page.$eval('.decision-banner', (e) => e.innerText));
await page.click('.zone-selectable >> nth=1');
await page.waitForTimeout(900);
await page.screenshot({ path: `${dir}/p04-placed.png` });
console.log(await page.$$eval('.log-entry', (els) => els.map((e) => e.textContent).slice(-4)).then((l) => l.join('\n')));
console.log('errors:', errors);
await browser.close();
