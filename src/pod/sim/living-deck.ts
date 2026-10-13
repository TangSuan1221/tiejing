import {LIVING_EXIT_Y,LIVING_ITEMS,LIVING_LIGHTS,LIVING_SPACES,LIVING_SPAWN,LIVING_TRIM_FLOOR_Y,type CreatureType,type Vec3} from '../content/living-deck-layout';

/** Deck −1 facility facts. Spatial tests, rendering and film creation belong to the adapter; creature facts only come from analyzed film. */
export type LivingStage='explore'|'complete';
export type LivingEvidenceKind='creature'|'probeCorpse'|'code'|'guide'|'delroy'|'gateOpen'|'valveLabel'|'none';
export interface LivingEvidence {version:1;id:string;epoch:number;kinds:LivingEvidenceKind[];creatures:CreatureType[];lensBlocked:boolean;lamp:boolean;valid:boolean;diagnostic?:string}
export interface LivingInput {pod:Vec3;heading:number;lamp:boolean;pulse:boolean;speed:number}
export interface LivingResult {events:string[];damage:number;cues:string[];noise?:{position:Vec3;loudness:number}}
export type ValveKey='heat'|'feed'|'cool';
/** `rejected`: targets in view whose framing would not be legible on film (too small, cropped, oblique), with the player-facing reason. */
export interface LivingCaptureSeen {targets:string[];creatures:CreatureType[];lensBlocked:boolean;lamp:boolean;gateOpen:boolean;rejected?:{id:string;reason:string}[]}
export interface LivingState {
 version:1;stage:LivingStage;epoch:number;pod:Vec3;space:string|null;leftShaft:boolean;
 collected:string[];valves:Record<ValveKey,boolean>;valveOps:number;slime:number;slimeCleared:boolean;
 timers:{gateLeft:number};
 identified:CreatureType[];captures:LivingEvidence[];analyzed:string[];
 codeVerified:boolean;gateOpening:boolean;gateOpen:boolean;ballast:boolean;extraLumens:number;damageTotal:number;complete:boolean;
}

export const LIVING_TIMING=Object.freeze({gate:8,gateRange:14,reach:5,slimeRate:.006,valveLoudness:1,armLoudness:.25});
const VALVE_ITEM:Record<ValveKey,string>={heat:'living.valve.heat',feed:'living.valve.feed',cool:'living.valve.cool'};
const ITEMS=new Map(LIVING_ITEMS.map(i=>[i.id,i]));
const BOXES=LIVING_ITEMS.filter(i=>i.kind==='box').map(i=>i.id);
const CREATURES:readonly CreatureType[]=['lumen','shade','blind','swarm'];
const KINDS:readonly LivingEvidenceKind[]=['creature','probeCorpse','code','guide','delroy','gateOpen','valveLabel','none'];
const CREATURE_LINES:Record<CreatureType,string>={
 lumen:'名称：趋光者 · 危险程度：高（贴附损伤艇壳） · 光敏感：趋光。录像核验：人形，面部始终朝向光源，皮下有淡青光点，下肢已分化成柔软组织。声纳标签：趋光者。它会向灯靠拢；关灯后它会停在最后见到光的地方。',
 shade:'名称：避光者 · 危险程度：中（近距离咬击） · 光敏感：畏光。录像核验：管状眼，半透明长体，在强光里收成一团。声纳标签：避光者。持续照射它会退开；黑暗里它会回到原处。',
 blind:'名称：盲猎者 · 危险程度：高（冲撞艇壳） · 声音敏感。录像核验：没有眼睛，体侧一排侧线孔。声纳标签：盲猎者。它追声音：主动脉冲、高速推进、金属撞击。静止或慢速（＜0.45 m/s）的艇它找不到；撞过一次会退开一阵。',
 swarm:'名称：玻璃鱼与端足虫群 · 危险程度：低（遮挡镜头） · 光敏感：趋光。录像核验：成群的玻璃鱼与端足虫。无害，但会扑灯、糊住镜头、盖住它们啃食的东西。',
};
const PASSWORD='0917';

