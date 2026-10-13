import assert from 'node:assert/strict';
import {LEXICON, composeMonsterSubject, rollSpecies, findSpecies, frameSubject, depthBand, DEPTH_PRESENTATION, MOTION_FAMILY, motionFamily, motionLibrary, MATERIAL_ATOMS, WEAR_ATOMS, COLOUR_ATOMS, LIGHT_ATOMS, ABYSSAL_WRONGNESS, LEVIATHAN_WRONGNESS, atomLibrary, bodyClass, wrongnessLibrary, type DangerTier} from '../src/pod/content/monster-lexicon';
import {depthWrongness} from '../src/pod/content/monster-lexicon/depth';
import {videoCreatureSubject, lexiconCreatureSubject, VIDEO_CREATURE_TIER} from '../src/pod/content/video-creatures';
import {buildFootagePrompt} from '../src/pod/content/footage';
import {lockVideoCamera} from '../src/pod/content/fixed-camera';
import type {VideoContext} from '../src/pod/content/video-policy';

const MIN = {1: 100, 2: 50, 3: 32} as const;
const COLOUR = /\b(green|greenish|teal|cyan|emerald|olive|lime|turquoise|aqua)\b/i;
const LAND = /\b(legs?|paws?|claws?|fur|furry|feathers?|walk\w*|crawl\w*|stand\w*|hooves|hoof|mammal|reptile|lizard|frog|toad|tadpole|crocodile|dinosaur|dog|wolf|spider|insect|shark|dolphin|whales?|humans?|humanoid|hands?|fingers?|skull|face|faces|god|deity|cult|worship|altar|rune|priest)\b/i;
const FAUNA_BAN = /\b(shark|dolphin|god|deity|cult|altar)\b/i;

const ids = new Set<string>();
for (const tier of [1, 2, 3] as DangerTier[]) {
  const pool = LEXICON[tier];
  assert(pool.length >= MIN[tier], `tier ${tier} has ${pool.length} entries, needs ${MIN[tier]}`);
  for (const e of pool) {
    assert(!ids.has(e.id), `duplicate id ${e.id}`); ids.add(e.id);
    assert(e.zh && e.name && e.look && e.move, `${e.id} missing text`);
    assert(e.length > 0 && e.height > 0, `${e.id} missing size`);
    const body = [e.name, e.look, e.move, e.scale ?? ''].join(' ');
    assert(!COLOUR.test(body), `${e.id} uses an off-palette colour: ${body.match(COLOUR)?.[0]}`);
    if (tier === 1) {
      assert(e.sci && e.depth, `${e.id} needs sci name and real depth range`);
      assert(!FAUNA_BAN.test(body), `${e.id} conflicts with the generic slot bans: ${body.match(FAUNA_BAN)?.[0]}`);
    } else {
      assert(e.base, `${e.id} needs a real deep-sea base taxon`);
      assert(!LAND.test(body), `${e.id} reads as land / human / religious: ${body.match(LAND)?.[0]}`);
      assert(e.length >= (tier === 2 ? 2 : 60) && e.length <= (tier === 2 ? 20 : 2500), `${e.id} length ${e.length} m out of tier ${tier} range`);
    }
    if (tier === 3) assert(e.scale, `${e.id} needs a megalophobia scale cue`);
  }
}
for (const band of [0, 1, 2, 3, 4] as const) {
  assert(!COLOUR.test(DEPTH_PRESENTATION[band]) && !LAND.test(DEPTH_PRESENTATION[band]), `presentation band ${band} wording`);
  for (const tier of [2, 3] as DangerTier[]) {
    for (let s = 0; s < 40; s++) {
      let i = s; const rand = () => ((i = (i * 9301 + 49297) % 233280) / 233280);
      for (const w of depthWrongness(tier, band, rand)) assert(!LAND.test(w) && !COLOUR.test(w), `wrongness wording: ${w}`);
    }
  }
}
console.log(`PASS lexicon: tier1 ${LEXICON[1].length} real species, tier2 ${LEXICON[2].length} abyssal, tier3 ${LEXICON[3].length} leviathan; marine-only wording, palette clean`);

