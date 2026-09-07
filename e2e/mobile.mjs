// Phone layout, prompt card previews and the end-of-Duel animations.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const dir = process.env.SHOTS_DIR ?? '/tmp/ygo-shots';
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const errors = [];
const settle = async (page) => {
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
const clickAction = async (page, text) => {
  await settle(page);
  if (!(await page.$('.teach-panel'))) await page.locator('button.btn-teach').click();
  await page.waitForSelector('.teach-panel');
  await page.locator('.teach-list .btn-primary', { hasText: text }).first().click();
};

// --- Phone (portrait) -------------------------------------------------------
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await phone.newPage();
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
await page.goto('http://localhost:5173/?seed=55');
await page.waitForSelector('text=Start Duel');
await page.screenshot({ path: `${dir}/m01-setup.png`, fullPage: true });
await page.locator('select').nth(0).selectOption('sdbt');
await page.click('text=Player 1 first');
await page.click('text=Start Duel');
await page.waitForSelector('.board');
await page.waitForTimeout(400);
const zoom = await page.$eval('.board-scale', (e) => getComputedStyle(e).zoom);
const boardWidth = await page.$eval('.board', (e) => e.getBoundingClientRect().width);
console.log('phone board zoom:', zoom, 'board width:', boardWidth, 'viewport 390');
await page.screenshot({ path: `${dir}/m02-board.png` });
await page.screenshot({ path: `${dir}/m03-page.png`, fullPage: true });
// Tapping a card on the phone shows the bottom bar with a jump to its details.
await page.locator('.hand-bottom .card').first().click();
await page.waitForSelector('.mobile-cardbar');
await page.screenshot({ path: `${dir}/m02b-cardbar.png` });
await page.click('.mobile-cardbar .btn-primary');
await page.waitForTimeout(600);
await page.screenshot({ path: `${dir}/m02c-details.png` });
console.log('card bar:', await page.$eval('.mobile-cardbar-name', (e) => e.textContent));
await page.click('.mobile-cardbar .btn:not(.btn-primary)');
await page.evaluate(() => window.scrollTo(0, 0));
// Myrmeleo's Normal Summon search: the prompt must show "read card" previews.
await page.locator('button.btn-teach').click();
await page.locator('.teach-list .btn-primary', { hasText: 'Normal Summon: Traptrix Myrmeleo' }).first().click();
await page.waitForSelector('.zone-selectable');
await page.click('.zone-selectable >> nth=0');
await page.waitForTimeout(400);
const yes = await page.$('.option-list .btn-option');
if (yes) await yes.click();
await page.waitForSelector('.pick-grid');
await page.waitForTimeout(500);
await page.locator('.pick-details').first().click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${dir}/m04-prompt-preview.png` });
const summary = await page.$eval('.card-summary', (e) => e.textContent);
console.log('preview:', summary.slice(0, 120));
await page.locator('.pick-item .card').first().click();
await page.click('.prompt .btn-primary:has-text("Confirm")');
await settle(page);
// End of Duel: defeat then victory (shared screen).
await page.evaluate(() => window.__ygoDebug.endDuel(0, 'Player 2 ran out of Life Points.'));
await page.waitForSelector('.duel-end-defeat');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${dir}/m05-defeat.png` });
await page.waitForSelector('.duel-end-victory', { timeout: 5000 });
await page.waitForTimeout(1400);
await page.screenshot({ path: `${dir}/m06-victory.png` });
await page.waitForSelector('.duel-end-buttons.visible');
await phone.close();

// --- Desktop: prompt preview and the victory screen at full size -------------
const desk = await browser.newPage({ viewport: { width: 1400, height: 900 } });
desk.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
await desk.goto('http://localhost:5173/?seed=55');
await desk.waitForSelector('text=Start Duel');
await desk.locator('select').nth(0).selectOption('sdbt');
await desk.click('text=Player 1 first');
await desk.click('text=Start Duel');
await desk.waitForSelector('.board');
await clickAction(desk, 'Normal Summon: Traptrix Myrmeleo');
await desk.evaluate(() => window.__ygoDebug.endDuel(1, 'Player 1 ran out of Life Points.'));
await desk.waitForSelector('.duel-end-defeat');
await desk.waitForTimeout(1300);
await desk.screenshot({ path: `${dir}/d01-defeat.png` });
await desk.waitForSelector('.duel-end-victory', { timeout: 5000 });
await desk.waitForTimeout(1500);
await desk.screenshot({ path: `${dir}/d02-victory.png` });
await desk.waitForSelector('.duel-end-buttons.visible');
await desk.click('text=New Duel');
await desk.waitForSelector('text=Start Duel');
console.log('errors:', errors);
await browser.close();
