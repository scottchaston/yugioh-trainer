// Beware of Traptrix: Xyz Summon (materials attached) and Link Summon into an Extra Monster Zone.
// Seed 55 gives Player 1 Myrmeleo, Mantis, Dionaea, Sauge de Fleur and Traptrip Garden.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const dir = process.env.SHOTS_DIR ?? '/tmp/ygo-shots';
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
await page.goto('http://localhost:5173/?seed=55');
await page.waitForSelector('text=Start Duel');
await page.locator('select').nth(0).selectOption('sdbt');
await page.locator('select').nth(1).selectOption('sdck');
await page.click('text=Player 1 first');
await page.click('text=Start Duel');
await page.waitForSelector('.board');
const settle = async () => {
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(250);
    if (await page.$('.prompt-response')) { await page.click('text=Decline (do not respond)'); continue; }
    const dont = await page.$('.btn-option:has-text("Do not activate")');
    if (dont) { await dont.click(); continue; }
    if (await page.$('.zone-selectable')) { await page.click('.zone-selectable >> nth=0'); continue; }
    const opt = await page.$('.option-list .btn-option');
    if (opt) { await opt.click(); continue; }
    break;
  }
};
const clickAction = async (text) => {
  await settle();
  if (!(await page.$('.teach-panel'))) await page.locator('button.btn-teach').click();
  await page.waitForSelector('.teach-panel');
  const row = page.locator('.teach-list .btn-primary', { hasText: text }).first();
  if (!(await row.count())) { console.log('NO ACTION', text, await page.$$eval('.teach-list .btn-primary', (e) => e.map((x) => x.textContent))); return false; }
  await row.click();
  await settle();
  return true;
};
await clickAction('Normal Summon: Traptrix Myrmeleo');
// Myrmeleo's search prompt: pick the first card offered if a selection is open
for (let i = 0; i < 4; i++) { const pick = await page.$('.pick-item, .prompt-card'); if (pick) { await pick.click(); await page.waitForTimeout(300); const ok = await page.$('.btn-primary:has-text("Confirm")'); if (ok) await ok.click(); } await settle(); }
await clickAction('Activate: Traptrip Garden');
await clickAction('Normal Summon: Traptrix Mantis');
for (let i = 0; i < 4; i++) { const pick = await page.$('.pick-item, .prompt-card'); if (pick) { await pick.click(); await page.waitForTimeout(300); const ok = await page.$('.btn-primary:has-text("Confirm")'); if (ok) await ok.click(); } await settle(); }
const xyz = await clickAction('Xyz Summon: Traptrix Rafflesia');
await page.waitForTimeout(900);
await page.screenshot({ path: `${dir}/x01-xyz.png` });
// inspect Rafflesia
const raff = page.locator('.board .card', { hasText: 'Rafflesia' }).first();
if (await raff.count()) { await raff.click(); await page.waitForTimeout(300); await page.screenshot({ path: `${dir}/x02-xyz-inspector.png` }); }
const link = await clickAction('Link Summon: Traptrix Sera');
await page.waitForTimeout(900);
await page.screenshot({ path: `${dir}/x03-link.png` });
const sera = page.locator('.board .card', { hasText: 'Sera' }).first();
if (await sera.count()) { await sera.click(); await page.waitForTimeout(300); await page.screenshot({ path: `${dir}/x04-link-inspector.png` }); }
console.log('xyz', xyz, 'link', link);
console.log((await page.$$eval('.log-entry', (els) => els.map((e) => e.textContent).slice(-10))).join('\n'));
console.log('errors:', errors);
await browser.close();