// 同一怪物稳定；不同怪物有足够多样性
for (const tier of [1, 2, 3] as DangerTier[]) {
  assert.equal(rollSpecies(tier, 1040, 'living:c1').id, rollSpecies(tier, 1040, 'living:c1').id);
  const seen = new Set(Array.from({length: 300}, (_, i) => rollSpecies(tier, 1500, 'probe:' + i).id));
  assert(seen.size >= Math.min(25, LEXICON[tier].length * .5), `tier ${tier} variety only ${seen.size}`);
}
// 越深越吓人
const meanDread = (tier: DangerTier, depth: number) => Array.from({length: 400}, (_, i) => rollSpecies(tier, depth, 'd:' + i).dread).reduce((a, b) => a + b, 0) / 400;
for (const tier of [1, 2, 3] as DangerTier[]) {
  const shallow = meanDread(tier, 1012), deep = meanDread(tier, 1900);
  // 三级词条压迫度只分 4/5 两档，抽取差幅天然较小；三级主要靠异化条数随深度递增
  assert(deep > shallow + (tier === 3 ? .2 : .5), `tier ${tier} dread does not rise with depth (${shallow.toFixed(2)} -> ${deep.toFixed(2)})`);
}
const wrongCount = (tier: DangerTier, depth: number) => composeMonsterSubject({tier, depth, seedKey: 'w', label: 'x'}).text.split('Depth-born wrongness:')[1]?.split('.')[0]?.split(';').length ?? 0;
for (const tier of [2, 3] as DangerTier[]) assert(wrongCount(tier, 1900) > wrongCount(tier, 1012), `tier ${tier} wrongness count does not rise with depth`);
assert.equal(wrongCount(1, 1900), 0, 'real fauna must not receive invented anatomy');
for (const tier of [2, 3] as DangerTier[]) for (const e of LEXICON[tier].filter(e => /no eyes|eyeless/i.test(e.look))) for (let s = 0; s < 30; s++) {
  const wrong = composeMonsterSubject({tier, depth: 1900, seedKey: 'eye' + s, label: 'x', speciesId: e.id}).text.split('Depth-born wrongness:')[1]?.split('. Motion:')[0] ?? '';
  assert(!/\beyes?\b|\bpupil\b/i.test(wrong), `${e.id} is eyeless but received: ${wrong}`);
}
assert.equal(depthBand(1012), 0); assert.equal(depthBand(1460), 2); assert.equal(depthBand(2000), 4);
console.log('PASS selection: stable per creature, varied across creatures, dread and wrongness rise with depth');

// 构图：距离加倍占比减半；变焦放大；巨物近距离只能拍到局部
const size = {length: 3, height: 1};
const near = frameSubject(size, {distance: 6, fovDeg: 64, aspect: 16 / 9, lamp: true});
const far = frameSubject(size, {distance: 12, fovDeg: 64, aspect: 16 / 9, lamp: true});
const zoom = frameSubject(size, {distance: 12, fovDeg: 20, aspect: 16 / 9, lamp: true});
assert(Math.abs(near.fillW / far.fillW - 2) < 1e-9, 'fill does not scale with 1/distance');
assert(zoom.fillW > far.fillW * 3, 'zoom does not enlarge subject');
assert.match(near.text, /LENS: fixed 64° vertical/);
const lev = rollSpecies(3, 1600, 'lev');
assert(['fragment', 'partial'].includes(frameSubject(lev, {distance: 30, fovDeg: 64, aspect: 16 / 9, lamp: true}).shot), 'leviathan fits the frame at 30 m');
const tiny = frameSubject({length: .1, height: .02}, {distance: 20, fovDeg: 64, aspect: 16 / 9, lamp: true});
assert.equal(tiny.shot, 'tiny');
assert.match(frameSubject(size, {distance: 40, fovDeg: 64, aspect: 16 / 9, lamp: true}).text, /silhouette/);
assert.match(frameSubject(size, {distance: 4, fovDeg: 64, aspect: 16 / 9, lamp: true, screen: [-.7, .6]}).text, /upper left third/);
console.log('PASS framing: 1/distance fill, zoom FOV, leviathan fragment at 30 m, beam falloff, screen placement');

