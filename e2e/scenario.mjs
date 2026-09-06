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
};
const pickZone = async (n) => { await page.waitForSelector('.zone-selectable'); await page.click(`.zone-selectable >> nth=${n}`); await page.waitForSelector('.zone-selectable', { state: 'detached' }); };
await clickAction('Normal Summon: Kaibaman'); await pickZone(2);
await page.waitForTimeout(150);
await page.screenshot({ path: `${dir}/fx01-summon.png` });
await clickAction('Set: Kunai with Chain'); await pickZone(0);
await clickAction('Set: Compulsory Evacuation Device'); await pickZone(0);
await page.waitForTimeout(1200);
await page.click('text=End Turn'); await page.waitForTimeout(400);
if (await page.$('.prompt-response')) await page.click('text=Decline (do not respond)');
await page.waitForTimeout(1500);
await clickAction('Normal Summon: Crystal Beast Emerald Tortoise'); await pickZone(2);
await page.waitForSelector('.prompt-response');
await page.click('text=Decline (do not respond)');
await page.waitForTimeout(1200);
await page.click('text=Enter Battle Phase'); await page.waitForTimeout(600);
await clickAction('Attack: Crystal Beast Emerald Tortoise');
await page.waitForTimeout(400);
await page.screenshot({ path: `${dir}/fx02-attack.png` });
await page.waitForTimeout(550);
await page.screenshot({ path: `${dir}/fx02b-attack-impact.png` });
// Decline the turn player's own window / optional triggers until Player 1's Kunai window appears
for (let i = 0; i < 6; i++) {
  const resp = await page.$('.prompt-response');
  if (resp && (await resp.innerText()).includes('Kunai')) break;
  if (resp) { await page.click('text=Decline (do not respond)'); await page.waitForTimeout(400); continue; }
  const dont = await page.$('.btn-option:has-text("Do not activate")');
  if (dont) { await dont.click(); await page.waitForTimeout(400); continue; }
  await page.waitForTimeout(300);
}
await page.waitForSelector('.prompt-response');
await page.click('.response-option:has-text("Kunai") button');
await page.waitForTimeout(300);
await page.click('.btn-option:has-text("both")');
await page.waitForTimeout(600);
await page.screenshot({ path: `${dir}/fx03-trap.png` });
await page.waitForTimeout(1200);
if (await page.$('.prompt-response')) await page.click('text=Decline (do not respond)');
await page.waitForTimeout(500);
await page.screenshot({ path: `${dir}/fx04-after.png` });
console.log(await page.$$eval('.log-entry', (els) => els.map((e) => e.textContent).slice(-6)).then((l) => l.join('\n')));
console.log('errors:', errors);
await browser.close();
