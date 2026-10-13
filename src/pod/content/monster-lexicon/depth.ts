import {fitAtom, type BodyClass} from './atoms';
import type {DangerTier} from './types';

/**
 * 深度分档按本作实际关卡深度划分（首关 1012 m、第二关 1040 m、后续航段 1120–1710 m，演示最深约 2000 m），
 * 不按真实海洋分层：真实分层会让全部关卡落在同一档。
 */
export const DEPTH_BANDS = [
  {max: 1100, id: 'D1', zh: '上层设施带'},
  {max: 1300, id: 'D2', zh: '中层沉降带'},
  {max: 1500, id: 'D3', zh: '深层断裂带'},
  {max: 1650, id: 'D4', zh: '底层压溃带'},
  {max: Infinity, id: 'D5', zh: '无光深渊带'},
] as const;

export type DepthBand = 0 | 1 | 2 | 3 | 4;

export function depthBand(depth: number): DepthBand {
  const i = DEPTH_BANDS.findIndex(b => depth < b.max);
  return (i < 0 ? 4 : i) as DepthBand;
}

/** 每档最偏好的压迫度。抽取权重围绕它衰减 */
export const PREFERRED_DREAD: Record<DepthBand, number> = {0: 1.5, 1: 2.5, 2: 3.3, 3: 4.2, 4: 5};

/**
 * 只改表演与呈现、不改解剖。一级真实物种和有正典档案的生物都只能用这一层，
 * 保证物种本身仍然可核对。
 */
export const DEPTH_PRESENTATION: Record<DepthBand, string> = {
  0: 'Presentation: plainly observed, calm, every feature legible.',
  1: 'Presentation: it turns its strangest feature to the lens and holds a beat too long.',
  2: 'Presentation: unnaturally still in the light before moving; its most unsettling feature dominates.',
  3: 'Presentation: closer than ordinary life would come, unbothered by the light beam.',
  4: 'Presentation: utterly unafraid of the light, most disturbing feature to the lens, slow and ancient.',
};

/** 二三级是克系怪物：任何深度都不能写成“平静地被观察”，浅档也要有威胁 */
const MONSTER_PRESENTATION: Record<DepthBand, string> = {
  ...DEPTH_PRESENTATION,
  0: 'Presentation: oblique, half swallowed by darkness, never a posed portrait.',
  1: 'Presentation: oblique, its strangest feature turned to the light a beat too long.',
  2: 'Presentation: unnaturally still in the light before each movement.',
  3: 'Presentation: closer than ordinary life would come, unbothered by the light.',
  4: 'Presentation: unafraid of the light, slow and ancient.',
};

export function presentation(tier: DangerTier, band: DepthBand): string {
  return tier === 1 ? DEPTH_PRESENTATION[band] : MONSTER_PRESENTATION[band];
}

export interface Wrongness {
  readonly band: DepthBand;
  /** 适用体型；缺省为全部。鳃、侧线、颌只给鱼，钟体只给胶质类 */
  readonly cls?: readonly BodyClass[];
  readonly text: string;
}

const FISH: BodyClass[] = ['fish'];
const GEL: BodyClass[] = ['gel'];
const CEPH: BodyClass[] = ['cephalopod'];
const SOFT: BodyClass[] = ['fish', 'cephalopod', 'worm', 'echinoderm', 'sessile'];
const SEGMENTED: BodyClass[] = ['fish', 'crustacean', 'worm'];
const W = (band: DepthBand, cls: BodyClass[] | undefined, text: string): Wrongness => ({band, cls, text});