// 正典生物：解剖原文不变，只追加呈现与构图
// 关卡固定怪物同样只从词典抽取：与故事、3D模型无关；同一种子稳定
const view = {distance: 8, fovDeg: 64, aspect: 16 / 9, lamp: true};

// 动作词库：每个词条都有构型；同一机位稳定，换机位能换动作；一级不带捕食者意图；动作不以张嘴为主
for (const tier of [1, 2, 3] as DangerTier[]) for (const e of LEXICON[tier]) {
  assert(motionFamily(e), `${e.id} has no motion family`);
  const lib = motionLibrary(tier, e);
  assert(lib.idle.length >= 3 && lib.shift.length >= 2 && lib.detail.length >= 2, `${e.id} motion library too small`);
  for (const m of [...lib.idle.slice(1), ...lib.shift, ...lib.detail]) assert(!LAND.test(m) && !COLOUR.test(m), `${e.id} motion uses land or colour wording: ${m}`);
  // 掠过镜头/横穿画面会被模型拍成同一种“从镜头前游过”，二三级一律原地动作
  const FLYBY = /\b(past|passes|passing|across the (frame|lens)|through the frame|out of the beam tail|slides? forward)\b/i;
  if (tier > 1) for (const m of [...lib.idle, ...lib.shift, ...lib.detail, e.scale ?? '']) assert(!FLYBY.test(m), `${e.id} motion is a fly-by: ${m}`);
  if (tier > 1) assert(!/\b(opens?|opening|snaps?|snapping)\b[^;]{0,30}\b(mouth|jaws?|hood)\b|\bjaws? (slowly )?open/i.test(e.move), `${e.id} signature motion is a mouth action: ${e.move}`);
}
for (const id of Object.keys(MOTION_FAMILY)) assert([1, 2, 3].some(t => findSpecies(t as DangerTier, id)), `motion family maps unknown id ${id}`);
for (const e of LEXICON[1]) assert(!motionLibrary(1, e).shift.some(s => /toward the light|closer|nearer/.test(s)), `${e.id} tier-1 motion shows predatory intent`);
{
  const motions = new Set<string>();
  for (let d = 4; d <= 40; d += 3) motions.add(composeMonsterSubject({tier: 2, depth: 1012, seedKey: 'motion', label: 'x', view: {...view, distance: d}}).text.match(/Motion: [^.]*\./)![0]);
  assert(motions.size >= 4, `motion does not vary across camera positions (${motions.size})`);
  const a = composeMonsterSubject({tier: 2, depth: 1012, seedKey: 'motion', label: 'x', view}).text;
  assert.equal(a, composeMonsterSubject({tier: 2, depth: 1012, seedKey: 'motion', label: 'x', view}).text, 'motion not stable for one camera position');
  assert(/; later .+; throughout, /.test(a), 'motion lacks the three beats');
}
console.log('PASS motion: every species mapped to a deep-sea motion family, three beats, varied by camera position, no mouth-only signatures');
for (const [kind, seed] of [['harbor', 'harbor:hunter'], ['lumen', 'living:lumen.r1'], ['shade', 'living:shade.r4'], ['blind', 'living:blind.a1'], ['swarm', 'living:swarm.s1']] as const) {
  const text = videoCreatureSubject(kind, seed, 'One individual [x]', {depth: 1040, view});
  const entry = composeMonsterSubject({tier: VIDEO_CREATURE_TIER[kind], depth: 1040, seedKey: seed, label: 'One individual [x]', view});
  assert.equal(text, entry.text, `${kind} is not drawn from the lexicon`);
  assert(LEXICON[VIDEO_CREATURE_TIER[kind]].includes(entry.entry) && text.includes('LENS:'));
  assert.equal(text, videoCreatureSubject(kind, seed, 'One individual [x]', {depth: 1040, view}), `${kind} species is not stable`);
  assert(!/\b(overalls?|robe|clothes|clothing|uniform|torso|humanoid)\b/i.test(text), `${kind} reads as human / dressed`);
}

