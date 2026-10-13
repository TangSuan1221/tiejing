import {mkdirSync, writeFileSync} from 'node:fs';
import {composeMonsterSubject, type DangerTier} from '../src/pod/content/monster-lexicon';
import {buildFootagePrompt} from '../src/pod/content/footage';
import {lockVideoCamera} from '../src/pod/content/fixed-camera';
import type {VideoContext} from '../src/pod/content/video-policy';

// 首关测试提示词：与游戏同一管线（slotPrompt + 镜头/风格/配色 + 固定机位 + 参考帧前缀），游戏画面比例 1024×720、64° 竖直视场、开灯。
// 用法：npx tsx qa/monster-test-prompts.ts [每级条数=3]；每次运行随机种子。
// 指定物种对照：npx tsx qa/monster-test-prompts.ts fixed <等级> <物种id> <距离m>，输出 tier<等级>-<物种id>.txt
const fixed = process.argv[2] === 'fixed' ? {tier: Number(process.argv[3]) as 2 | 3, id: process.argv[4]!, distance: Number(process.argv[5] ?? 6)} : null;
const count = fixed ? 1 : Number(process.argv[2] ?? 3);
const distances: Record<2 | 3, number[]> = {2: [6, 9, 13], 3: [25, 40, 60]};
const dir = 'qa/harbor-prompt/random';
mkdirSync(dir, {recursive: true});
const run = Date.now().toString(36);
for (const tier of fixed ? [fixed.tier] : [2, 3] as const) for (let i = 0; i < count; i++) {
  const seed = `test:${run}:${tier}:${i}:${Math.random().toString(36).slice(2, 8)}`, distance = fixed?.distance ?? distances[tier][i % 3]!;
  const label = tier === 3 ? `Leviathan-class presence, exactly one individual [test.t3.${i + 1}]` : `One individual [test.t2.${i + 1}]`;
  const monster = composeMonsterSubject({tier: tier as DangerTier, depth: 1012, seedKey: seed, label, view: {distance, fovDeg: 64, aspect: 1024 / 720, lamp: true}, speciesId: fixed?.id});
  const ctx: VideoContext = {generatedMonsters: true, story: true, settled: false, stateKey: seed, nearestMonster: distance, depth: 1012,
    scene: 'Fully submerged deep-sea industrial harbor in dark water, no air or water surface; broken partition bridge and cargo isolation grille. Preserve the current camera image.',
    actors: [], monsters: [monster.text], outcome: 'Record only the present positions; no predicted escape or attack.'};
  const prompt = 'Dark, murky deep-sea ROV footage: dim blue-black water, soft scattered light, nothing brightly lit. Use the attached image as an environment and camera reference, not an exact opening frame. Add only the described generated creatures; preserve the architecture and camera, but relight it as LIGHTING describes. ' + lockVideoCamera(buildFootagePrompt({videoContext: ctx} as never));
  const file = `${dir}/tier${tier}-${fixed ? fixed.id : i + 1}.txt`;
  writeFileSync(file, prompt);
  console.log(`${file}\t${monster.entry.id}\t${monster.entry.zh}\t${distance}m\t${monster.framing?.shot}\t${prompt.length}`);
  console.log(`MONSTER\t${monster.text}`);
}
