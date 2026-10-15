import { PodRun } from './run';
import { ContainmentMission, type ContainmentSnapshot } from './containment-mission';
import { VITAL_BOUNDS } from '../../sim/tuning';

/** Independent checkpoint namespace: legacy harbor/living slots are never written. */
// v1 belonged to the withdrawn local-frame prototype. Never import its census
// acknowledgements into the original-video-pipeline incremental mode.
export const CONTAINMENT_SAVE_KEY='ironlung.containment.v2';
const LIMIT=4_000_000;
type Obj=Record<string,any>;
export interface ContainmentStorage {getItem(key:string):string|null;setItem(key:string,value:string):void}
export interface ContainmentSave {version:1;adapter:'containment';seed:number;savedAt:number;phase:'transit'|'site';mission:ContainmentSnapshot;site:Obj|null;run:Obj;vitals:Obj;flags:Obj}
const object=(v:unknown):v is Obj=>!!v&&typeof v==='object'&&!Array.isArray(v);
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const numbers=['breaths','clock','power','hull','flood','leak','scrubber','cabinTemp','noise','traveled','siteBreaths','heading','pitch','collisions','camPan','camTilt','camZoom','flareLeft','corruption','suspicion','huntRecoveryUntil'] as const;
const booleans=['blackout','lamp','openingReceived','openingScanned','earsPlugged','activeSonarEnabled','sonarPulseEnabled'] as const;
const maps=['stock','salvaged','containers','containerItems'] as const;
const sets=['filed','askedOnce'] as const;
const arrays=['bench','pending','heard','chart'] as const;
const timing=['breathAcc','siteIdleSec','hallucTimer','ghostTimer','huntActIndex','encounterSerial','transitElevation'] as const;
const strings=(v:unknown):v is string[]=>Array.isArray(v)&&v.every(x=>typeof x==='string');
const numericObject=(v:unknown)=>object(v)&&Object.values(v).every(n=>typeof n==='number'&&Number.isFinite(n));
const pairs=(v:unknown)=>Array.isArray(v)&&v.every(p=>Array.isArray(p)&&p.length===2&&typeof p[0]==='string');