// 提交上限：一只利维坦 + 两只中型 + 完整固定前后缀
const optics = {depth: 1700, view: {distance: 25, fovDeg: 64, aspect: 16 / 9, lamp: true}};
const monsters = [lexiconCreatureSubject(3, 'a', 'Leviathan, exactly one', optics), lexiconCreatureSubject(2, 'b', 'One individual [b]', optics), lexiconCreatureSubject(2, 'c', 'One individual [c]', optics)];
const ctx: VideoContext = {generatedMonsters: true, story: true, settled: true, stateKey: 's', nearestMonster: 25, depth: 1700, scene: 'Fully submerged deep-sea facility in dark water.', actors: [], monsters, outcome: 'Record only the present positions.'};
const prompt = 'Dark, murky deep-sea ROV footage: dim blue-black water, soft scattered light, nothing brightly lit. Use the attached image as an environment and camera reference, not an exact opening frame. Add only the described generated creatures; preserve the architecture and camera, but relight it as LIGHTING describes. ' + lockVideoCamera(buildFootagePrompt({videoContext: ctx} as any));
assert(prompt.length <= 7000, `worst-case prompt ${prompt.length} chars exceeds 7000`);
// 原子随种子变长变短：扫描距离、深度与种子，任一组合都不得超限
let sweepMax = 0;
for (const distance of [4, 8, 12, 20, 25, 40]) for (const depth of [1012, 1700]) for (let s = 0; s < 80; s++) {
  const o = {depth, view: {distance, fovDeg: 64, aspect: 16 / 9, lamp: true}};
  const m = [lexiconCreatureSubject(3, 'a' + s, 'Leviathan, exactly one', o), lexiconCreatureSubject(2, 'b' + s, 'One individual [b]', o), lexiconCreatureSubject(2, 'c' + s, 'One individual [c]', o)];
  const p = 'Dark, murky deep-sea ROV footage: dim blue-black water, soft scattered light, nothing brightly lit. Use the attached image as an environment and camera reference, not an exact opening frame. Add only the described generated creatures; preserve the architecture and camera, but relight it as LIGHTING describes. ' + lockVideoCamera(buildFootagePrompt({videoContext: {...ctx, depth, nearestMonster: distance, monsters: m}} as any));
  sweepMax = Math.max(sweepMax, p.length);
}
assert(sweepMax <= 7000, `atom sweep prompt ${sweepMax} chars exceeds 7000`);
// 硬件名词会被画进画面（摄像机、灯头、舱窗暗角）；平静呈现会让克系怪物像普通鱼
assert(!/floodlight|lens port|hull camera|bolted|housing|mm full-frame|porthole rim/i.test(prompt), `prompt names recording hardware: ${prompt.match(/floodlight|lens port|hull camera|bolted|housing|mm full-frame|porthole rim/i)?.[0]}`);
// 渲染术语（UE5、PBR、volumetric、cinematic）会让模型出CG质感；必须写成真实纪录片/实拍录像
assert(/genuine deep-sea expedition footage/.test(prompt) && /not CGI, not a 3D render/.test(prompt), 'prompt lacks the real-footage look');
// 深海打光（用户对照样片 2026-10-13）：浑水散射的柔和蓝雾，主体与环境同光、不比周围亮，远处隐入深蓝而非死黑；
// 单束硬光 + 死黑背景会被拍成舞台聚光（用户否决）
assert(/scattered by turbid water/.test(prompt) && /never a spotlight/.test(prompt) && /share the same light and blue haze/.test(prompt) && /never a black void/.test(prompt) && /No stage, studio or aquarium lighting/.test(prompt), 'prompt lacks murky scattered deep-sea lighting');
assert(/relight it as LIGHTING describes/.test(prompt) && !/camera and lighting/.test(prompt), 'environment reference keeps the screenshot lighting');
assert(!/micro-detail sharp|hard side light|lit hard|crushed near-black|far side black/.test(prompt), 'prompt asks for stage-like spotlighting');
assert(!/Unreal|physically based|volumetric|cinematic|photorealistic/i.test(prompt), `prompt uses render vocabulary: ${prompt.match(/Unreal|physically based|volumetric|cinematic|photorealistic/i)?.[0]}`);
// 均匀哑光单色会被画成塑料玩具；必须写明真实组织、黏液反光、斑驳色素与单侧光照，并禁止掠过镜头
// 质感问题不在颜色：平滑大渐变、不透明厚皮、充气体态、实心鳍齿会被画成玩具鱼
// “标本微距照片”会被画成黑底闪光灯均匀打亮的影棚照（用户出片反馈），只能比作浑水里的 ROV 实拍
assert(!/macro photograph|specimen photo(?!,)|high-frequency micro-detail/.test(prompt.replace('not a lit specimen photo', '')), 'prompt invites studio specimen photography');
assert(/never a toy fish, rubber, vinyl, clay or airbrushed CG/.test(prompt) && /filmed by a deep-sea ROV in murky water/.test(prompt) && /partly see-through skin/.test(prompt) && /never inflated, chunky or smoothly rounded/.test(prompt), 'prompt lacks specimen material');
assert(!/exposed nerves/.test(prompt), 'filaments read as surface decals');
assert(/never swims across, past or out of the frame/.test(prompt), 'prompt allows fly-by motion');
assert(!/wrinkled folds|eroded rock/.test(prompt), 'prompt keeps clay-fold wording');
for (const tier of [2, 3] as DangerTier[]) {
  const t = composeMonsterSubject({tier, depth: 1012, seedKey: 'calm', label: 'x'}).text;
  assert(!/calm|plainly observed|watches the lens/i.test(t), `tier ${tier} reads as calm fauna or a posed portrait`);
  assert((t.split('Depth-born wrongness:')[1]?.split('.')[0]?.split(';').length ?? 0) >= 2 && /Material: .+ Colour: /.test(t), `tier ${tier} lacks concrete horror and specimen traits at shallow depth`);
}

