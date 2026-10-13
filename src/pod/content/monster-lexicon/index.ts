import {bodyClass, composeAtoms} from './atoms';
import {DEPTH_PRESENTATION, PREFERRED_DREAD, depthBand, depthWrongness, presentation, type DepthBand} from './depth';
import {frameSubject, type Framing} from './framing';
import {composeMotion} from './motion';
import {TIER1_FAUNA} from './tier1-fauna';
import {TIER2_ABYSSAL} from './tier2-abyssal';
import {TIER3_LEVIATHAN} from './tier3-leviathan';
import type {DangerTier, LensView, LexiconEntry} from './types';

export type {DangerTier, LensView, LexiconEntry} from './types';
export {DEPTH_BANDS, DEPTH_PRESENTATION, depthBand, type DepthBand} from './depth';
export {frameSubject, LAMP_RANGE, BEAM_EDGE, type Framing, type ShotScale} from './framing';
export {COLOUR_ATOMS, LIGHT_ATOMS, MATERIAL_ATOMS, WEAR_ATOMS, atomLibrary, bodyClass, type BodyClass} from './atoms';
export {ABYSSAL_WRONGNESS, LEVIATHAN_WRONGNESS, wrongnessLibrary} from './depth';
export {MOTION_FAMILY, MOTION_POOLS, motionFamily, motionLibrary, type MotionFamily} from './motion';

export const LEXICON: Readonly<Record<DangerTier, readonly LexiconEntry[]>> = {1: TIER1_FAUNA, 2: TIER2_ABYSSAL, 3: TIER3_LEVIATHAN};

/** 二三级的海洋解剖收束已并入 slotPrompt 通用怪物句，逐只重复会让三怪同框超限；一级仍需逐只锁定物种 */
const FAUNA_GUARD = 'Anatomy stays exactly true to the catalogued species; nothing exaggerated or added.';

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** mulberry32：同一种子必须给同一序列，否则同一只怪物两次曝光会换物种 */
function seeded(seed: number): () => number {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weight(entry: LexiconEntry, tier: DangerTier, band: DepthBand, depth: number): number {
  const w = 1 / (1 + (entry.dread - PREFERRED_DREAD[band]) ** 2);
  const native = tier === 1 && entry.depth && depth >= entry.depth[0] && depth <= entry.depth[1];
  return native ? w * 2 : w;
}

/**
 * 抽取物种。seedKey 必须是该怪物的稳定标识（关卡 + 怪物 id），
 * 同一 seedKey、等级与深度档永远抽到同一物种。
 */
export function rollSpecies(tier: DangerTier, depth: number, seedKey: string, fit?: (entry: LexiconEntry) => boolean): LexiconEntry {
  const fitted = fit ? LEXICON[tier].filter(fit) : LEXICON[tier];
  const pool = fitted.length ? fitted : LEXICON[tier], band = depthBand(depth), rand = seeded(hash(`${seedKey}|${tier}|${band}`));
  const weights = pool.map(e => weight(e, tier, band, depth));
  let pick = rand() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) if ((pick -= weights[i]!) <= 0) return pool[i]!;
  return pool[pool.length - 1]!;
}

export function findSpecies(tier: DangerTier, id: string): LexiconEntry | undefined {
  return LEXICON[tier].find(e => e.id === id);
}

const metres = (m: number) => m < 1 ? `${Math.round(m * 100)} cm` : m < 20 ? `${+m.toFixed(1)} m` : `${Math.round(m)} m`;

function header(tier: DangerTier, e: LexiconEntry): string {
  if (tier === 1) return `ordinary catalogued deep-sea fauna, not supernatural: one real ${e.name} (${e.sci}), about ${metres(e.length)} long.`;
  if (tier === 2) return `medium-size abyssal deep-sea organism, about ${metres(e.length)} long, on the body plan of a ${e.base}.`;
  return `leviathan-class abyssal deep-sea organism, about ${metres(e.length)} long, on the body plan of a ${e.base}.`;
}

export interface MonsterPromptInput {
  readonly tier: DangerTier;
  /** 玩家当前深度，米 */
  readonly depth: number;
  /** 稳定种子：关卡 + 怪物 id */
  readonly seedKey: string;
  /** 槽位标签，例如 'One individual [living.c3]' */
  readonly label: string;
  /** 实测光学关系；缺省时不写构图 */
  readonly view?: LensView;
  /** 强制指定物种 id（剧情需要固定外观时） */
  readonly speciesId?: string;
}

export interface MonsterPrompt {
  readonly entry: LexiconEntry;
  readonly band: DepthBand;
  readonly framing?: Framing;
  readonly text: string;
}

export function composeMonsterSubject(input: MonsterPromptInput): MonsterPrompt {
  const {tier, depth, seedKey, label, view} = input;
  const entry = (input.speciesId && findSpecies(tier, input.speciesId)) || rollSpecies(tier, depth, seedKey);
  const band = depthBand(depth);
  const wrong = depthWrongness(tier, band, seeded(hash(`${seedKey}|${entry.id}|wrong|${band}`)), entry.look, bodyClass(entry));
  const framing = view ? frameSubject(entry, view) : undefined;
  const atoms = composeAtoms(tier, entry, tag => seeded(hash(`${seedKey}|${entry.id}|${tag}`)), view, framing);
  const parts = [
    `${label}: ${header(tier, entry)}`,
    `Anatomy: ${entry.look}.`,
    wrong.length ? `Depth-born wrongness: ${wrong.join('; ')}.` : '',
    ...atoms,
    composeMotion(tier, entry, seeded(hash(`${seedKey}|${entry.id}|motion|${band}|${view ? Math.round(view.distance / 3) : '-'}`))),
    entry.scale ? `Megalophobia: ${entry.scale}.` : '',
    tier === 1 ? presentation(tier, band) : '',
    framing?.text ?? '',
    tier === 1 ? FAUNA_GUARD : '',
  ];
  return {entry, band, framing, text: parts.filter(Boolean).join(' ')};
}

/** 有正典档案的生物：解剖锁定，只追加深度呈现与构图 */
export function canonOptics(size: {readonly length: number; readonly height: number}, depth: number, view?: LensView): string {
  return [DEPTH_PRESENTATION[depthBand(depth)], view ? frameSubject(size, view).text : ''].filter(Boolean).join(' ');
}
