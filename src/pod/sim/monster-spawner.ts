import {findSpecies, rollSpecies, type DangerTier, type LexiconEntry} from '../content/monster-lexicon';

/**
 * 关卡刷怪点。纯模拟：不画模型、不造成伤害、不进碰撞，只产生被动声纳声源与视频提示词主体。
 * 刷出时一次性锁定物种、种子与尺寸（MonsterVideoParams）；快门时再由关卡补上实测相机深度与光学关系。
 */
export type SpawnVec = readonly [number, number, number];

export interface SpawnPoint {
  readonly id: string;
  readonly tier: DangerTier;
  /** 刷出位置（关卡世界坐标）；所在深度 = 关卡基准深度 − y */
  readonly position: SpawnVec;
  /** 刷出后循环游向这些点；必须与刷出点在同一片可见水域 */
  readonly drift: readonly SpawnVec[];
  /** 艇与刷怪点的距离落在 [minDistance, triggerRadius] 内才判定，避免贴脸刷出 */
  readonly triggerRadius: number;
  readonly minDistance: number;
  /** 每次判定的刷出概率 */
  readonly chance: number;
  /** 上一只离开后到下一次判定的冷却，秒 */
  readonly cooldown: number;
  /** 存在时长，秒；超过或艇远离后离开 */
  readonly lifetime: number;
  /** 体长上限（米），让抽到的物种塞得进这片水域；不填不限 */
  readonly maxLength?: number;
  /** 固定物种（剧情需要时）；不填按等级与深度从词典抽 */
  readonly speciesId?: string;
  /** 写进提示词的位置说明（英文），说明它在这片空间的哪里 */
  readonly setting: string;
  /** 制作备注 */
  readonly note: string;
  /** 校验用：潜艇可达且能直视刷怪点的艇位 */
  readonly vantage: SpawnVec;
}

export interface SpawnTable {
  readonly site: string;
  /** y=0 的海面以下深度，米 */
  readonly datum: number;
  readonly points: readonly SpawnPoint[];
}

/** 刷怪时传给视频提示词的全部参数；快门时只需再补实测 depth 与 LensView */
export interface MonsterVideoParams {
  readonly site: string;
  readonly pointId: string;
  readonly instanceId: string;
  /** 词典稳定种子：同一只怪物多次曝光外观不变 */
  readonly seedKey: string;
  readonly tier: DangerTier;
  readonly speciesId: string;
  readonly speciesZh: string;
  readonly speciesName: string;
  readonly sci?: string;
  readonly base?: string;
  readonly dread: LexiconEntry['dread'];
  /** 体长 / 体高，米，用于画面占比 */
  readonly size: {readonly length: number; readonly height: number};
  /** 刷出点深度，米 */
  readonly spawnDepth: number;
  /** 提示词槽位标签 */
  readonly label: string;
  readonly setting: string;
}

export interface SpawnedMonster {
  readonly id: string;
  readonly pointId: string;
  readonly position: SpawnVec;
  /** 水平航向，度 */
  readonly heading: number;
  readonly age: number;
  readonly video: MonsterVideoParams;
}

export interface SpawnEvent {
  readonly kind: 'spawn' | 'despawn';
  readonly at: number;
  readonly id: string;
  readonly pointId: string;
  readonly position: SpawnVec;
  readonly video: MonsterVideoParams;
  readonly reason?: 'lifetime' | 'distance' | 'forced';
}

export interface SpawnInput {
  readonly pod: SpawnVec;
  /** 刷出点此刻在取景内可见则返回 true；刷出必须发生在画面之外 */
  readonly canSee?: (p: SpawnVec) => boolean;
}

export interface SpawnContact {
  readonly id: string;
  readonly tier: DangerTier;
  /** 相对艇首的方位，度（−180…180） */
  readonly bearing: number;
  readonly intensity: number;
  readonly frequency: number;
}

export const SPAWN_TUNING = Object.freeze({
  /** 判定间隔，秒 */
  interval: 2,
  /** 艇远离到 triggerRadius × leave 外时它离开 */
  leave: 1.6,
  speed: {1: .6, 2: .9, 3: 1.4} as Record<DangerTier, number>,
  /** 被动阵列可听距离，米 */
  hearing: {1: 35, 2: 60, 3: 140} as Record<DangerTier, number>,
  band: {1: [41.4, 42.8], 2: [38.4, 39.6], 3: [35.4, 36.2]} as Record<DangerTier, [number, number]>,
  loudness: {1: .45, 2: .7, 3: 1} as Record<DangerTier, number>,
});

