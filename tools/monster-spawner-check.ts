import assert from 'node:assert/strict';
import {MonsterSpawner, SPAWN_TUNING, type MonsterVideoParams, type SpawnTable, type SpawnVec} from '../src/pod/sim/monster-spawner';
import {HARBOR_SPAWN_TABLE, LIVING_SPAWN_TABLE, SHOT_MONSTER_BUDGET, SPAWN_TABLES, fitSpawnSubjects, spawnPassiveContacts, spawnShotRange} from '../src/pod/content/spawn-points';
import {LEXICON, composeMonsterSubject, findSpecies} from '../src/pod/content/monster-lexicon';
import {spawnedMonsterSubject, videoCreatureSubject} from '../src/pod/content/video-creatures';
import {buildFootagePrompt} from '../src/pod/content/footage';
import {lockVideoCamera} from '../src/pod/content/fixed-camera';
import type {VideoContext} from '../src/pod/content/video-policy';
import {LIVING_SPACES} from '../src/pod/content/living-deck-layout';
import {livingLineOfSight} from '../src/pod/sim/living-creatures';

const dist = (a: SpawnVec, b: SpawnVec) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const run = (s: MonsterSpawner, seconds: number, pod: SpawnVec, canSee?: (p: SpawnVec) => boolean) => {const out = []; for (let t = 0; t < seconds; t += .25) out.push(...s.tick(.25, {pod, canSee})); return out;};

// 刷怪点表本身
for (const table of SPAWN_TABLES) {
  const ids = new Set<string>();
  for (const p of table.points) {
    assert(!ids.has(p.id), `duplicate spawn point ${p.id}`); ids.add(p.id);
    assert(p.id.startsWith(table.site + '.t' + p.tier), `${p.id}: id must carry site and tier`);
    assert(p.minDistance < dist(p.vantage, p.position) && dist(p.vantage, p.position) < p.triggerRadius, `${p.id}: vantage must sit inside the trigger window`);
    assert(p.chance > 0 && p.chance <= 1 && p.cooldown > 0 && p.lifetime > 0 && p.drift.length > 0 && p.setting.length > 20, `${p.id}: incomplete tuning`);
    const pool = LEXICON[p.tier].filter(e => !p.maxLength || e.length <= p.maxLength);
    assert(pool.length >= 5, `${p.id}: maxLength ${p.maxLength} leaves only ${pool.length} species`);
    if (p.speciesId) assert(findSpecies(p.tier, p.speciesId), `${p.id}: unknown fixed species`);
  }
  assert(table.points.some(p => p.tier === 1) && table.points.some(p => p.tier === 2) && table.points.some(p => p.tier === 3), `${table.site}: every tier needs a point`);
}

// 生活区：刷怪点、游动点与观察艇位都在潜艇可达空间内，且观察艇位能直视刷怪点
const podSpace = (p: SpawnVec) => LIVING_SPACES.find(s => s.pod && p[0] > s.minX && p[0] < s.maxX && p[1] > s.floorY && p[1] < s.ceilY && p[2] > s.minZ && p[2] < s.maxZ);
for (const p of LIVING_SPAWN_TABLE.points) {
  const home = podSpace(p.position);
  assert(home, `${p.id}: spawn outside every pod space`);
  for (const d of p.drift) assert.equal(podSpace(d)?.id, home!.id, `${p.id}: drift point ${d} leaves ${home!.id}`);
  assert(podSpace(p.vantage), `${p.id}: vantage not pod-reachable`);
  assert(livingLineOfSight(p.vantage, p.position), `${p.id}: no line of sight from vantage`);
}
console.log(`PASS tables: ${SPAWN_TABLES.map(t => `${t.site} ${t.points.length} points`).join(', ')}; every tier placed; living points inside pod spaces with clear sight lines`);