const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const vec=(v:unknown):v is Vec3=>Array.isArray(v)&&v.length===3&&v.every(finite);
const dist=(a:Vec3,b:Vec3)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const spaceAt=(p:Vec3,prefer:string|null)=>{
 const inside=(s:typeof LIVING_SPACES[number])=>s.pod&&p[0]>=s.minX&&p[0]<=s.maxX&&p[1]>=s.floorY&&p[1]<=s.ceilY&&p[2]>=s.minZ&&p[2]<=s.maxZ;
 const own=LIVING_SPACES.find(s=>s.id===prefer);if(own&&inside(own))return own.id;
 return LIVING_SPACES.find(inside)?.id??null;
};
/** Practical emergency fixtures light a subject without the pod lamp. */
export const livingPracticalLight=(p:Vec3)=>LIVING_LIGHTS.some(l=>dist(l.position,p)<=l.range);
/** Slime tracks the valves: the nutrient line feeds it, the cooling return holds it back, heat is irrelevant. */
const slimeTarget=(v:Record<ValveKey,boolean>)=>v.cool?1:v.feed?.05:.75;

const fresh=():LivingState=>({version:1,stage:'explore',epoch:0,pod:[...LIVING_SPAWN.position],space:'S',leftShaft:false,
 collected:[],valves:{heat:false,feed:false,cool:false},valveOps:0,slime:.75,slimeCleared:false,timers:{gateLeft:0},
 identified:[],captures:[],analyzed:[],codeVerified:false,gateOpening:false,gateOpen:false,ballast:false,extraLumens:0,damageTotal:0,complete:false});
const result=(...events:string[]):LivingResult=>({events,damage:0,cues:[]});

