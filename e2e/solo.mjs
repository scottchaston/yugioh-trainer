// Solo play: a person against the computer opponent (hard). The computer must play its whole turn on
// its own, and Undo must take the human back to their own last move.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const dir = process.env.SHOTS_DIR ?? '/tmp/ygo-shots';
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
await page.goto('http://localhost:5173/?seed=55');
await page.waitForSelector('text=Start Duel');
await page.locator('select').nth(0).selectOption('sdbt');
await page.locator('[data-testid="opponent"]').selectOption('hard');
await page.screenshot({ path: `${dir}/s01-setup.png` });
await page.locator('select').nth(2).selectOption('sdck'); // computer's deck
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
// Human turn 1: Normal Summon Myrmeleo, end turn.
await page.locator('button.btn-teach').click();
await page.locator('.teach-list .btn-primary', { hasText: 'Normal Summon: Traptrix Myrmeleo' }).first().click();
await settle();
await page.click('text=End Turn');
// The computer's turn: the banner shows, the human's controls are disabled, then it becomes the human's turn again.
await page.waitForSelector('.computer-banner', { timeout: 10000 });
console.log('banner:', await page.$eval('.computer-banner', (e) => e.textContent));
console.log('End Turn disabled during computer turn:', await page.$eval('button:has-text("End Turn")', (b) => b.disabled));
await page.waitForTimeout(1500);
await page.screenshot({ path: `${dir}/s02-computer-turn.png` });
// Human response windows during the computer's turn must be answered by the human: decline them.
for (let i = 0; i < 60; i++) {
  if (await page.$('.prompt-response')) { await page.click('text=Decline (do not respond)'); await page.waitForTimeout(300); continue; }
  const label = await page.$eval('.turn-player', (e) => e.textContent).catch(() => '');
  const banner = await page.$('.computer-banner');
  if (!banner && label.startsWith('Player 1')) break;
  await page.waitForTimeout(500);
}
const turn = await page.$eval('.turn-label', (e) => e.textContent);
console.log('after computer turn:', turn, await page.$eval('.turn-player', (e) => e.textContent));
await page.screenshot({ path: `${dir}/s03-back-to-human.png` });
const logText = await page.$$eval('.log-entry', (els) => els.map((e) => e.textContent));
const computerLines = logText.filter((l) => l.includes('Computer'));
console.log('computer log lines:', computerLines.length, '|', computerLines.slice(0, 6).join(' | '));
// Undo takes the human back to before "End Turn" (their own last decision), skipping the computer's moves.
await page.click('button:has-text("Undo")');
await page.waitForTimeout(600);
console.log('after undo:', await page.$eval('.turn-label', (e) => e.textContent), await page.$eval('.turn-player', (e) => e.textContent), 'banner:', !!(await page.$('.computer-banner')));
await page.screenshot({ path: `${dir}/s04-after-undo.png` });
console.log('errors:', errors);
await browser.close();
