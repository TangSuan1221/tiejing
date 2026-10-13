import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';

// 刷怪点在真实关卡几何里：从观察艇位对准时，刷出个体必须真的进入快门取景；
// 无视频模式曝光后，提示词必须写入该个体锁定的物种与实测构图。
const url = process.env.GAME_URL ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch({channel: 'msedge', headless: true});
try {
  const page = await (await browser.newContext({viewport: {width: 1600, height: 900}})).newPage();
  let videoCalls = 0;
  await page.route('**/api/video/**', r => { videoCalls++; return r.abort(); });
  await page.addInitScript(() => sessionStorage.setItem('ironlung.gm.novideo', '1'));
  await page.goto(url);
  await page.locator('[data-id="new"]').click();
  await page.waitForFunction(() => !!window.__podView);

  // Geometry probe: pose at each vantage, aim at the point, force a spawn there, ask the site's own shutter filter.
  const probe = () => page.evaluate(() => {
    const r = window.__pod, s = r.authoredSite, out = [];
    r.power = 1; r.blackout = false; r.lamp = true; r.camPan = r.camTilt = 0; r.camZoom = 1;
    for (const p of s.spawner.table.points) {
      const [vx, vy, vz] = p.vantage, [px, py, pz] = p.position;
      s.position.set(vx, vy, vz);
      r.heading = (Math.atan2(px - vx, -(pz - vz)) * 180 / Math.PI + 360) % 360;
      r.pitch = -Math.atan2(py - vy, Math.hypot(px - vx, pz - vz)) * 180 / Math.PI;
      const inWater = !s.world?.walkable || s.world.walkable.some(b => b.containsPoint({x: px, y: py, z: pz}));
      const m = s.spawner.force(p.id), seen = s.shotSpawns().map(x => x.id);
      out.push({id: p.id, inWater, seen: seen.includes(m.id), species: m.video.speciesZh});
    }
    s.spawner.clear();
    return {site: s.spawner.table.site, out};
  });

  await page.evaluate(() => { const r = window.__pod; r.receive?.(); r.arrive(); });
  const harbor = await probe();
  assert.equal(harbor.site, 'harbor');
  for (const p of harbor.out) {
    assert(p.inWater, `${p.id}: spawn point outside harbor walkable water`);
    assert(p.seen, `${p.id}: aimed from its vantage, the shutter does not see the spawn`);
  }

  // End to end on the harbor tier-2 point: GM spawn → real exposure key → prompt panel.
  const gm = await page.evaluate(() => {
    const r = window.__pod, s = r.authoredSite, p = s.spawner.table.points.find(x => x.id === 'harbor.t2.north-gallery');
    s.spawner.clear();
    const [vx, vy, vz] = p.vantage, [px, py, pz] = p.position;
    s.position.set(vx, vy, vz); r.heading = (Math.atan2(px - vx, -(pz - vz)) * 180 / Math.PI + 360) % 360; r.pitch = -Math.atan2(py - vy, Math.hypot(px - vx, pz - vz)) * 180 / Math.PI;
    const text = window.GM('刷怪 harbor.t2.north-gallery');
    const panel = document.querySelector('.gm-prompt pre')?.textContent ?? '';
    return {text, panel, live: s.spawner.active.find(m => m.pointId === p.id)};
  });
  assert.match(gm.text, /已刷出 harbor\.t2\.north-gallery#\d+/);
  const params = JSON.parse(gm.panel);
  assert.equal(params.instanceId, gm.live.id);
  for (const k of ['seedKey', 'tier', 'speciesId', 'speciesName', 'size', 'spawnDepth', 'label', 'setting']) assert(params[k] !== undefined, `GM params missing ${k}`);
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__pod.walkTo('camera'));
  await page.waitForTimeout(600);
  const contacts = await page.evaluate(() => window.__pod.authoredSite.navigationConsole.passiveContacts.map(c => c.id));
  assert(contacts.includes(gm.live.id), 'spawned individual missing from the passive array');
  await page.keyboard.press('1');
  await page.locator('.gm-prompt').waitFor({timeout: 60000});
  const prompt = await page.locator('.gm-prompt pre').textContent();
  assert(prompt.includes(`[${gm.live.id}]`), 'exposure prompt lacks the spawned individual');
  assert(prompt.includes(params.setting), 'exposure prompt lacks the spawn setting');
  assert(prompt.includes('built on the body plan of a ' + params.base), 'exposure prompt lacks the locked species body plan');
  assert(/LENS: fixed \d+° vertical/.test(prompt) && prompt.includes('DEPTH: about'), 'exposure prompt lacks live optics');
  assert(prompt.length <= 7000, `prompt ${prompt.length} exceeds 7000`);
  await page.keyboard.press('Escape');

  // Save → reload the same individual; a save from before spawn points still loads.
  const save = await page.evaluate(() => {
    const s = window.__pod.authoredSite, snap = s.snapshot(), before = s.spawner.active.map(m => m.id + ':' + m.video.speciesId);
    s.spawner.clear();
    const ok = s.restore(structuredClone(snap)), after = s.spawner.active.map(m => m.id + ':' + m.video.speciesId);
    const legacy = structuredClone(snap); delete legacy.spawns;
    return {ok, before, same: JSON.stringify(before) === JSON.stringify(after), legacy: s.restore(legacy), emptied: s.spawner.active.length};
  });
  assert(save.ok && save.same && save.before.length > 0, 'restore changed the spawned individuals');
  assert(save.legacy && save.emptied === 0, 'pre-spawn save must still load with an empty spawner');

  // Deck −1 through the GM level switch.
  await page.evaluate(() => window.GM('进入关卡 2'));
  await page.waitForFunction(() => window.__pod.authoredSite?.spawner?.table.site === 'living', null, {timeout: 30000});
  const living = await probe();
  for (const p of living.out) assert(p.seen, `${p.id}: aimed from its vantage, the shutter does not see the spawn`);
  const list = await page.evaluate(() => window.GM('刷怪点'));
  assert(list.includes('living.t3.descent-shaft'), 'GM list misses living points');

  assert.equal(videoCalls, 0, 'no-video mode contacted the video API');
  const fmt = r => r.out.map(p => `${p.id.split('.').slice(1).join('.')}(${p.species})`).join(', ');
  console.log(`PASS harbor geometry: ${fmt(harbor)}`);
  console.log(`PASS living geometry: ${fmt(living)}`);
  console.log(`PASS end to end: GM spawn ${gm.live.id} ${params.speciesZh} → passive contact → exposure prompt ${prompt.length}/7000 with locked species, setting and live lens; save/restore keeps it; legacy save loads; 0 API calls`);
} finally {
  await browser.close();
}