const TIER_LABEL: Record<DangerTier, string> = {1: 'Wild deep-sea animal', 2: 'Abyssal creature', 3: 'Leviathan-class presence'};

interface Live {id: string; pointId: string; pos: [number, number, number]; heading: number; age: number; next: number; video: MonsterVideoParams}
interface PointState {readyAt: number}
export interface MonsterSpawnerSnapshot {version: 1; site: string; clock: number; checkAt: number; rng: number; serial: number; points: Record<string, PointState>; live: Live[]}

const dist = (a: SpawnVec, b: SpawnVec) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const vec = (v: unknown): v is [number, number, number] => Array.isArray(v) && v.length === 3 && v.every(finite);
const hash = (s: string) => {let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0;};
const relative = (deg: number) => {const r = ((deg % 360) + 540) % 360 - 180; return r === -180 ? 180 : r;};
const bearingTo = (from: SpawnVec, to: SpawnVec) => (Math.atan2(to[0] - from[0], -(to[2] - from[2])) * 180 / Math.PI + 360) % 360;

export class MonsterSpawner {
  private clock = 0;
  private checkAt: number = SPAWN_TUNING.interval;
  private rng: number;
  private serial = 0;
  private points = new Map<string, PointState>();
  private live: Live[] = [];
  private byId: Map<string, SpawnPoint>;
  /** 最近的刷出/离开事件，新的在后；供 GM、日志与测试读取 */
  readonly events: SpawnEvent[] = [];
  constructor(readonly table: SpawnTable, seed = hash(table.site)) {
    this.rng = seed || 1;
    this.byId = new Map(table.points.map(p => [p.id, p]));
    for (const p of table.points) this.points.set(p.id, {readyAt: 0});
  }
  get active(): readonly SpawnedMonster[] {
    return this.live.map(m => ({id: m.id, pointId: m.pointId, position: [...m.pos] as SpawnVec, heading: m.heading, age: m.age, video: m.video}));
  }
  private random() {
    let t = (this.rng = (this.rng + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  private emit(e: SpawnEvent) {this.events.push(e); if (this.events.length > 32) this.events.shift();}
  /** 生成一只个体的全部视频参数；物种在此刻锁定 */
  private params(point: SpawnPoint, instanceId: string): MonsterVideoParams {
    const seedKey = `${this.table.site}:${instanceId}`, spawnDepth = this.table.datum - point.position[1];
    const fit = point.maxLength ? (e: LexiconEntry) => e.length <= point.maxLength! : undefined;
    const entry = (point.speciesId && findSpecies(point.tier, point.speciesId)) || rollSpecies(point.tier, spawnDepth, seedKey, fit);
    return {
      site: this.table.site, pointId: point.id, instanceId, seedKey, tier: point.tier,
      speciesId: entry.id, speciesZh: entry.zh, speciesName: entry.name, sci: entry.sci, base: entry.base, dread: entry.dread,
      size: {length: entry.length, height: entry.height}, spawnDepth,
      label: `${TIER_LABEL[point.tier]}, exactly one individual [${instanceId}], ${point.setting}`, setting: point.setting,
    };
  }
  private spawnAt(point: SpawnPoint): SpawnedMonster {
    const id = `${point.id}#${++this.serial}`, video = this.params(point, id);
    const first = point.drift[0] ?? point.position;
    const m: Live = {id, pointId: point.id, pos: [...point.position], heading: bearingTo(point.position, first), age: 0, next: 0, video};
    this.live.push(m);
    this.emit({kind: 'spawn', at: this.clock, id, pointId: point.id, position: [...m.pos], video});
    return this.active.find(a => a.id === id)!;
  }
  private remove(m: Live, reason: SpawnEvent['reason']) {
    const point = this.byId.get(m.pointId)!;
    this.live = this.live.filter(x => x !== m);
    this.points.get(m.pointId)!.readyAt = this.clock + point.cooldown;
    this.emit({kind: 'despawn', at: this.clock, id: m.id, pointId: m.pointId, position: [...m.pos], video: m.video, reason});
  }
  /** GM / 测试：无视距离、概率与冷却，立即在该点刷出一只（该点已有个体时先移走） */
  force(pointId: string): SpawnedMonster | null {
    const point = this.byId.get(pointId); if (!point) return null;
    const old = this.live.find(m => m.pointId === pointId); if (old) this.remove(old, 'forced');
    return this.spawnAt(point);
  }
  /** GM / 测试：移走在场个体（缺省全部），各点照常进入冷却 */
  clear(pointId?: string): number {
    const gone = this.live.filter(m => !pointId || m.pointId === pointId);
    for (const m of gone) this.remove(m, 'forced');
    return gone.length;
  }
  tick(dt: number, input: SpawnInput): SpawnEvent[] {
    const from = this.events.length;
    if (!finite(dt) || dt <= 0 || !vec(input?.pod)) return [];
    dt = Math.min(dt, 1); this.clock += dt;
    for (const m of [...this.live]) {
      const point = this.byId.get(m.pointId)!;
      m.age += dt;
      if (m.age >= point.lifetime) {this.remove(m, 'lifetime'); continue;}
      if (dist(input.pod, m.pos) > point.triggerRadius * SPAWN_TUNING.leave) {this.remove(m, 'distance'); continue;}
      const path = point.drift.length ? point.drift : [point.position], goal = path[m.next % path.length]!;
      const dx = goal[0] - m.pos[0], dy = goal[1] - m.pos[1], dz = goal[2] - m.pos[2], d = Math.hypot(dx, dy, dz);
      const step = Math.min(d, SPAWN_TUNING.speed[point.tier] * dt);
      if (d > 1e-6) {m.pos = [m.pos[0] + dx / d * step, m.pos[1] + dy / d * step, m.pos[2] + dz / d * step]; if (Math.hypot(dx, dz) > 1e-3) m.heading = bearingTo(m.pos, goal);}
      if (d - step <= 1e-3) m.next = (m.next + 1) % path.length;
    }
    if (this.clock >= this.checkAt) {
      this.checkAt = this.clock + SPAWN_TUNING.interval;
      for (const point of this.table.points) {
        if (this.live.some(m => m.pointId === point.id) || this.clock < this.points.get(point.id)!.readyAt) continue;
        const d = dist(input.pod, point.position);
        if (d < point.minDistance || d > point.triggerRadius) continue;
        if (this.random() >= point.chance) continue;
        if (input.canSee?.(point.position)) continue;
        this.spawnAt(point);
      }
    }
    return this.events.slice(from);
  }
  passiveContacts(pod: SpawnVec, heading: number): SpawnContact[] {
    const out: SpawnContact[] = [];
    for (const m of this.live) {
      const tier = m.video.tier, range = SPAWN_TUNING.hearing[tier], d = dist(pod, m.pos);
      if (d > range) continue;
      const intensity = SPAWN_TUNING.loudness[tier] * (1 - d / range); if (intensity < .03) continue;
      const [lo, hi] = SPAWN_TUNING.band[tier];
      out.push({id: m.id, tier, bearing: relative(bearingTo(pod, m.pos) - heading), intensity, frequency: Math.round((lo + (hi - lo) * (hash(m.id) / 2 ** 32)) * 100) / 100});
    }
    return out.sort((a, b) => b.intensity - a.intensity);
  }
  snapshot(): MonsterSpawnerSnapshot {
    return structuredClone({version: 1 as const, site: this.table.site, clock: this.clock, checkAt: this.checkAt, rng: this.rng, serial: this.serial, points: Object.fromEntries(this.points), live: this.live});
  }
  restore(value: unknown): boolean {
    const s = value as MonsterSpawnerSnapshot;
    if (!s || s.version !== 1 || s.site !== this.table.site || ![s.clock, s.checkAt, s.rng, s.serial].every(finite) || !Array.isArray(s.live) || !s.points || typeof s.points !== 'object') return false;
    for (const m of s.live) if (!m || !this.byId.has(m.pointId) || !vec(m.pos) || ![m.heading, m.age, m.next].every(finite) || !m.video || m.video.pointId !== m.pointId || typeof m.video.seedKey !== 'string') return false;
    const points = new Map<string, PointState>();
    for (const p of this.table.points) {const r = s.points[p.id]; points.set(p.id, {readyAt: r && finite(r.readyAt) ? r.readyAt : 0});}
    this.clock = s.clock; this.checkAt = s.checkAt; this.rng = s.rng | 0; this.serial = s.serial; this.points = points; this.live = structuredClone(s.live);
    return true;
  }
}
