import type { PodRun } from '../sim/run';
import { HULL_WEAR, patchSeam } from '../sim/hull-wear';

type Cue = (name: string, gain: number) => void;

/** Authored decks only surface the caption band; the log alone would go unseen. */
export function sayHull(run: PodRun, text: string): void {
  run.pushLog(text, 'system');
  run.storyCaption = text; run.storyCaptionLeft = Math.max(4, Math.min(10, text.length * .13));
}

/** The clamp being driven onto one seam; the player must keep facing it until it is tight. */
let work: { slot: number; left: number; knock: number } | null = null;

export function patchProgress(): { slot: number; progress: number } | null {
  return work ? { slot: work.slot, progress: 1 - work.left / HULL_WEAR.patchSeconds } : null;
}

export function startPatch(run: PodRun, slot: number, cue: Cue): void {
  if (work?.slot === slot || !run.seams.includes(slot)) return;
  work = { slot, left: HULL_WEAR.patchSeconds, knock: 0 };
  run.addNoise(HULL_WEAR.patchNoise);
  cue('valve.turn', .5);
}

/** hovered: the cabin pick under the crosshair this frame. */
export function tickPatch(run: PodRun, dt: number, hovered: string | null, cue: Cue): void {
  if (!work) return;
  if (!run.seams.includes(work.slot) || run.at || run.outcome.kind !== 'alive') { work = null; return; }
  if (hovered !== `seam:${work.slot}`) { work = null; sayHull(run, '手离开了裂缝，夹具没上紧。'); return; }
  work.left -= dt; work.knock -= dt;
  if (work.knock <= 0) { work.knock = .55; run.addNoise(HULL_WEAR.patchNoise * .25); cue('hull.pop', .3); }
  if (work.left > 0) return;
  patchSeam(run, work.slot); work = null;
  if (run.mode === 'calm') run.spend(1, .5);
  cue('water.bubble', .45);
  sayHull(run, '夹具上紧了，这道缝不再进水。');
}