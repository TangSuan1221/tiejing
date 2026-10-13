import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';

// 首关：未拍照登记前，港区声源贴近撞击时，主动声纳脉冲也必须扫出它的回波（与-1层同一规则）。
const url = process.env.GAME_URL ?? 'http://127.0.0.1:5173/';
await mkdir('qa/harbor-sonar-echo', {recursive: true});
const browser = await chromium.launch({channel: 'msedge', headless: true});
try {
  const page = await (await browser.newContext({viewport: {width: 1600, height: 900}})).newPage();
  await page.route('**/api/**', r => r.abort());
  await page.goto(url);
  await page.locator('[data-id="new"]').click();
  await page.waitForFunction(() => !!window.__podView);
  const before = await page.evaluate(() => {
    const r = window.__pod; r.receive?.(); r.arrive(); const s = r.authoredSite;
    r.power = 1; r.blackout = false; r.heading = 90;
    s.entryReached = true; s.position.set(37.3, 0, 31.4); s.tick(.01);
    if (!r.activeSonarEnabled) r.toggleActiveSonar();
    if (!r.sonarPulseEnabled) r.toggleSonarPulses();
    return {identified: s.facility.state.identified, emitting: r.sonarEmitting, awake: s.awake};
  });
  assert(!before.identified, 'precondition: the creature has not been filmed or analysed');
  assert(before.emitting, 'active sonar must be pulsing');
  // Let the real pursuit hear the pulse and come to the hull, the way the screenshot happened.
  const hit = await page.evaluate(async () => {
    const r = window.__pod, s = r.authoredSite;
    let struck = false, echoAtStrike = null;
    for (let i = 0; i < 1800 && !struck; i++) {
      s.tick(1 / 30);
      if (s.facility.state.noiseStrikes > 0) { struck = true; echoAtStrike = s.detectedThreatDistance(); }
    }
    return {struck, echoAtStrike, gap: s.position.distanceTo(s.pursuit.position)};
  });
  assert(hit.struck, `creature never struck (distance ${hit.gap.toFixed(1)} m)`);
  assert(hit.echoAtStrike !== null && hit.echoAtStrike <= 6.5, `active sonar showed no echo while being rammed (echo ${hit.echoAtStrike})`);
  await page.evaluate(() => window.__pod.walkTo('driving'));
  await page.waitForTimeout(1200);
  await page.screenshot({path: 'qa/harbor-sonar-echo/rammed-echo.png'});
  // Pulses only rebuild terrain: a powered set keeps showing the creature with pulses stopped; powering off hides it.
  const quiet = await page.evaluate(() => {
    const r = window.__pod, s = r.authoredSite;
    r.power = 1; r.blackout = false; r.stopSonarPulses(); s.tick(.01);
    const silent = s.detectedThreatDistance();
    r.toggleActiveSonar(); const off = s.detectedThreatDistance(); r.toggleActiveSonar();
    // Spawned individuals are creatures too.
    r.stopSonarPulses(); s.spawner.clear(); s.position.set(18, 0, 32); s.spawner.force('harbor.t1.entry-pool');
    const spawned = s.spawner.active[0].position, d = Math.hypot(spawned[0] - 18, spawned[2] - 32);
    const spawnSeen = s.threatContacts().some(c => Math.abs(c.distance - d) < .01);
    return {silent, off, spawnSeen, spawnDistance: d, powered: r.powered, gap: s.position.distanceTo(s.pursuit.position)};
  });
  assert(quiet.silent !== null, `pulses stopped: powered active sonar still shows the creature ${JSON.stringify(quiet)}`);
  assert.equal(quiet.off, null, 'active sonar powered off: no creature contact');
  assert(quiet.spawnSeen, `spawned individual at ${quiet.spawnDistance.toFixed(1)} m missing from active sonar`);
  console.log(`PASS harbor sonar echo: unidentified creature struck at ${hit.gap.toFixed(1)} m and shown at ${hit.echoAtStrike.toFixed(1)} m; still shown with pulses stopped; hidden when active sonar is off; spawned individual shown at ${quiet.spawnDistance.toFixed(1)} m`);
} finally {
  await browser.close();
}