// 触发窗口、取景内禁刷、冷却、离开
const table: SpawnTable = {site: 'test', datum: 1200, points: [{...HARBOR_SPAWN_TABLE.points[2]!, id: 'test.t2.a', chance: 1, cooldown: 30, lifetime: 20}]};
const point = table.points[0]!, far: SpawnVec = [point.position[0] + 200, point.position[1], point.position[2]], near: SpawnVec = [point.position[0] + 2, point.position[1], point.position[2]];
const atVantage = point.vantage;
let s = new MonsterSpawner(table);
assert.equal(run(s, 10, far).length, 0, 'out of trigger radius: no spawn');
assert.equal(run(s, 10, near).length, 0, 'inside minDistance: no pop-in');
assert.equal(run(s, 10, atVantage, () => true).length, 0, 'never spawns inside the live frame');
const spawned = run(s, SPAWN_TUNING.interval + .5, atVantage);
assert.equal(spawned.length, 1); assert.equal(spawned[0]!.kind, 'spawn');
assert.equal(run(s, 5, atVantage).filter(e => e.kind === 'spawn').length, 0, 'one live individual per point');
const gone = run(s, 20, atVantage).find(e => e.kind === 'despawn');
assert.equal(gone?.reason, 'lifetime');
assert.equal(run(s, 20, atVantage).filter(e => e.kind === 'spawn').length, 0, 'cooldown holds');
assert.equal(run(s, 15, atVantage).filter(e => e.kind === 'spawn').length, 1, 'spawns again after cooldown');
assert.equal(run(s, 1, far)[0]?.reason, 'distance', 'leaves when the pod goes far');
console.log('PASS trigger: distance window, no in-frame spawn, single live individual, lifetime, cooldown, distance leave');

// 刷怪事件携带视频提示词所需的全部参数，且同一种子同一结果
const required: (keyof MonsterVideoParams)[] = ['site', 'pointId', 'instanceId', 'seedKey', 'tier', 'speciesId', 'speciesZh', 'speciesName', 'dread', 'size', 'spawnDepth', 'label', 'setting'];
for (const t of SPAWN_TABLES) {
  const a = new MonsterSpawner(t), b = new MonsterSpawner(t);
  for (const p of t.points) {
    const ma = a.force(p.id)!, mb = b.force(p.id)!, v = ma.video, e = findSpecies(p.tier, v.speciesId)!;
    for (const k of required) assert(v[k] !== undefined && v[k] !== '', `${p.id}: missing ${k}`);
    assert.deepEqual(v, mb.video, `${p.id}: spawning must be deterministic`);
    assert(e && v.tier === p.tier && v.size.length === e.length && v.size.height === e.height, `${p.id}: params must match the lexicon entry`);
    assert(!p.maxLength || e.length <= p.maxLength, `${p.id}: species too large for its space`);
    assert.equal(v.spawnDepth, t.datum - p.position[1]);
    if (p.tier === 1) assert(v.sci, `${p.id}: tier 1 must carry the real scientific name`); else assert(v.base, `${p.id}: tier 2/3 must carry the marine body plan`);
    assert(v.label.includes(v.instanceId) && v.label.includes(p.setting));
    const optics = {depth: v.spawnDepth, view: {distance: 12, fovDeg: 64, aspect: 1024 / 720, lamp: true, screen: [0, 0] as const}};
    const text = spawnedMonsterSubject(v, optics);
    assert.equal(text, spawnedMonsterSubject(mb.video, optics), `${p.id}: prompt must be stable for one individual`);
    assert(text.startsWith(v.label + ':') && text.includes('LENS:') && text.includes(e.look), `${p.id}: subject must use the locked species and live optics`);
    assert(spawnShotRange(p.tier, e.length) >= 14);
  }
}
// 不同个体会换物种（随机抽取仍然在工作）
const roll = new MonsterSpawner(HARBOR_SPAWN_TABLE), species = new Set<string>();
for (let i = 0; i < 24; i++) species.add(roll.force('harbor.t2.north-gallery')!.video.speciesId);
assert(species.size >= 6, `only ${species.size} species across 24 spawns`);
console.log(`PASS params: ${required.length} fields per spawn, deterministic per seed, locked species stable across shots, ${species.size} species over 24 respawns`);

