import type {CreatureType} from './living-deck-layout';
import {composeMonsterSubject, type DangerTier, type LensView} from './monster-lexicon';
import type {MonsterVideoParams} from '../sim/monster-spawner';

/**
 * Generated-footage appearance comes only from the monster lexicon. Story text and 3D models
 * never decide what the video model draws; a creature's seed keeps its species stable per depth band.
 */
export type VideoCreatureKind = 'harbor' | CreatureType;

export const VIDEO_CREATURE_TIER: Record<VideoCreatureKind, DangerTier> = {harbor: 2, lumen: 2, shade: 2, blind: 2, swarm: 1};

/** 曝光时实测的深度与光学关系 */
export interface VideoOptics {readonly depth: number; readonly view?: LensView}

/** 关卡里的固定怪物：seedKey 用「关卡:个体id」，同一只每次曝光抽到同一物种 */
export function videoCreatureSubject(kind: VideoCreatureKind, seedKey: string, label: string, optics: VideoOptics): string {
 return lexiconCreatureSubject(VIDEO_CREATURE_TIER[kind], seedKey, label, optics);
}

export function lexiconCreatureSubject(tier: DangerTier, seedKey: string, label: string, optics: VideoOptics): string {
 return composeMonsterSubject({tier, depth: optics.depth, seedKey, label, view: optics.view}).text;
}

/** 刷怪点个体：物种在刷出时已锁定，快门时只补实测深度与光学关系 */
export function spawnedMonsterSubject(video: MonsterVideoParams, optics: VideoOptics): string {
 return composeMonsterSubject({tier: video.tier, depth: optics.depth, seedKey: video.seedKey, label: video.label, view: optics.view, speciesId: video.speciesId}).text;
}