/** 细节原子（二级）：中型深海克系的解剖异化。全部是海洋生物结构，不出现四肢、人形或陆地特征 */
export const ABYSSAL_WRONGNESS: readonly Wrongness[] = [
  W(0, FISH, 'the mouth splits back beyond the head, lined with rows of fine translucent bristle teeth'),
  W(0, SOFT, 'loose skin peeling away in wet translucent shreds, blotched with pale lesions'),
  W(0, undefined, 'hair-fine pale filaments trail loosely from its sides into the water, twitching'),
  W(0, ['fish', 'cephalopod', 'crustacean'], 'its eyes are tiny milky pits sunk deep in swollen tissue, without any shine'),
  W(0, undefined, 'the body is subtly asymmetric, one side longer and more swollen than the other'),
  W(0, FISH, 'fins far too long for its body, trailing in limp ragged sheets'),
  W(0, FISH, '[lure]one lure stalk too many, each ending in a dull clouded bulb'),
  W(0, CEPH, 'one or two extra arms, thinner than the rest, hanging limp'),
  W(0, GEL, '[bell]a second, smaller bell budding from its margin, pulsing on its own'),
  W(0, GEL, '[tentacle|thread|arm|curtain|ribbon]its trailing threads knotted into one another in places'),
  W(0, GEL, '[chain|colon|barrel|zooid|tube]a few units in the chain swollen twice the size of the rest'),
  W(0, ['crustacean'], 'one side carries more appendages than the other'),
  W(0, ['worm'], 'far too many head filaments, some of them branching'),
  W(0, ['echinoderm', 'sessile'], 'more arms or lobes than its kind should have, unevenly spaced'),
  W(1, FISH, 'a second inner jaw slides out of the throat, crowded with needle teeth'),
  W(1, undefined, 'clusters of pale cysts and open pores, some seeping dark fluid'),
  W(1, undefined, 'semi-translucent flesh through which dark organs and one pulsing vessel show'),
  W(1, ['fish', 'cephalopod'], 'a second pair of small clouded eyes set behind the first'),
  W(1, GEL, 'dark shapes like half-digested animals suspended inside it'),
  W(1, CEPH, 'suckers spreading off the arms onto the mantle'),
  W(1, ['crustacean'], 'its shell overgrown by a second, softer shell'),
  W(1, undefined, 'fine dark veins branching just under the surface'),
  W(1, ['echinoderm', 'sessile', 'worm'], 'pores along it opening and closing out of rhythm'),
  W(2, FISH, 'gill slits along its full length, breathing out of sync'),
  W(2, FISH, 'a jaw that unhinges one joint further than any fish should'),
  W(2, undefined, 'thin membranes stretched between body parts that should never connect'),
  W(2, GEL, '[tentacle|thread|sting]its stinging threads all leaning toward the light against the current'),
  W(2, GEL, '[chain|colon|barrel|zooid|tube]its units budding smaller units that pulse out of step'),
  W(2, CEPH, 'arms branching near the tips into finer arms'),
  W(2, ['crustacean', 'worm'], 'segments repeated far too many times, each with its own appendages'),
  W(2, undefined, 'a cluster of small glassy teeth growing where no mouth is'),
  W(3, undefined, 'tissue that ripples against the direction it moves'),
  W(3, FISH, 'rows of small pores along the flank opening one after another, then closing'),
  W(3, SEGMENTED, 'far too many body segments for its length, each pulsing separately'),
  W(3, GEL, '[bell]its bell margin lined with tiny pale teeth'),
  W(3, GEL, '[comb|chain|barrel|house]its translucent walls lined inside with tiny pale teeth'),
  W(3, CEPH, 'small clouded eyes set along the arms, one beside each sucker row'),
  W(3, ['echinoderm', 'sessile'], 'thin fringed tendrils reaching from every opening toward the light'),
  W(4, FISH, 'jaws where fins should be, fins fringing the mouth'),
  W(4, FISH, 'the body slowly everting at the gill line, inside-out and back'),
  W(4, FISH, 'every lateral-line pore exhaling fine dark silt at once'),
  W(4, GEL, '[bell]the bell slowly turning inside-out and back'),
  W(4, GEL, '[chain|colon|barrel|zooid|tube|comb|house]its whole length clenching in a slow wave, then going slack'),
  W(4, CEPH, 'its mantle slowly everting, the arms drawing inside it'),
  W(4, undefined, 'every part of it pulsing in one shared rhythm, out of time with its movement'),
  W(4, ['crustacean'], 'its shell plates parting slightly with each breath, soft tissue beneath'),
  W(4, ['worm', 'echinoderm', 'sessile'], 'openings along its length breathing in sequence'),
];