// 原子化拼装：每个标签一池短句，按体型与原型结构过滤，按种子稳定抽取
{
  const all = [
    ...Object.values(MATERIAL_ATOMS).flat(), ...Object.values(WEAR_ATOMS).flat(), ...Object.values(COLOUR_ATOMS).flat(), ...LIGHT_ATOMS,
    ...ABYSSAL_WRONGNESS.map(w => w.text), ...LEVIATHAN_WRONGNESS.map(w => w.text),
  ];
  for (const a of all) assert(!LAND.test(a) && !COLOUR.test(a) && !/wrinkled folds|eroded rock|exposed nerves|\bpast\b|across the frame/i.test(a), `atom wording: ${a}`);
  const counts = {material: Object.values(MATERIAL_ATOMS).flat().length, wear: Object.values(WEAR_ATOMS).flat().length, colour: new Set(Object.values(COLOUR_ATOMS).flat()).size, light: LIGHT_ATOMS.length, detail: ABYSSAL_WRONGNESS.length + LEVIATHAN_WRONGNESS.length};
  assert(counts.material >= 70 && counts.wear >= 35 && counts.colour >= 20 && counts.light >= 10 && counts.detail >= 60, `atom banks too small ${JSON.stringify(counts)}`);
  const NOT_GEL = /\b(gills?|gill slits|lateral[- ]line|scales?|fin rays?|jaws?)\b/i;
  for (const tier of [1, 2, 3] as DangerTier[]) for (const e of LEXICON[tier]) {
    const lib = atomLibrary(tier, e), cls = bodyClass(e);
    assert(lib.material.length >= 5 && lib.wear.length >= 2, `${e.id} atom library too small (${lib.material.length} material, ${lib.wear.length} wear)`);
    if (tier > 1) assert(lib.colour.length >= 6, `${e.id} colour library too small`);
    else assert(!lib.colour.length && !lib.light.length, `${e.id} real fauna receives invented colour or light`);
    const detail = wrongnessLibrary(tier, 4, e.look, cls).map(w => w.text);
    const body = `${e.look} ${e.move}`;
    for (const a of [...lib.material, ...lib.wear, ...detail]) {
      if (cls === 'gel') assert(!NOT_GEL.test(a), `${e.id} (gel) receives fish anatomy: ${a}`);
      if (/\bbell\b/.test(a)) assert(/\bbell/i.test(body), `${e.id} has no bell but receives: ${a}`);
      if (/\bjawless\b/i.test(body)) assert(!/\bjaws?\b/i.test(a), `${e.id} is jawless but receives: ${a}`);
      if (/\bscales?\b/i.test(a) && cls === 'fish') assert(/\bscales?\b|\bscaled\b/i.test(e.look), `${e.id} receives scales it does not have: ${a}`);
    }
  }
  const at = (seedKey: string, depth: number, distance: number, tier: DangerTier = 2) => composeMonsterSubject({tier, depth, seedKey, label: 'x', view: {...view, distance}}).text;
  const lines = (t: string) => t.match(/(Material|Colour|Wear|Light): [^.]*\./g)?.join(' ') ?? '';
  assert.equal(lines(at('atom', 1012, 8)), lines(at('atom', 1012, 8)), 'atoms not stable');
  for (const tier of [2, 3] as DangerTier[]) for (const depth of [1012, 1460, 1900]) for (let s = 0; s < 120; s++) {
    const w = (at('dup' + s, depth, 6, tier).split('Depth-born wrongness: ')[1] ?? '').split('. ')[0]!.split('; ');
    assert.equal(new Set(w).size, w.length, `duplicate detail atom: ${w.join(' | ')}`);
  }
  assert.equal(lines(at('atom', 1012, 8)), lines(at('atom', 1900, 8)), 'atoms change with depth band; they are the creature identity');
  assert(/Material: [^;.]+; /.test(at('atom', 1012, 6)) && !/Material:/.test(at('atom', 1012, 40)), 'atom count does not follow beam distance');
  for (const tier of [2, 3] as DangerTier[]) {
    const id = LEXICON[tier][0]!.id;
    const seen = new Set(Array.from({length: 200}, (_, i) => lines(composeMonsterSubject({tier, depth: 1500, seedKey: 'v' + i, label: 'x', view, speciesId: id}).text)));
    assert(seen.size >= 40, `tier ${tier} ${id}: one species only yields ${seen.size} atom combinations`);
  }
  console.log(`PASS atoms: ${counts.material} material, ${counts.colour} colour, ${counts.wear} wear, ${counts.light} light, ${counts.detail} detail; body-class fit, stable per creature, varied across seeds, scaled by beam distance`);
}
// 大而亮的眼睛会让模型画成卡通萌物
for (const tier of [2, 3] as DangerTier[]) for (const e of LEXICON[tier]) {
  assert(!/(huge|enormous|large|big|bulging|dinner-plate)[a-z ,-]{0,25}eyes?\b/i.test(e.look), `${e.id} describes big eyes: ${e.look.match(/(huge|enormous|large|big|bulging|dinner-plate)[a-z ,-]{0,25}eyes?/i)?.[0]}`);
}
let longest = 0;
for (const tier of [1, 2, 3] as DangerTier[]) for (const e of LEXICON[tier]) longest = Math.max(longest, composeMonsterSubject({tier, depth: 1900, seedKey: 'x', label: 'One individual [x]', view: optics.view, speciesId: e.id}).text.length);
console.log(`PASS budget: worst-case 3-subject prompt ${prompt.length}/7000 chars, atom sweep max ${sweepMax}/7000; longest single subject ${longest} chars`);
