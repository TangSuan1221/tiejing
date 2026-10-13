/** Shared hull consequences for authored decks: seams opened by blows, wall scrapes and the repairs that close them. */
export const HULL_WEAR=Object.freeze({
 /** Cabin seams a blow can split, as [side, fore]: side −1 port / +1 starboard, fore = ahead of the cabin midline. */
 seams:[[-1,true],[1,true],[-1,true],[1,true],[1,false],[-1,false]] as readonly (readonly [number,boolean])[],
 /** Seep through one split seam, in flood fraction per breath. Nothing leaks until something hits the hull. */
 seamLeak:.004,
 /** Seconds of uninterrupted work, facing the seam, to clamp and seal it. */
 patchSeconds:2.6,
 /** Noise of hammering a clamp onto the hull from inside. */
 patchNoise:.22,
 /** Integrity lost when the pod hits structure faster than this. */
 wallSpeed:.6,wallDamage:.01,wallCooldown:1.5,
 /** A creature pressing on the hull while it still hears the pod. */
 contactInterval:7,contactDamage:.03,
});

interface Hull {hull:number;leak:number;flood:number;seams:number[];rng:{next():number}}

/** Seep follows open seams only; authored decks call this on entry so the legacy resting seep never applies. */
export function seep(run:Hull){run.leak=run.seams.length*HULL_WEAR.seamLeak;}
/**
 * A blow splits one intact seam, preferring the side it came from.
 * bearing: radians relative to the bow, positive to starboard. Returns the slot, or null when every seam is open.
 */
export function strikeSeep(run:Hull,bearing?:number):number|null{
 const score=(i:number)=>{if(bearing===undefined)return 0;const [side,fore]=HULL_WEAR.seams[i]!;return Number(Math.sign(Math.sin(bearing))===side)+Number((Math.cos(bearing)>0)===fore);};
 const intact=HULL_WEAR.seams.map((_,i)=>i).filter(i=>!run.seams.includes(i));
 if(!intact.length)return null;
 const best=Math.max(...intact.map(score)),pool=intact.filter(i=>score(i)===best);
 const slot=pool[Math.floor(run.rng.next()*pool.length)%pool.length]!;
 run.seams.push(slot);seep(run);return slot;
}
export function patchSeam(run:Hull,slot:number):boolean{
 const at=run.seams.indexOf(slot);if(at<0)return false;
 run.seams.splice(at,1);seep(run);return true;
}
/** Bilge pump: removes standing water, does not close any seam. */
export function pumpBilge(run:Hull,drain:number){run.flood=Math.max(0,run.flood-drain);}