/** 细节原子（三级）：利维坦级的解剖异化与巨物恐惧，同样只用海洋结构 */
export const LEVIATHAN_WRONGNESS: readonly Wrongness[] = [
  W(0, undefined, 'a slow ripple of muscle under the surface, as if something inside it is shifting'),
  W(0, undefined, 'smaller deep-sea fish sheltering in its folds like barnacles on a hull'),
  W(0, SOFT, 'a scarred, pitted hide crusted with parasites and pale lesions, slick with mucus'),
  W(0, undefined, 'pale branching filaments thick as cables hang from it and slowly twitch'),
  W(0, FISH, 'an edge lined with thousands of fine translucent bristle teeth, each longer than the pod'),
  W(0, GEL, 'translucent tissue thick as a wall, the far side blurred behind it'),
  W(0, undefined, 'old wounds the size of the pod, healed over in pale ridges'),
  W(0, undefined, 'whole colonies of small animals living on its surface'),
  W(1, ['fish', 'cephalopod'], 'a single lidless eye wider than the pod, its pupil slowly contracting in the beam'),
  W(1, FISH, 'gill slits each large enough to swallow the pod, opening in a slow rolling wave'),
  W(1, GEL, 'canals inside it wide as corridors, fluid slowly moving in them'),
  W(1, CEPH, 'suckers each wider than the pod, rimmed with hooks'),
  W(1, undefined, 'pores wide as hatches, each exhaling a slow plume of silt'),
  W(2, undefined, 'thousands of tiny vestigial mouths opening and closing in unison'),
  W(2, GEL, 'translucent walls through which other, smaller abyssal creatures drift inside'),
  W(2, undefined, 'a second, smaller body fused to it, moving to its own rhythm'),
  W(3, undefined, 'long peristaltic waves rolling over it, as if the whole body were swallowing'),
  W(3, undefined, 'cable-thick filaments trailing into the dark, some still twitching'),
  W(3, undefined, 'countless small light points across it, going dark in a slow wave'),
  W(4, ['fish', 'cephalopod'], 'jaw, fin and mantle margins grading into one another'),
  W(4, GEL, '[bell]bell margin and trailing tissue grading into one another, no edge between them'),
  W(4, undefined, 'a surface so vast its curvature reads as seabed, until it breathes'),
  W(4, undefined, 'its surface slowly everting in one place, showing only more surface'),
];

/** 每档追加的异化条数：越深越多 */
const WRONGNESS_COUNT: Record<DepthBand, number> = {0: 2, 1: 2, 2: 3, 3: 3, 4: 3};

/** 无眼物种不能被追加眼睛，否则与档案自相矛盾 */
const EYELESS = /\bno eyes\b|\beyeless\b|\bwithout eyes\b/i;

/** 某物种可用的全部细节原子（按体型与眼过滤） */
export function wrongnessLibrary(tier: DangerTier, band: DepthBand, look = '', cls?: BodyClass): Wrongness[] {
  if (tier === 1) return [];
  // 只给本来有眼的物种写眼；给水母、管水母加眼会把它们画成卡通脸
  const eyeless = EYELESS.test(look) || !/\beyes?\b/i.test(look);
  return (tier === 2 ? ABYSSAL_WRONGNESS : LEVIATHAN_WRONGNESS)
    .filter(w => w.band <= band && (!cls || !w.cls || w.cls.includes(cls)) && !(eyeless && /\beyes?\b|\bpupil\b/i.test(w.text)))
    .flatMap(w => {
      const text = fitAtom(w.text, {look, move: ''});
      return text === null ? [] : [{...w, text}];
    });
}

export function depthWrongness(tier: DangerTier, band: DepthBand, rand: () => number, look = '', cls?: BodyClass): string[] {
  const pool = wrongnessLibrary(tier, band, look, cls);
  // 当前档最多占 count-1 条，其余从浅档补足：当前档按体型过滤后常只剩两三条，全取会让同类怪物同质化
  const top = pool.filter(w => w.band === band);
  const rest = pool.filter(w => w.band !== band);
  const count = WRONGNESS_COUNT[band], picked: string[] = [];
  const take = (list: Wrongness[], limit: number) => {
    while (list.length && picked.length < limit) picked.push(list.splice(Math.floor(rand() * list.length), 1)[0]!.text);
  };
  take(top, Math.max(1, count - 1)); take(rest, count); take(top, count);
  return picked;
}
