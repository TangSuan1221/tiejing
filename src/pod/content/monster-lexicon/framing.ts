import type {LensView} from './types';

/** 探照灯有效照明距离（米）。之外只剩剪影与自发光 */
export const LAMP_RANGE = 14;
/** 照明衰减带的外沿 */
export const BEAM_EDGE = 28;

export type ShotScale = 'fragment' | 'partial' | 'close' | 'medium' | 'long' | 'tiny';

export interface Framing {
  readonly shot: ShotScale;
  /** 体长占画面宽度的比例（可大于 1） */
  readonly fillW: number;
  /** 体高占画面高度的比例（可大于 1） */
  readonly fillH: number;
  readonly hfovDeg: number;
  readonly focalMm: number;
  readonly text: string;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const deg = (r: number) => r * 180 / Math.PI;

function place(screen: LensView['screen']): string {
  if (!screen) return 'near frame centre';
  const [x, y] = screen;
  const h = x < -.33 ? 'left third' : x > .33 ? 'right third' : 'centre';
  const v = y > .33 ? 'upper' : y < -.33 ? 'lower' : '';
  return h === 'centre' && !v ? 'at frame centre' : `in the ${v ? v + ' ' : ''}${h} of the frame`;
}

function light(view: LensView): string {
  const d = view.distance;
  if (view.lamp && d <= LAMP_RANGE) return 'Near: softly lit through murky water.';
  if (view.lamp && d <= BEAM_EDGE) return 'Mid-distance: veiled in blue haze, soft outline.';
  return 'Far: almost lost in blue-black murk, a faint silhouette, own lights only.';
}

/**
 * 按实测距离和视场算目标在画面里的占比与景别。体长按侧向（与画面水平方向平行）估计，
 * 是保守的最大占比；不改变相机，只告诉模型目标该有多大。
 */
export function frameSubject(size: {readonly length: number; readonly height: number}, view: LensView): Framing {
  const d = Math.max(.3, view.distance);
  const vf = Math.min(170, Math.max(1, view.fovDeg)) * Math.PI / 180;
  const hf = 2 * Math.atan(Math.max(.2, view.aspect) * Math.tan(vf / 2));
  const fillW = size.length / (2 * d * Math.tan(hf / 2));
  const fillH = size.height / (2 * d * Math.tan(vf / 2));
  const major = Math.max(fillW, fillH);
  const focalMm = 12 / Math.tan(vf / 2);
  const shot: ShotScale = major >= 3 ? 'fragment' : major >= 1.15 ? 'partial' : major >= .6 ? 'close' : major >= .25 ? 'medium' : major >= .08 ? 'long' : 'tiny';
  const lens = `LENS: fixed ${Math.round(deg(vf))}° vertical, ~${d < 10 ? d.toFixed(1) : Math.round(d)} m away.`;
  const where = place(view.screen);
  const body = {
    fragment: `FRAMING: extreme close fragment filling the frame; its outline and ends never visible (~${pct(1 / fillW)} of its length).`,
    partial: `FRAMING: too large for the frame; it runs out beyond the edges, ~${pct(Math.min(1, 1 / fillW))} of its length visible, ${where}.`,
    close: `FRAMING: close; the whole body barely fits, ~${pct(fillW)} of frame width and ${pct(Math.min(1, fillH))} of height, ${where}.`,
    medium: `FRAMING: medium; full body ~${pct(fillW)} of frame width, ${where}.`,
    long: `FRAMING: long shot; a small complete figure ~${pct(fillW)} of frame width, ${where}; the room dominates.`,
    tiny: `FRAMING: tiny in frame; a small figure only ~${pct(Math.max(.01, fillW))} of frame width, ${where}; do not enlarge it.`,
  }[shot];
  return {shot, fillW, fillH, hfovDeg: deg(hf), focalMm, text: `${lens} ${body} ${light(view)}`};
}
