import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';

// GM 无视频模式：真实曝光后必须交出与正式提交一致、可复制的提示词，并能在分析台重新打开。
const url = process.env.GAME_URL ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch({channel: 'msedge', headless: true});
try {
  const context = await browser.newContext({viewport: {width: 1600, height: 900}, permissions: ['clipboard-read', 'clipboard-write']});
  const page = await context.newPage();
  let videoCalls = 0;
  await page.route('**/api/video/**', r => { videoCalls++; return r.abort(); });
  await page.addInitScript(() => sessionStorage.setItem('ironlung.gm.novideo', '1'));
  await page.goto(url);
  await page.locator('[data-id="new"]').click();
  await page.waitForFunction(() => !!window.__podView);
  // Diagnostic arrival only; exposure, development, panel, copy and lab use the live app and real keys.
  await page.evaluate(() => {
    const r = window.__pod; r.receive?.(); r.arrive(); r.power = 1; r.blackout = false; r.walkTo('camera');
  });
  await page.waitForTimeout(2000);
  await page.keyboard.press('1');
  await page.locator('.gm-prompt').waitFor({timeout: 60000});
  if (process.env.SHOT) await page.screenshot({path: process.env.SHOT});

  const panel = await page.evaluate(() => ({
    text: document.querySelector('.gm-prompt pre')?.textContent ?? '',
    meta: document.querySelector('.gm-prompt [data-slot="meta"]')?.textContent ?? '',
    hasFrame: !!document.querySelector('.gm-prompt img[data-slot="frame"]')?.getAttribute('src')?.startsWith('data:image/'),
    tapePrompt: window.__pod.selectedTape?.prompt ?? '',
    result: window.__pod.selectedTape?.videoResult,
  }));
  assert.equal(panel.result, 'prompt');
  assert(panel.text.startsWith('Use the attached image'), 'panel text lacks the reference-image prefix that the real submission adds');
  assert(panel.text.includes('CAMERA LOCK:'), 'panel text lacks the fixed camera contract');
  assert(panel.text.includes('DEPTH: about'), 'panel text lacks the depth slot');
  assert(panel.text.endsWith(panel.tapePrompt.trim()) || panel.text.includes(panel.tapePrompt.slice(0, 200)), 'panel text is not the composed tape prompt');
  assert(panel.text.length <= 7000, `panel prompt ${panel.text.length} exceeds 7000`);
  assert(panel.hasFrame, 'reference frame missing from panel');
  assert(/字符/.test(panel.meta) && /秒/.test(panel.meta), `panel meta incomplete: ${panel.meta}`);

  await page.locator('.gm-prompt [data-act="copy"]').click();
  await page.waitForTimeout(200);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  assert.equal(clip, panel.text, 'clipboard does not hold the full prompt');
  assert.equal(await page.locator('.gm-prompt [data-act="copy"]').textContent(), '已复制');

  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.gm-prompt').count(), 0, 'Escape did not close the panel');

  await page.evaluate(() => window.__pod.walkTo('lab'));
  await page.waitForTimeout(300);
  await page.keyboard.press('8');
  await page.locator('.gm-prompt').waitFor({timeout: 3000});
  assert.equal(await page.locator('.gm-prompt pre').textContent(), panel.text, 'lab reopen shows a different prompt');
  await page.keyboard.press('Escape');
  await page.keyboard.press('3');
  await page.waitForTimeout(300);
  const analyzed = await page.evaluate(() => window.__pod.selectedTape?.analyzed);
  assert(analyzed, 'analysis key blocked after closing the prompt panel');
  assert.equal(videoCalls, 0, 'no-video mode contacted the video API');
  console.log(`PASS GM no-video prompt: auto panel, ${panel.text.length} chars, reference frame, clipboard copy, Esc close, lab reopen (key 8), analysis still works, 0 API calls`);
} finally {
  await browser.close();
}
