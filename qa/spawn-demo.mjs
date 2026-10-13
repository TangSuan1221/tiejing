import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
// 演示：GM 无视频模式下在接驳港北岸刷出二级怪物，截图参数面板、取景与曝光提示词。
const dir = 'qa/spawn-demo';
await mkdir(dir, {recursive: true});
const browser = await chromium.launch({channel: 'msedge', headless: true});
try {
  const page = await (await browser.newContext({viewport: {width: 1600, height: 900}})).newPage();
  await page.route('**/api/video/**', r => r.abort());
  await page.addInitScript(() => sessionStorage.setItem('ironlung.gm.novideo', '1'));
  await page.goto('http://127.0.0.1:5173/?gm');
  await page.locator('[data-id="new"]').click();
  await page.waitForFunction(() => !!window.__podView);
  await page.evaluate(() => {
    const r = window.__pod; r.receive?.(); r.arrive(); r.power = 1; r.blackout = false; r.lamp = true;
    const s = r.authoredSite, p = s.spawner.table.points.find(x => x.id === 'harbor.t2.north-gallery');
    s.spawner.clear();
    const [vx, vy, vz] = p.vantage, [px, py, pz] = p.position;
    s.position.set(vx, vy, vz); r.heading = (Math.atan2(px - vx, -(pz - vz)) * 180 / Math.PI + 360) % 360; r.pitch = -Math.atan2(py - vy, Math.hypot(px - vx, pz - vz)) * 180 / Math.PI;
    r.walkTo('camera');
    window.GM('刷怪 harbor.t2.north-gallery');
  });
  await page.waitForTimeout(1500);
  await page.screenshot({path: `${dir}/1-spawn-params.png`});
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  await page.screenshot({path: `${dir}/2-viewfinder.png`});
  await page.keyboard.press('1');
  await page.locator('.gm-prompt').waitFor({timeout: 60000});
  await page.waitForTimeout(500);
  await page.screenshot({path: `${dir}/3-exposure-prompt.png`});
  const prompt = await page.locator('.gm-prompt pre').textContent();
  const start = prompt.indexOf('MONSTER_SUBJECTS:'), end = prompt.indexOf('CURRENT_RESULT:');
  console.log(prompt.slice(start, end));
  console.log('TOTAL', prompt.length);
} finally {
  await browser.close();
}
