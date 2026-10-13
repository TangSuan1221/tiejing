import {composeMonsterSubject, depthBand, DEPTH_BANDS, LEXICON, type DangerTier} from '../src/pod/content/monster-lexicon';

// npx tsx tools/monster-prompt-preview.ts --tier 3 --depth 1600 --distance 20 --zoom 1 --seed living:c1 [--lamp 0] [--species id] [--list]
const arg = (name: string, fallback: string) => {const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] ?? fallback : fallback;};
const tier = Number(arg('tier', '2')) as DangerTier;
if (process.argv.includes('--list')) {
  for (const e of LEXICON[tier]) console.log(`${e.id.padEnd(28)} ${e.zh}  ${e.length} m  dread ${e.dread}`);
  process.exit(0);
}
const depth = Number(arg('depth', '1040')), distance = Number(arg('distance', '12')), zoom = Number(arg('zoom', '1'));
const result = composeMonsterSubject({
  tier, depth, seedKey: arg('seed', 'preview'), label: 'One individual [preview]', speciesId: arg('species', '') || undefined,
  view: {distance, fovDeg: 64 / Math.max(.5, zoom), aspect: 16 / 9, lamp: arg('lamp', '1') !== '0'},
});
const band = DEPTH_BANDS[depthBand(depth)];
console.log(`[${result.entry.id}] ${result.entry.zh} · 等级${tier} · ${band.id} ${band.zh} · 景别 ${result.framing?.shot} · ${result.text.length} 字符\n`);
console.log(result.text);
