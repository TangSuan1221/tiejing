/** Harbor facility facts: shore power, the cargo gate and whatever the gate holds. Spatial tests and film creation belong to the adapter. */
export type FacilityZone='none'|'observe'|'power'|'lure';
export interface HarborCapture {version:1;id:string;capturedAt:number;creatureVisible:boolean;gateVisible:boolean;gateOpen:boolean;monsterInside:boolean;isolated:boolean;detail:string}
export interface HarborFacilityState {version:1;powered:boolean;gateOpen:boolean;monsterInside:boolean;isolated:boolean;identified:boolean;noiseSeconds:number;noiseStrikes:number;damageTotal:number;captures:HarborCapture[];analyzed:string[]}
export interface FacilityResult {events:string[];damage:number}
export const FACILITY_TIMING=Object.freeze({noiseGrace:10,noiseStrike:6,damage:.10,strikeRange:6});
const fresh=():HarborFacilityState=>({version:1,powered:false,gateOpen:false,monsterInside:false,isolated:false,identified:false,noiseSeconds:0,noiseStrikes:0,damageTotal:0,captures:[],analyzed:[]});
const result=(...events:string[]):FacilityResult=>({events,damage:0});
const CREATURE_REPORT='录像核验：未登记生物。苍白半透明的躯体，长臂，三根带鳍膜的长指，没有腿，下身拖成柔软的鳍缘组织。它循声而来：主动脉冲在整个港区都听得见，推进器高速水流和金属撞击只在近处才会引来它。持续在它身边发射脉冲，它会撞击艇壳。';

export class HarborFacility {
 private value=fresh();
 private pending=new Map<string,HarborCapture>();
 get state():Readonly<HarborFacilityState>{return this.snapshot();}
 snapshot():HarborFacilityState{return structuredClone(this.value);}
 step(dt:number,input:{activeSonar:boolean;monsterInside:boolean;monsterDistance:number}):FacilityResult{
  const s=this.value,out=result();if(!Number.isFinite(dt)||dt<=0)return out;
  if(!s.isolated){
   if(s.monsterInside&&!input.monsterInside)out.events.push('声源离开了货仓。');
   if(!s.monsterInside&&input.monsterInside&&s.gateOpen)out.events.push('声源越过闸口，进入了03货仓。');
   s.monsterInside=input.monsterInside;
  }
  if(!s.isolated&&input.activeSonar&&input.monsterDistance<=FACILITY_TIMING.strikeRange){
   s.noiseSeconds+=dt;const strikes=Math.max(0,Math.floor((s.noiseSeconds-FACILITY_TIMING.noiseGrace)/FACILITY_TIMING.noiseStrike)+1);
   if(strikes>s.noiseStrikes){const damage=(strikes-s.noiseStrikes)*FACILITY_TIMING.damage;s.noiseStrikes=strikes;s.damageTotal+=damage;out.damage+=damage;out.events.push('有东西追着主动声纳撞上了艇壳！停止脉冲，屏幕可以保持通电。');}
  }else {s.noiseSeconds=0;s.noiseStrikes=0;}
  return out;
 }
 interact(zone:FacilityZone):FacilityResult{
  const s=this.value;
  if(zone==='power'){if(!s.powered){s.powered=true;return result('02配电箱恢复供电，货仓闸门面板已通电。');}return result('配电箱已供电。');}
  if(zone!=='observe')return result();
  if(!s.powered)return result('01闸机面板没有电，需先恢复02配电箱供电。');
  if(!s.gateOpen){s.gateOpen=true;s.isolated=false;return result('01闸机已开启，货仓闸门正在升起。');}
  s.gateOpen=false;s.isolated=s.monsterInside;
  return result(s.isolated?'闸门落下。声源被关在03货仓里。':'闸门落下，货仓闸口关闭。');
 }
 capture(c:Omit<HarborCapture,'version'|'gateOpen'|'monsterInside'|'isolated'>):HarborCapture{
  const s=this.value,old=s.captures.find(e=>e.id===c.id)??this.pending.get(c.id);if(old)return structuredClone(old);
  const e:HarborCapture={version:1,...c,gateOpen:s.gateOpen,monsterInside:s.monsterInside,isolated:s.isolated};
  this.pending.set(e.id,e);return structuredClone(e);
 }
 /** Commit only after the uninterrupted exposure finishes; facts remain those at shutter-open. */
 commitCapture(e:HarborCapture){
  const pending=this.pending.get(e?.id);if(!pending||JSON.stringify(pending)!==JSON.stringify(e))return;
  this.pending.delete(e.id);this.value.captures.push(structuredClone(e));
 }
 cancelCapture(id:string){this.pending.delete(id);}
 analyze(e:HarborCapture):string[]{
  const s=this.value,stored=s.captures.find(x=>x.id===e?.id);
  if(!stored||JSON.stringify(stored)!==JSON.stringify(e))return ['没有这份录像的存档。'];
  if(s.analyzed.includes(e.id))return ['这份录像已经核验。'];
  s.analyzed.push(e.id);const lines:string[]=[];
  if(e.creatureVisible){lines.push(s.identified?'录像核验：画面中是同一个未登记生物。':CREATURE_REPORT);if(!s.identified){s.identified=true;lines.push('声纳已登记该声纹：主动脉冲扫到的那个红点，就是它。');}}
  if(e.gateVisible)lines.push(e.gateOpen?'录像核验：货仓闸门处于升起状态。':e.isolated?'录像核验：货仓闸门已落下，生物被关在仓内。':'录像核验：货仓闸门已落下。');
  if(!lines.length)lines.push(e.detail||'画面里没有可核验的目标。');
  return lines;
 }
 restore(value:unknown):boolean{
  if(!value||typeof value!=='object')return false;const s=value as HarborFacilityState,base=fresh();
  for(const k of Object.keys(base) as (keyof HarborFacilityState)[]){const v=s[k],b=base[k];
   if(typeof b==='boolean'&&typeof v!=='boolean')return false;
   if(typeof b==='number'&&(typeof v!=='number'||!Number.isFinite(v)||v<0))return false;
   if(Array.isArray(b)&&!Array.isArray(v))return false;}
  if(s.version!==1||(s.gateOpen&&!s.powered)||(s.isolated&&(s.gateOpen||!s.monsterInside)))return false;
  const ids=new Set<string>();
  for(const e of s.captures){if(!e||e.version!==1||typeof e.id!=='string'||!e.id||ids.has(e.id)||!Number.isFinite(e.capturedAt)||typeof e.detail!=='string'||['creatureVisible','gateVisible','gateOpen','monsterInside','isolated'].some(k=>typeof e[k as keyof HarborCapture]!=='boolean'))return false;ids.add(e.id);}
  if(s.analyzed.some(id=>typeof id!=='string'||!ids.has(id)))return false;
  this.value=structuredClone(s);this.pending.clear();return true;
 }
}
