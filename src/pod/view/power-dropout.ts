/**
 * Visual-only brownout envelope. It deliberately has an incandescent afterglow,
 * a dim instrument floor and a delayed tube recovery instead of cutting to black.
 * Simulation power, lamp state and creature senses are untouched.
 */
export type DropoutVisual = {
  phase: 'idle'|'afterglow'|'dark'|'recovery';
  /** Multiplier for normal warm cabin fixtures. */
  warm: number;
  /** Two physical lamp banks; recovery contains discrete failed strikes. */
  banks: readonly [number,number];
  /** Strength of the independent emergency-red circuit. */
  emergency: number;
  /** Minimum glow retained by instrument glass and annunciators. */
  instruments: number;
  /** Legacy porthole shade gate; true only at the deepest part of the dip. */
  deepDark: boolean;
};

let started = -Infinity;
let darkUntil = -Infinity;
let recoveryUntil = -Infinity;
const ATTACK = .16;
const RECOVERY = 2.25;

const now = ():number => performance.now()/1000;
const smooth = (v:number):number => {
  const x=Math.max(0,Math.min(1,v));
  return x*x*(3-2*x);
};

export function triggerDropout(seconds:number):void {
  const t=now();
  if(t>=recoveryUntil)started=t;
  darkUntil=Math.max(darkUntil,t+seconds);
  recoveryUntil=darkUntil+RECOVERY;
}

export function dropoutVisual(at=now()):DropoutVisual {
  if(at>=recoveryUntil)return {phase:'idle',warm:1,banks:[1,1],emergency:0,instruments:1,deepDark:false};
  if(at<started+ATTACK){
    const fall=smooth((at-started)/ATTACK);
    const warm=1-fall*.94;
    return {phase:'afterglow',warm,banks:[warm,warm*.96],emergency:fall*.72,instruments:1-fall*.82,deepDark:false};
  }
  if(at<darkUntil)return {phase:'dark',warm:.025,banks:[.025,.018],emergency:.92,instruments:.12,deepDark:true};

  const elapsed=at-darkUntil;
  // Relay closes, then each fluorescent bank makes two countable strikes:
  // a short failed glow, a dark fall-back, and finally a thermal rise to stable.
  // These explicit windows are intentional physical events, not a noise LFO.
  const strike=(t:number,offset:number):number=>{
    const x=t-offset;
    if(x<0)return .02;
    if(x<.075)return .48;
    if(x<.19)return .025;
    if(x<.285)return .72;
    if(x<.43)return .035;
    return .035+.965*smooth((x-.43)/.44);
  };
  const first=strike(elapsed,.30);
  const second=strike(elapsed,.91);
  const warm=(first+second)*.5;
  const emergency=.92*(1-smooth((elapsed-.72)/1.18));
  const instruments=.12+.88*smooth(elapsed/.46);
  return {phase:'recovery',warm,banks:[first,second],emergency,instruments,deepDark:false};
}

export function dropoutActive():boolean { return dropoutVisual().deepDark; }