export class LivingDeck {
 private value=fresh();
 private pending=new Map<string,LivingEvidence>();
 private heatClosedFor=0;
 get state():Readonly<LivingState>{return this.snapshot();}
 get complete(){return this.value.complete;}
 snapshot():LivingState{return structuredClone(this.value);}
 private sync(){this.value.stage=this.value.complete?'complete':'explore';}
 private near(p:Vec3,range:number){return dist(this.value.pod,p)<=range;}
 step(dt:number,input:LivingInput):LivingResult{
  const s=this.value,out=result();
  if(!finite(dt)||dt<0||!vec(input?.pod))return out;
  s.pod=[...input.pod];s.space=spaceAt(input.pod,s.space);
  if(!s.leftShaft&&(s.space!=='S'||input.pod[1]<=1.5)){s.leftShaft=true;out.events.push('竖井底部。宿舍外廊的应急灯还亮着几盏。');}
  let left=dt;
  while(left>0&&!s.complete){const d=Math.min(.25,left);left-=d;
   if(s.gateOpening){s.timers.gateLeft=Math.max(0,s.timers.gateLeft-d);
    if(s.timers.gateLeft===0){s.gateOpening=false;s.gateOpen=true;s.epoch++;out.events.push('闸门F的锁轮转开，闸门正在升起。');out.cues.push('gate.open');}}
   const target=slimeTarget(s.valves),step=LIVING_TIMING.slimeRate*d;
   s.slime=Math.abs(target-s.slime)<=step?target:s.slime+Math.sign(target-s.slime)*step;
   const cleared=s.slime<=.1;if(cleared!==s.slimeCleared){s.slimeCleared=cleared;s.epoch++;out.events.push(cleared?'污染走廊方向的水体在变清：粘液正在萎缩沉底。':'粘液又开始生长了。');}
   this.heatClosedFor=s.valves.heat&&!s.valves.feed?this.heatClosedFor+d:0;
   if(this.heatClosedFor>=60&&s.extraLumens===0){s.extraLumens=1;out.events.push('被动声纳：中庭方向多了一个缓慢移动的声源。');}
  }
  if(s.ballast&&s.space==='D'&&input.pod[1]<LIVING_EXIT_Y&&!s.complete){s.complete=true;out.events.push('配重拖着艇身沉入下行井。-1层的灯光留在头顶。');}
  this.sync();return out;
 }
 interact(itemId:string,_ctx:{lamp:boolean;powered:boolean;armStowed:boolean;pulse:boolean}):LivingResult{
  const s=this.value,item=ITEMS.get(itemId);if(!item||s.complete)return result();
  if(item.kind==='uplink')return this.uplink();
  if(item.kind==='box')return result('用机械臂夹取。');
  if(item.kind==='photo')return result('这需要拍下来，回分析台核验。');
  if(!this.near(item.position,LIVING_TIMING.reach))return result('距离太远，靠近后再操作。');
  if(item.kind==='pipe')return result('传递管道是空的。');
  const key=(Object.keys(VALVE_ITEM) as ValveKey[]).find(k=>VALVE_ITEM[k]===itemId);
  if(!key)return result();
  s.valves[key]=!s.valves[key];s.valveOps++;this.sync();
  return {...result(s.valves[key]?`${item.name}已关闭。阀轮的撞击声顺着管道传了出去。`:`${item.name}重新打开。阀轮又撞了一声。`),cues:['valve.clank'],noise:{position:item.position,loudness:LIVING_TIMING.valveLoudness}};
 }
 armCollected(itemId:string):LivingResult{
  const s=this.value,item=ITEMS.get(itemId);
  if(!item||item.kind!=='box'||s.collected.includes(itemId))return result();
  if(!this.near(item.position,LIVING_TIMING.reach))return result('机械臂够不到。');
  s.collected.push(itemId);const out=result();out.cues.push('arm.stow');out.noise={position:item.position,loudness:LIVING_TIMING.armLoudness};
  if(itemId==='living.box.ballast'){s.ballast=true;out.events.push('配重块挂上艇腹。配平舱可以把艇压进下行井了。');}
  else out.events.push(`${item.name}已收入货架。`);
  this.sync();return out;
 }
 capture(id:string,seen:LivingCaptureSeen):LivingEvidence{
  const s=this.value,old=s.captures.find(e=>e.id===id)??this.pending.get(id);if(old)return structuredClone(old);
  const targets=Array.isArray(seen?.targets)?seen.targets.filter(t=>typeof t==='string'&&ITEMS.has(t)):[];
  const lit=(p:Vec3)=>!!seen?.lamp||livingPracticalLight(p);
  const shown=targets.filter(t=>lit(ITEMS.get(t)!.position));
  const creatures=[...new Set((Array.isArray(seen?.creatures)?seen.creatures:[]).filter(c=>CREATURES.includes(c)))].sort();
  const kinds:LivingEvidenceKind[]=[];
  if(shown.includes('living.box.probe'))kinds.push('probeCorpse');
  if(shown.some(t=>Object.values(VALVE_ITEM).includes(t)))kinds.push('valveLabel');
  if(shown.includes('living.photo.guide'))kinds.push('guide');
  if(shown.includes('living.photo.delroy'))kinds.push('delroy');
  if(s.gateOpen&&seen?.gateOpen===true&&lit(ITEMS.get('living.uplink.gate')!.position))kinds.push('gateOpen');
  const creaturesLit=creatures.length>0&&lit(s.pod);if(creaturesLit)kinds.push('creature');
  const lensBlocked=seen?.lensBlocked===true;
  const rejected=Array.isArray(seen?.rejected)?seen.rejected.filter(r=>r&&typeof r.reason==='string'&&r.reason):[];
  const diagnostic=lensBlocked?'镜头被遮挡，画面里只有贴在镜头上的东西。':!kinds.length?(rejected.length?`废片：${rejected[0]!.reason}`:targets.length||creatures.length||seen?.gateOpen?'画面太暗，看不清目标。':'画面里没有可核验的目标。'):undefined;
  const e:LivingEvidence={version:1,id,epoch:s.epoch,kinds:kinds.length?kinds:['none'],creatures:creaturesLit?creatures:[],lensBlocked,lamp:seen?.lamp===true,valid:kinds.length>0&&!lensBlocked};
  if(diagnostic)e.diagnostic=diagnostic;
  this.pending.set(id,e);return structuredClone(e);
 }
 /** Commit only after the uninterrupted exposure finishes; facts remain those at shutter-open. */
 commitCapture(e:LivingEvidence){
  const s=this.value,pending=this.pending.get(e?.id);
  if(!pending||JSON.stringify(pending)!==JSON.stringify(e))return;
  this.pending.delete(e.id);s.captures.push(structuredClone(e));
 }
 cancelCapture(id:string){this.pending.delete(id);}
 readPasswordCard():string[]{
  if(!this.value.collected.includes('living.photo.code'))return ['尚未取回密码卡。用机械臂搜索管理员遗体的衣袋，收妥后再读取。'];
  this.value.codeVerified=true;this.sync();
  return [`从收回的证件夹中取出密码卡。闸门 F 密码：${PASSWORD}。`,'驶到闸门F外侧观察窗附近，按F经水声链路输入密码。'];
 }
 analyze(e:LivingEvidence):string[]{
  const s=this.value,stored=s.captures.find(x=>x.id===e?.id);
  if(!stored||JSON.stringify(stored)!==JSON.stringify(e))return ['没有这份录像的存档。'];
  if(!e.valid)return [e.diagnostic??'画面无法核验，需要重新拍摄。'];
  if(s.analyzed.includes(e.id))return ['这份录像已经核验。'];
  s.analyzed.push(e.id);const lines:string[]=[];
  for(const kind of e.kinds){
   if(kind==='creature')for(const c of e.creatures){if(!s.identified.includes(c)){s.identified.push(c);lines.push(CREATURE_LINES[c]);}}
   else if(kind==='probeCorpse')lines.push('录像核验：监控台边有一具潜水服遗体，腰间扣着一只探头箱。');
   else if(kind==='valveLabel')lines.push('录像核验：三路阀门——红环供热、黄环营养液、蓝环冷却回水。粘液包裹的是黄环管线的接缝。');
   else if(kind==='guide')lines.push('录像核验：应急开闸步骤——先拉手动泄压杆，再输入密码，最后转动锁轮。');
   else if(kind==='delroy')lines.push('录像核验：布告板上的一张旧表格，内容与设施操作无关。');
   else if(kind==='gateOpen'&&s.gateOpen)lines.push('录像核验：闸门F已经升起。');
  }
  if(!lines.length)lines.push('录像已归档。');
  this.sync();return lines;
 }
 uplink():LivingResult{
  const s=this.value;
  if(s.gateOpen)return result('闸门F已经开启。');
  if(s.gateOpening)return result('密码已输入，锁轮正在转动。');
  if(!s.codeVerified)return result('闸门F密码面板：需要四位密码。');
  if(!this.near(ITEMS.get('living.uplink.gate')!.position,LIVING_TIMING.gateRange))return result('离闸门观察窗太远，水声链路接不上门禁。');
  s.gateOpening=true;s.timers.gateLeft=LIVING_TIMING.gate;this.sync();
  return {...result('密码已经水声链路送入门禁，锁轮开始转动。'),cues:['tape.push']};
 }
 exitAllowed(y:number){return this.value.ballast||!(y<LIVING_TRIM_FLOOR_Y);}
 noteDamage(amount:number){if(finite(amount)&&amount>0)this.value.damageTotal+=amount;}
 restore(value:unknown):boolean{
  if(!value||typeof value!=='object')return false;const s=value as LivingState,base=fresh();
  for(const k of Object.keys(base) as (keyof LivingState)[]){const v=s[k],b=base[k];
   if(typeof b==='boolean'&&typeof v!=='boolean')return false;
   if(typeof b==='number'&&(!finite(v)||v<0))return false;
   if(Array.isArray(b)&&!Array.isArray(v))return false;}
  if(s.version!==1||!['explore','complete'].includes(s.stage)||!Number.isInteger(s.epoch)||!Number.isInteger(s.valveOps)||!Number.isInteger(s.extraLumens)||s.extraLumens>1||s.slime>1)return false;
  if(!vec(s.pod)||(s.space!==null&&!LIVING_SPACES.some(x=>x.id===s.space&&x.pod)))return false;
  if(!s.valves||typeof s.valves!=='object'||!(Object.keys(VALVE_ITEM) as ValveKey[]).every(k=>typeof s.valves[k]==='boolean'))return false;
  if(!s.timers||!finite(s.timers.gateLeft)||s.timers.gateLeft<0)return false;
  const strings=(a:unknown[])=>a.every(x=>typeof x==='string')&&new Set(a).size===a.length;
  if(!strings(s.collected)||!s.collected.every(id=>BOXES.includes(id))||!strings(s.analyzed)||!strings(s.identified)||!s.identified.every(c=>CREATURES.includes(c)))return false;
  const ids=new Set<string>();
  for(const e of s.captures){
   if(!e||e.version!==1||typeof e.id!=='string'||!e.id||ids.has(e.id)||!Number.isInteger(e.epoch)||e.epoch<0||e.epoch>s.epoch||!Array.isArray(e.kinds)||!e.kinds.length||!e.kinds.every(k=>KINDS.includes(k))||!Array.isArray(e.creatures)||!e.creatures.every(c=>CREATURES.includes(c)))return false;
   if(typeof e.lensBlocked!=='boolean'||typeof e.lamp!=='boolean'||typeof e.valid!=='boolean'||(e.diagnostic!==undefined&&typeof e.diagnostic!=='string'))return false;
   ids.add(e.id);
  }
  if(s.analyzed.some(id=>!ids.has(id)))return false;
  if(s.ballast!==s.collected.includes('living.box.ballast')||(s.codeVerified&&!s.collected.includes('living.photo.code')))return false;
  if((s.gateOpening||s.gateOpen)&&!s.codeVerified||(s.gateOpening&&s.gateOpen)||(!s.gateOpening&&s.timers.gateLeft>0)||(s.complete&&!s.ballast)||(s.stage!==(s.complete?'complete':'explore')))return false;
  this.value=structuredClone(s);this.heatClosedFor=0;this.pending.clear();return true;
 }
}
