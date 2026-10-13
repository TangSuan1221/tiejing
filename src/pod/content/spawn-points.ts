import {BEAM_EDGE, type DangerTier} from './monster-lexicon';
import type {SpawnContact, SpawnTable} from '../sim/monster-spawner';
import type {PassiveContact} from '../sim/authored-site';
import {HARBOR_DATUM_DEPTH, LIVING_DATUM_DEPTH} from '../sim/site-coords';

/**
 * 各关刷怪点。只放在潜艇能看见、但不在主线必经咽喉上的水域，避开正典生物的巢位与巡逻线。
 * 三级点只放在竖井这类向下开阔的深水里，利维坦只露出经过井口的一段身体。
 * 刷出个体不伤害、不碰撞、不进实时三维画面（同接驳港声源的处理），只在被动声纳与生成视频里出现。
 */
export const HARBOR_SPAWN_TABLE: SpawnTable = {
  site: 'harbor',
  datum: HARBOR_DATUM_DEPTH,
  points: [
    {
      id: 'harbor.t1.entry-pool', tier: 1, position: [6, 1, 44], drift: [[6, 1, 44], [16, 2, 46], [10, 0, 37]],
      triggerRadius: 30, minDistance: 10, chance: .35, cooldown: 90, lifetime: 70, maxLength: 3,
      setting: 'drifting in the open water of the flooded entry basin beside the maintenance bend',
      note: '入口水池：维修弯道旁的开阔水，首次接触普通深海生物', vantage: [18, 0, 32],
    },
    {
      id: 'harbor.t1.shaft-snow', tier: 1, position: [52, -10, 32], drift: [[52, -10, 32], [60, -8, 26], [46, -12, 24]],
      triggerRadius: 34, minDistance: 8, chance: .3, cooldown: 120, lifetime: 80, maxLength: 4,
      setting: 'below the camera in the deep shaft under the fractured deck, seen between the thin arrestor cables',
      note: '断裂层下深井上段：从拦阻索缝隙往下看', vantage: [50, 0, 30],
    },
    {
      id: 'harbor.t2.north-gallery', tier: 2, position: [62, 1, 2], drift: [[62, 1, 2], [50, 2, -2], [70, 0, -4]],
      triggerRadius: 45, minDistance: 14, chance: .2, cooldown: 180, lifetime: 60, maxLength: 8,
      setting: 'on the far north bank beyond the fractured deck and the anti-collision cable fence, near the tower-head galleries',
      note: '北岸塔头平台外侧：隔着断层与防撞索观察，潜艇过不去', vantage: [60, 0, 24],
    },
    {
      id: 'harbor.t3.deep-shaft', tier: 3, position: [66, -24, 30], drift: [[66, -24, 30], [44, -24, 26], [80, -24, 34]],
      triggerRadius: 50, minDistance: 10, chance: .15, cooldown: 240, lifetime: 40,
      setting: 'far below the camera at the bottom of the open deep shaft beneath the fractured deck; only the part of its body passing through the shaft is visible',
      note: '深井底：俯拍井底，只看见经过井口的一段身体', vantage: [60, 0, 27],
    },
  ],
};

export const LIVING_SPAWN_TABLE: SpawnTable = {
  site: 'living',
  datum: LIVING_DATUM_DEPTH,
  points: [
    {
      id: 'living.t1.c1-west', tier: 1, position: [24, 1, 8], drift: [[24, 1, 8], [30, 0, 6], [20, 1.5, 10]],
      triggerRadius: 30, minDistance: 8, chance: .3, cooldown: 100, lifetime: 60, maxLength: 2,
      setting: 'drifting near the ceiling of the flooded dormitory corridor',
      note: '宿舍外廊西段：玻璃鱼群以西，不压它的巡逻线', vantage: [36, 0, 8],
    },
    {
      id: 'living.t1.atrium', tier: 1, position: [150, 3, 62], drift: [[150, 3, 62], [164, 4, 56], [140, 2, 70]],
      triggerRadius: 40, minDistance: 10, chance: .3, cooldown: 120, lifetime: 80, maxLength: 4,
      setting: 'in the open water of the tall flooded atrium, between the dark balconies',
      note: '中庭中层：趋光者巡逻高度以下、盲猎者巡逻高度以上', vantage: [140, 0, 52],
    },
    {
      id: 'living.t2.east-corridor', tier: 2, position: [112, 0, 7], drift: [[112, 0, 7], [100, .5, 8], [116, -1, 6]],
      triggerRadius: 36, minDistance: 12, chance: .2, cooldown: 180, lifetime: 50, maxLength: 6,
      setting: 'at the far end of the low flooded east corridor, filling most of its height',
      note: '东廊东端：压载库门口以西，不与避光者重叠', vantage: [90, 0, 7],
    },
    {
      id: 'living.t3.descent-shaft', tier: 3, position: [98, -52, 68], drift: [[98, -52, 68], [94, -55, 64], [102, -50, 72]],
      triggerRadius: 70, minDistance: 6, chance: .15, cooldown: 240, lifetime: 40,
      setting: 'far below the camera at the bottom of the vertical descent shaft; only what passes beneath the shaft opening is visible',
      note: '下行井底：从井口俯拍，-2层方向的深水', vantage: [98, 0, 68],
    },
  ],
};

export const SPAWN_TABLES = [HARBOR_SPAWN_TABLE, LIVING_SPAWN_TABLE] as const;

/** 刷出个体能被拍进画面的最远距离：一级要进探照灯，二级到光束外沿，三级只要身体有一段进光束 */
export function spawnShotRange(tier: DangerTier, length: number): number {
  return tier === 1 ? 18 : tier === 2 ? BEAM_EDGE : Math.min(80, BEAM_EDGE + length / 2);
}

/**
 * 一卷里所有怪物槽位的字符预算。无怪物时整段提交文本约 3000 字符，接口上限 7000；
 * 刷出个体按距离由近到远加入，放不下的这一卷不写（画面里它仍按物理在场，但不生成）。
 */
export const SHOT_MONSTER_BUDGET = 3300;
export function fitSpawnSubjects(fixed: readonly string[], spawned: readonly string[], budget = SHOT_MONSTER_BUDGET): string[] {
  const out = [...fixed];
  let used = fixed.reduce((n, s) => n + s.length + 2, 0);
  for (const s of spawned) if (used + s.length + 2 <= budget) {out.push(s); used += s.length + 2;}
  return out;
}

export const SPAWN_CONTACT_FORM: Record<DangerTier, string> = {
  1: '高频细碎散点 · 间歇摆尾',
  2: '中频起伏 · 不规则搏动',
  3: '次声级低频 · 横贯频带的缓慢涌动',
};
export function spawnContactForm(tier: DangerTier) {return SPAWN_CONTACT_FORM[tier];}

const BEARINGS = ['前方', '右前方', '右舷', '右后方', '后方', '左后方', '左舷', '左前方'];
/** 刷怪个体在被动阵列上的样子：只有方位与声纹，永远未登记、不给距离 */
export function spawnPassiveContacts(contacts: readonly SpawnContact[]): PassiveContact[] {
  return contacts.map(c => ({
    id: c.id, kind: 'unknown', label: '???', form: SPAWN_CONTACT_FORM[c.tier], frequency: c.frequency,
    width: c.tier === 3 ? 1.6 : c.tier === 2 ? .6 : .9, intensity: Math.min(.95, .18 + c.intensity * .8),
    bearing: BEARINGS[Math.round((((c.bearing % 360) + 360) % 360) / 45) % 8]!,
  }));
}