export function isContainmentSave(v:unknown):v is ContainmentSave {
  if(!object(v)||v.version!==1||v.adapter!=='containment'||!Number.isInteger(v.seed)||v.seed<0||v.seed>0xffffffff||!Number.isFinite(v.savedAt)||v.savedAt<0)return false;
  const mission=new ContainmentMission();if(!mission.restore(v.mission))return false;
  const inSite=mission.phase==='survey'||mission.phase==='extraction';
  if(v.phase!==(inSite?'site':'transit'))return false;
  if(inSite){if(!object(v.site)||v.site.index!==mission.index||typeof v.site.adapter!=='string'||v.site.adapterVersion!==1||!Array.isArray(v.site.position)||v.site.position.length!==3||!v.site.position.every(Number.isFinite))return false;}
  else if(v.site!==null)return false;
  const r=v.run;
  if(!object(r)||!numbers.every(k=>Number.isFinite(r[k]))||!booleans.every(k=>typeof r[k]==='boolean'))return false;
  if(!maps.every(k=>pairs(r[k]))||!sets.every(k=>strings(r[k]))||!arrays.every(k=>Array.isArray(r[k])))return false;
  if(!['stock','salvaged'].every(k=>r[k].every((p:unknown[])=>typeof p[1]==='number'&&Number.isFinite(p[1])&&p[1]>=0)))return false;
  if(![r.power,r.hull,r.flood,r.scrubber].every(n=>n>=0&&n<=1)||r.hull<=0||r.traveled<0||r.camZoom<=0)return false;
  if(!numericObject(r.cabinPos)||!['x','y','z'].every(k=>Number.isFinite(r.cabinPos[k])))return false;
  if(!Array.isArray(r.containmentPosition)||r.containmentPosition.length!==3||!r.containmentPosition.every((n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=100000))return false;
  if(!numericObject(r.timing)||!timing.every(k=>Number.isFinite(r.timing[k])))return false;
  if(!Array.isArray(r.seams)||r.seams.some((n:unknown)=>!Number.isInteger(n)||Number(n)<0||Number(n)>5)||new Set(r.seams).size!==r.seams.length)return false;
  if(!Number.isInteger(r.tapeCursor)||r.tapeCursor<0||!strings(r.hookNudged)||!strings(r.firedBeats)||!pairs(r.footageRepeats))return false;
  if(!Array.isArray(r.tapes)||!r.tapes.every((t:unknown)=>object(t)&&typeof t.id==='string'&&typeof t.legId==='string'&&typeof t.siteName==='string'&&typeof t.analyzed==='boolean'&&strings(t.fauna)&&strings(t.report)&&Number.isFinite(t.atBreath)&&['identify','survey','reshoot'].includes(t.purpose)&&t.ready===true&&(t.sensorFrames===undefined||(strings(t.sensorFrames)&&t.sensorFrames.length>=3&&t.sensorFrames.every(f=>/^data:image\//.test(f))))))return false;
  if(new Set(r.tapes.map((t:Obj)=>t.id)).size!==r.tapes.length)return false;
  // Mission acknowledgements must be backed by the same run/dispatch's real
  // archived media, not just a matching reel name from another assignment.
  const covered=new Set<string>();
  for(const id of v.mission.evidenceIds){
    const tape=r.tapes.find((t:Obj)=>t.id===id),stamp=tape?.siteEvidence?.containment;
    if(!object(stamp)||stamp.seed!==v.seed||stamp.missionIndex!==mission.index||stamp.epoch!==v.mission.epoch||!strings(stamp.ids))return false;
    if(!((tape.sensorFrames?.length??0)>=3||tape.videoResult==='video'))return false;
    for(const creature of stamp.ids)if(mission.required.includes(creature))covered.add(creature);
  }
  if(v.mission.submitted.some((id:string)=>!covered.has(id)))return false;
  if(!object(v.vitals)||!numericObject(v.vitals.v)||v.vitals.v.oxygen<=0||v.vitals.death!==null||!Array.isArray(v.vitals.fx))return false;
  if(!Object.entries(VITAL_BOUNDS).every(([k,[lo,hi]])=>v.vitals.v[k]>=lo&&v.vitals.v[k]<=hi)||!(v.vitals.v.oxygenMax>0&&v.vitals.v.oxygenMax<=4000)||!(v.vitals.v.sanMax>0&&v.vitals.v.sanMax<=100))return false;
  if(typeof v.vitals.holding!=='boolean'||!['heldFor','holdSaved','elapsed','drown','hullStress','hypoxicDwell','gasps','heldTotal'].every(k=>Number.isFinite(v.vitals[k])&&v.vitals[k]>=0))return false;
  if(!v.vitals.fx.every((fx:unknown)=>object(fx)&&typeof fx.id==='string'&&strings(fx.tags)&&Number.isFinite(fx.duration)&&Number.isInteger(fx.stacks)&&fx.stacks>=1&&(fx.tick===undefined||numericObject(fx.tick))&&(fx.modifiers===undefined||(Array.isArray(fx.modifiers)&&fx.modifiers.every((m:unknown)=>object(m)&&typeof m.stat==='string'&&['add','mul'].includes(m.op)&&Number.isFinite(m.value))))))return false;
  if(!object(v.flags)||!Object.values(v.flags).every(f=>typeof f==='string'||typeof f==='boolean'||(typeof f==='number'&&Number.isFinite(f))))return false;
  return true;
}

export function captureContainmentSave(run:PodRun):ContainmentSave|null {
  if(!run.containment||run.gmLevelSession||run.outcome.kind!=='alive'||run.arm.phase!=='stowed'||['exposing','developing'].includes(run.shot.phase)||run.tapes.some(t=>t.ready!==true))return null;
  if(run.mode!=='calm'||run.threat||run.charging||run.fx.spill>0||run.fx.lure>0)return null;
  const mission=run.containment.snapshot(),inSite=mission.phase==='survey'||mission.phase==='extraction';
  const live=run.authoredSite as (NonNullable<PodRun['authoredSite']>&{saveSafe?:boolean})|null;
  if(inSite&&(!live||live.index!==mission.index||live.saveSafe===false))return null;
  const runtime=run as unknown as Obj,r:Obj={};
  for(const k of [...numbers,...booleans])r[k]=runtime[k];
  for(const k of maps)r[k]=Array.from(run[k] as Map<string,unknown>);
  for(const k of sets)r[k]=Array.from(run[k]);
  for(const k of arrays)r[k]=run[k];
  // Keep a real beginning/middle/end minimum for every local reel, including
  // analyzed/submitted evidence, never a synthetic replacement image.
  r.tapes=run.tapes.map(({keyframe,prompt,fallbackPrompt,sensorFrames,...t})=>({...t,...(sensorFrames&&sensorFrames.length>=3?{sensorFrames:[sensorFrames[0],sensorFrames[Math.floor((sensorFrames.length-1)/2)],sensorFrames[sensorFrames.length-1]]}:{})}));
  r.cabinPos=run.cabinPos;r.containmentPosition=run.containmentPosition;r.tapeCursor=Math.max(0,run.tapeCursor);r.seams=run.seams;r.volumeAt=run.volumeAt;
  r.timing={};for(const k of timing)r.timing[k]=runtime[k];
  r.hookNudged=Array.from(runtime.hookNudged);r.firedBeats=Array.from(runtime.firedBeats);r.footageRepeats=Array.from(runtime.footageRepeats);
  const save=clone({version:1,adapter:'containment',seed:run.seed,savedAt:Date.now(),phase:inSite?'site':'transit',mission,site:inSite?live!.snapshot():null,run:r,vitals:run.vitals.serialize(),flags:run.flags.serialize()});
  if(!isContainmentSave(save))throw new Error('收容调查状态不符合存档契约；原记录保留。');
  return save;
}
export function writeContainmentSave(storage:ContainmentStorage,save:ContainmentSave):void {
  if(!isContainmentSave(save))throw new Error('拒绝写入无效收容记录。');
  const text=JSON.stringify(save);if(text.length>LIMIT)throw new Error('影像记录超过本地存档容量；原记录保留，请勿关闭游戏。');
  const slot=`${CONTAINMENT_SAVE_KEY}.${save.seed}`,previous=storage.getItem(slot);
  storage.setItem(slot,text);
  try{storage.setItem(CONTAINMENT_SAVE_KEY,JSON.stringify({version:1,slot}));}
  catch(error){if(previous!==null)storage.setItem(slot,previous);throw error;}
}
export function readContainmentSave(storage:ContainmentStorage):ContainmentSave|null {
  const raw=storage.getItem(CONTAINMENT_SAVE_KEY);if(raw===null)return null;
  const p=JSON.parse(raw);
  if(!object(p)||p.version!==1||typeof p.slot!=='string'||!/^ironlung\.containment\.v2\.\d+$/.test(p.slot))throw new Error('收容调查存档指针损坏；原记录保留。');
  const save=JSON.parse(storage.getItem(p.slot)??'null');
  if(!isContainmentSave(save)||p.slot!==`${CONTAINMENT_SAVE_KEY}.${save.seed}`)throw new Error('收容调查存档损坏或版本不兼容；原记录保留。');
  return save;
}
export function hasContainmentSave(storage?:ContainmentStorage):boolean {try{return !!readContainmentSave(storage??localStorage);}catch{return false;}}
export function containmentSlotTaken(storage:ContainmentStorage,seed:number):boolean{return storage.getItem(`${CONTAINMENT_SAVE_KEY}.${seed}`)!==null;}

function applyRun(run:PodRun,save:ContainmentSave):void {
  const r=clone(save.run),runtime=run as unknown as Obj;
  for(const k of [...numbers,...booleans])runtime[k]=r[k];
  for(const k of maps){const map=run[k] as Map<string,unknown>;map.clear();for(const [id,value] of r[k])map.set(id,value);}
  for(const k of sets){const set=run[k] as Set<string>;set.clear();for(const id of r[k])set.add(id);}
  for(const k of arrays){const list=run[k] as unknown[];list.splice(0,list.length,...r[k]);}
  run.tapes.splice(0,run.tapes.length,...r.tapes);run.tapeCursor=Math.min(r.tapeCursor,Math.max(0,r.tapes.length-1));
  Object.assign(run.cabinPos,r.cabinPos);run.containmentPosition=[...r.containmentPosition] as [number,number,number];run.volumeAt=r.volumeAt;run.seams.splice(0,run.seams.length,...r.seams);
  for(const k of timing)runtime[k]=r.timing[k];
  runtime.hookNudged=new Set(r.hookNudged);runtime.firedBeats=new Set(r.firedBeats);runtime.footageRepeats=new Map(r.footageRepeats);
  run.vitals.hydrate(clone(save.vitals));run.flags.hydrate(clone(save.flags));
  run.pilot.stop();run.navDriveEngaged=false;run.shot.phase='idle';run.shot.viewing=false;
}

/** A constructor can touch more than persisted fields (logs, scene callbacks,
 * transient controls, supplies). Keep their original references and contents,
 * rather than attempting rollback via capture, which may legitimately be vetoed.
 * External class instances (renderers/site/audio/bus) are not traversed. */
function checkpointRollback(run:PodRun):()=>void {
  const undo:(()=>void)[]=[],seen=new WeakSet<object>();
  const visit=(value:unknown,force=false):void=>{
    if(!value||typeof value!=='object'||seen.has(value))return;
    const proto=Object.getPrototypeOf(value);
    if(!force&&!Array.isArray(value)&&!(value instanceof Map)&&!(value instanceof Set)&&proto!==Object.prototype&&proto!==null)return;
    seen.add(value);
    if(value instanceof Map){
      const entries=[...value.entries()];for(const [,v] of entries)visit(v);
      undo.push(()=>{value.clear();for(const [k,v] of entries)value.set(k,v);});return;
    }
    if(value instanceof Set){const entries=[...value];undo.push(()=>{value.clear();for(const v of entries)value.add(v);});return;}
    const descriptors=Object.getOwnPropertyDescriptors(value);
    for(const d of Object.values(descriptors))if('value' in d)visit(d.value);
    undo.push(()=>{
      for(const key of Reflect.ownKeys(value))if(!Object.hasOwn(descriptors,key))Reflect.deleteProperty(value,key);
      Object.defineProperties(value,descriptors);
    });
  };
  visit(run,true);visit(run.pilot,true);visit(run.campaign,true);
  const vitals=clone(run.vitals.serialize()),flags=clone(run.flags.serialize());
  const mission=run.containment,missionState=mission?.snapshot();
  return ()=>{
    // Parent references first; child contents next restores overwritten arrays,
    // stock maps, tapes and plain objects without breaking external references.
    for(let i=undo.length-1;i>=0;i--)undo[i]();
    run.vitals.hydrate(vitals);run.flags.hydrate(flags);
    if(mission&&missionState)mission.restore(missionState);
  };
}
function disposeQuietly(site:PodRun['authoredSite']):void {
  try{site?.dispose();}catch(error){console.warn('[containment-save] scene cleanup failed',error);}
}
/** Preflight in an isolated run: bad adapter geometry/state cannot contaminate
 * the active resources, mission or scene. Factory must honor its target run. */
export function restoreContainmentSave(run:PodRun,save:ContainmentSave):boolean {
  if(!isContainmentSave(save)||run.seed!==save.seed)return false;
  const factory=run.createAuthoredSite;
  const stage=new PodRun(save.seed);stage.containment=new ContainmentMission();stage.containment.restore(save.mission);
  stage.phase=save.phase;stage.legIndex=save.mission.index;
  try{
    applyRun(stage,save);
    if(save.site){
      if(!factory)return false;
      stage.createAuthoredSite=index=>factory(index,stage);stage.ensureAuthoredSite();
      const site=stage.authoredSite as (NonNullable<PodRun['authoredSite']>&{restore?:(s:unknown)=>boolean})|null;
      if(!site?.restore||!site.restore(clone(save.site)))return false;
    }
  }catch{return false;}finally{disposeQuietly(stage.authoredSite);stage.authoredSite=null;}
  // Session calls this before ticking. Preserve the prior instance until the
  // new adapter has accepted exactly the snapshot already checked above.
  const oldSite=run.authoredSite,rollback=checkpointRollback(run);
  run.containment=stage.containment;run.phase=save.phase;run.legIndex=save.mission.index;run.authoredSite=null;run.authoredSiteError='';
  try{
    if(save.site){run.ensureAuthoredSite();const site=run.authoredSite as (NonNullable<PodRun['authoredSite']>&{restore?:(s:unknown)=>boolean})|null;if(!site?.restore||!site.restore(clone(save.site)))throw new Error('adapter rejected snapshot');}
    applyRun(run,save);
  }catch{
    const failedSite=run.authoredSite as PodRun['authoredSite'];
    if(failedSite!==oldSite)disposeQuietly(failedSite);
    rollback();return false;
  }
  // Disposal is after commit: a cleanup exception must not resurrect a partly
  // disposed previous scene or roll back a fully validated successful load.
  disposeQuietly(oldSite);return true;
}
