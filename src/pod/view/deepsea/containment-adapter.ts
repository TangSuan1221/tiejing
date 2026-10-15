import type {AuthoredSite} from '../../sim/authored-site';
import type {PodRun} from '../../sim/run';
import type {VideoContext} from '../../content/video-policy';
import {drawContainmentShutter} from '../containment-shutter';

type Capture=Record<string,unknown>;
type Stamp={seed:number;missionIndex:number;epoch:number;ids:string[]};
export type ContainmentAdapter=AuthoredSite&{recordContainment(text:string):void};
const object=(v:unknown):v is Capture=>!!v&&typeof v==='object'&&!Array.isArray(v);

/** Opt-in task adapter. All old scene/navigation/optical/video methods keep their
 * original receiver. Evidence lives in the existing saved tape, never today's world. */
export function wrapContainmentSite(run:PodRun,site:AuthoredSite):AuthoredSite|ContainmentAdapter{
 if(!run.containment)return site;
 let frozenIds:string[]=[];
 const bound=new Map<PropertyKey,unknown>();
 const recordContainment=(text:string)=>run.containmentRadio(text);
 const captureEvidence=()=>{
  frozenIds=[];
  const raw=site.captureEvidence?.(),capture:Capture=object(raw)?structuredClone(raw):{};
  const mission=run.containment,stamp=mission?.captureStamp();
  // Inspect the same authored optical slots used by actual video dispatch. Never
  // infer IDs from sonar radius, broad creature class, or current receipt position.
  const context:VideoContext|undefined=site.videoContext?.();
  if(stamp&&mission?.index===site.index&&run.lit&&capture.lensBlocked!==true){
   const sector=object(capture.containment)?capture.containment:null;
   if(site.index>=2&&sector&&Array.isArray(sector.ids)){
    const sectorIds=sector.ids;
    frozenIds=mission.required.filter(id=>sectorIds.includes(id)&&context?.monsters.some(subject=>subject.includes(`[${id}]`)));
   }else if(context){
    frozenIds=mission.required.filter(id=>context.monsters.some(subject=>subject.includes(`[${id}]`)));
    // Living's generatedMonsters=false means at least one close-shot individual,
    // not that every farther optical slot was drawn into the local sensor frames.
    if(site.index===1&&context.generatedMonsters===false){
     const views=(site as AuthoredSite&{creatures?:{views:readonly {id:string;position:readonly number[]}[]}}).creatures?.views;
     const p=site.position;
     frozenIds=frozenIds.filter(id=>views?.some(v=>v.id===id&&p&&Math.hypot(v.position[0]!-p.x,v.position[1]!-p.y,v.position[2]!-p.z)<=6));
    }
   }
  }
  capture.containment=stamp?{...stamp,seed:run.seed,ids:[...frozenIds]}:null;
  // PodRun's exposure stamping rewrites `containment`; media provenance deliberately
  // stays adjacent so it cannot be lost or reconstructed at receipt time.
  capture.containmentMedia={requiresGenerated:context?.generatedMonsters!==false,version:1};
  return capture;
 };
 const receiveTape=(recipient:'vance'|'elias',id:string)=>{
  if(recipient!=='vance')return site.receiveTape?.(recipient,id)??false;
  const reject=(reason:string)=>{recordContainment(`万斯：本卷未登记。${reason} 发送记录不等于调查回执。`);return false;};
  const mission=run.containment,tape=run.tapes.find(t=>t.id===id);
  if(!mission||mission.index!==site.index||!run.powered||!tape)return false;
  if(tape.ready===false)return reject('影像仍在显影，请就绪后重新发送。');
  if(tape.creatureMissing)return reject('成片未确认收容物，请重新取证。');
  if(!object(tape.siteEvidence)||!object(tape.siteEvidence.containment)||!object(tape.siteEvidence.containmentMedia))return reject('没有本次调查的完整曝光记录，请重新取证。');
  const stamp=tape.siteEvidence.containment as unknown as Stamp,media=tape.siteEvidence.containmentMedia;
  if(stamp.seed!==run.seed||!Array.isArray(stamp.ids)||media.version!==1||typeof media.requiresGenerated!=='boolean')return reject('曝光来源记录不符，请重新取证。');
  const generated=tape.videoResult==='video';
  // Generated success is the existing renderer/media adapter's settled flag, also
  // used by PodRun.analyze. Prompt-only/failed and unrendered far-field local frames
  // cannot satisfy an optical monster census.
  if(media.requiresGenerated&&!generated)return reject('本地备用帧只有环境，收容物成片尚未成功；请等待成片或重新曝光。');
  const frames=media.requiresGenerated?undefined:tape.sensorFrames;
  const result=mission.submit({id:tape.id,missionIndex:stamp.missionIndex,epoch:stamp.epoch,creatureIds:stamp.ids,frames,hasVideo:generated,playable:generated||(frames?.length??0)>=3});
  if(result.accepted)recordContainment(`${result.reason} ${run.containmentBrief}`);
  else reject(result.reason);
  return result.accepted;
 };
 const draw:AuthoredSite['draw']=(ctx,w,h,time,recording)=>{
  if(!run.containment?.windowOpen){drawContainmentShutter(ctx,w,h);return;}
  site.draw(ctx,w,h,time,recording);
 };
 const overrides:Record<string,unknown>={captureEvidence,containmentSubjects:()=>[...frozenIds],receiveTape,recordContainment,draw};
 return new Proxy(site,{
  get(target,key){
   if(typeof key==='string'&&Object.hasOwn(overrides,key))return overrides[key];
   const value=Reflect.get(target,key,target);
   if(typeof value!=='function')return value;
   if(!bound.has(key))bound.set(key,value.bind(target));
   return bound.get(key);
  },
  set(target,key,value){bound.delete(key);return Reflect.set(target,key,value,target);},
 }) as ContainmentAdapter;
}