// 存档读档：继续跑结果一致
s = new MonsterSpawner(HARBOR_SPAWN_TABLE);
run(s, 30, HARBOR_SPAWN_TABLE.points[3]!.vantage); s.force('harbor.t1.entry-pool');
const snap = s.snapshot(), copy = new MonsterSpawner(HARBOR_SPAWN_TABLE);
assert(copy.restore(structuredClone(snap)));
const pod = HARBOR_SPAWN_TABLE.points[0]!.vantage;
assert.deepEqual(run(copy, 40, pod).map(e => [e.kind, e.id]), run(s, 40, pod).map(e => [e.kind, e.id]));
assert.deepEqual(copy.active, s.active);
assert(!new MonsterSpawner(LIVING_SPAWN_TABLE).restore(snap), 'snapshot of another site rejected');
assert(!copy.restore({...snap, live: [{...snap.live[0], pointId: 'nope'}]}), 'unknown point rejected');
console.log('PASS save: snapshot round trip replays identically; foreign or broken snapshots rejected');

// 被动声纳：只有方位与声纹，没有距离
s = new MonsterSpawner(HARBOR_SPAWN_TABLE); const m3 = s.force('harbor.t3.deep-shaft')!;
const contacts = spawnPassiveContacts(s.passiveContacts(HARBOR_SPAWN_TABLE.points[3]!.vantage, 0));
assert.equal(contacts.length, 1);
assert.equal(contacts[0]!.id, m3.id); assert.equal(contacts[0]!.kind, 'unknown'); assert.equal(contacts[0]!.label, '???');
assert(!/\d+\s*(m|米)/.test(JSON.stringify(contacts)), 'passive contact must not leak range');
assert(contacts[0]!.frequency >= 35 && contacts[0]!.frequency <= 45);
assert.equal(s.passiveContacts([m3.position[0] + 500, 0, 0], 0).length, 0, 'out of hearing range');
console.log('PASS sonar: unregistered bearing-only contact, no range text, inside 35–45 kHz band');

// 提交预算：正典生物 + 刷出个体填满预算后整卷仍不超 7000
const optics = {depth: 1040, view: {distance: 20, fovDeg: 64, aspect: 1024 / 720, lamp: true, screen: [.4, -.2] as const}};
const longest = (tier: 1 | 2 | 3) => [...LEXICON[tier]].sort((a, b) => b.look.length + b.move.length + (b.scale?.length ?? 0) - a.look.length - a.move.length - (a.scale?.length ?? 0))[0]!;
const fake = (tier: 1 | 2 | 3, i: number): string => composeMonsterSubject({tier, depth: 1900, seedKey: 'w' + i, label: `Leviathan-class presence, exactly one individual [living.t${tier}.descent-shaft#${i}], ${LIVING_SPAWN_TABLE.points[3]!.setting}`, view: optics.view, speciesId: longest(tier).id}).text;
const fixed = [videoCreatureSubject('blind', 'living:blind.a1', 'One individual [blind.a1]', optics), videoCreatureSubject('lumen', 'living:lumen.a1', 'One individual [lumen.a1]', optics)];
const monsters = fitSpawnSubjects(fixed, [fake(3, 1), fake(2, 2), fake(2, 3), fake(1, 4)]);
assert(monsters.length > fixed.length, 'at least one spawned subject fits beside two canon creatures');
assert(monsters.reduce((n, x) => n + x.length + 2, 0) <= SHOT_MONSTER_BUDGET || monsters.length === fixed.length);
const ctx: VideoContext = {generatedMonsters: true, story: true, settled: true, stateKey: 's', nearestMonster: 20, depth: 1040, scene: 'Fully submerged deep-sea living deck in dark water, exactly the room and framing shown in the first frame.', actors: [], monsters, outcome: 'Record current visible objects only; do not reveal hidden documents or future actions.'};
const prompt = 'Dark, murky deep-sea ROV footage: dim blue-black water, soft scattered light, nothing brightly lit. Use the attached image as an environment and camera reference, not an exact opening frame. Add only the described generated creatures; preserve the architecture and camera, but relight it as LIGHTING describes. ' + lockVideoCamera(buildFootagePrompt({videoContext: ctx} as never));
assert(prompt.length <= 7000, `spawn-filled prompt ${prompt.length} exceeds 7000`);
console.log(`PASS budget: ${monsters.length} monster slots (${monsters.length - fixed.length} spawned) → ${prompt.length}/7000 chars`);
