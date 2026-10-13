/** Authored optical facts, never inferred from dialogue or sonar colour. */
export interface VideoContext {
 generatedMonsters?:boolean; story:boolean; settled:boolean; stateKey:string; prefetchKey?:string; nearestMonster:number;
 scene:string; actors:string[]; monsters:string[]; outcome:string;
 /** Camera depth below the surface in metres at the shutter. */
 depth?:number;
}
export const VIDEO_MONSTER_RADIUS=30;
export function videoPolicy(c:VideoContext){return {duration:c.story?10:5,allowed:c.story||c.nearestMonster<=VIDEO_MONSTER_RADIUS} as const;}
export function slotPrompt(c:VideoContext):string {
 return [
  'AUTHORITATIVE SHOT SLOTS. These slots replace all generic fauna and story suggestions.',
  'DURATION_SECONDS: '+videoPolicy(c).duration,
  'LOCATION: '+c.scene,
  ...(c.depth!==undefined?['DEPTH: about '+Math.round(c.depth)+' m below the surface; no sunlight has ever reached this water.']:[]),
  'HUMAN_SUBJECTS: '+(c.actors.join('; ')||'none visible; do not add a person'),
  'MONSTER_SUBJECTS: '+(c.monsters.join('; ')||'none visible; do not invent a creature'),
  'CURRENT_RESULT: '+c.outcome,
  c.generatedMonsters?'ENVIRONMENT_ONLY_REFERENCE: The reference has no monster model; add only the listed MONSTER_SUBJECTS, already in place within the first second, never materializing or fading in. No unseen past action, new injury, rescue, death or door transition.':'Preserve the supplied first frame, anatomy, scale, clothing, subject count, camera and occlusion. Animate only this existing situation. No unseen past action, no new injury, rescue, death or door transition.',
  'Unless described as ordinary fauna, every MONSTER_SUBJECT is an abyssal Lovecraftian deep-sea organism of horror, exactly the anatomy its slot describes. Every creature looks like a real animal filmed by a deep-sea ROV in murky water, never a toy fish, rubber, vinyl, clay or airbrushed CG: fine natural texture softened by water, thin partly see-through skin, a soft flimsy body never inflated, chunky or smoothly rounded, colour patchy never one flat tone; follow every Material, Colour, Wear and Light line. Eyes dull and cloudy like a dead fish, no coloured iris. Seen oblique, never posed or cute; menacing and unnameable. It never stands, walks, runs or crawls on legs. Motion like real deep-sea life: long stillness, slow drift, small corrections, rare brief bursts, all in place: it never swims across, past or out of the frame. Its Motion beats play once, never looped; mouth closed but for one brief gape. Never render a land animal, reptile, mammal, shark or dolphin, or swap the species. No human features, faces, mascots, cuts, subtitles or slot labels.'
 ].join(' ');
}
export function videoContextKey(c:VideoContext,pose:unknown):string {return JSON.stringify([c.generatedMonsters??false,c.stateKey,c.story,c.scene,c.actors,c.monsters,c.outcome,pose]);}
