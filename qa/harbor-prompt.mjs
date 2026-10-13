import {chromium} from '@playwright/test';
import {mkdir, writeFile} from 'node:fs/promises';

// 首关怪物入镜的一次真实曝光（GM 无视频模式），导出可复制的完整视频提示词与参考帧。
const url = process.env.GAME_URL ?? 'http://127.0.0.1:5173/';
const dir = 'qa/harbor-prompt';
await mkdir(dir, {recursive: true});
const browser = await chromium.launch({channel: 'msedge', headless: true});
try {
  const page = await (await browser.newContext({viewport: {width: 1600, height: 900}})).newPage();
  await page.route('**/api/video/**', r => r.abort());
  await page.addInitScript(() => sessionStorage.setItem('ironlung.gm.novideo', '1'));
  await page.goto(url);
  await page.locator('[data-id="new"]').click();
  await page.waitForFunction(() => !!window.__podView);
  const pose = await page.evaluate(() => {
    const r = window.__pod; r.receive?.(); r.arrive(); r.power = 1; r.blackout = false; r.lamp = true;
    const s = r.authoredSite; s.pursuit.position.set(56, -.8, 19); const m = s.pursuit.position.clone();
    for (const d of [7, 9, 6, 11, 5]) for (let a = 0; a < 360; a += 15) {
      const rad = a * Math.PI / 180;
      s.position.set(m.x - Math.sin(rad) * d, 0, m.z + Math.cos(rad) * d);
      r.heading = a; r.camPan = 0; r.camTilt = 0; r.pitch = 0; s.tick(.01);
      if (s.creatureVisible() && s.echoClear(m)) return {d, a, pod: s.position.toArray(), monster: m.toArray()};
    }
    return null;
  });
  if (!pose) throw new Error('no clear vantage on the harbor creature');
  await page.evaluate(() => window.__pod.walkTo('camera'));
  await page.waitForTimeout(2000);
  await page.keyboard.press('1');
  await page.locator('.gm-prompt').waitFor({timeout: 60000});
  const out = await page.evaluate(() => ({
    text: document.querySelector('.gm-prompt pre')?.textContent ?? '',
    frame: document.querySelector('.gm-prompt img[data-slot="frame"]')?.getAttribute('src') ?? '',
  }));
  await writeFile(`${dir}/prompt.txt`, out.text);
  if (out.frame.startsWith('data:image/')) await writeFile(`${dir}/frame.png`, Buffer.from(out.frame.split(',')[1], 'base64'));
  console.log(JSON.stringify({pose, chars: out.text.length, harbor: out.text.includes('Ceratioidei')}));
} finally {
  await browser.close();
}
