import {LIVING_CREATURES} from '../content/living-deck-layout';

export type MissionPosition = readonly [number, number, number];
export type ContainmentPhase = 'transit' | 'survey' | 'extraction' | 'complete';
export interface ContainmentRoute {
  readonly name: string;
  readonly entry: MissionPosition;
  readonly exit: MissionPosition;
  readonly datum: number;
  readonly blindDistance: number;
  readonly required: readonly string[];
}
/** Census = authored containment individuals. Ambient swarms/random extras never lock departure. */
export const CONTAINMENT_ROUTES: readonly ContainmentRoute[] = Object.freeze([
  {name:'港区收容调查',entry:[11,0,10],exit:[11,0,10],datum:1012,blindDistance:90,required:['harbor.hunter']},
  {name:'生活区收容调查',entry:[7,0,7],exit:[7,0,7],datum:1040,blindDistance:110,required:LIVING_CREATURES.filter(c=>c.type!=='swarm').map(c=>c.id)},
  {name:'深层观察站 · 原型',entry:[0,0,20],exit:[0,0,20],datum:1250,blindDistance:125,required:['sector.2.a','sector.2.b']},
  {name:'收容核心 · 原型',entry:[0,0,20],exit:[0,0,20],datum:1460,blindDistance:145,required:['sector.3.a','sector.3.b','sector.3.c']},
] satisfies ContainmentRoute[]);

export interface ContainmentStamp {missionIndex: number; epoch: number}
export interface ContainmentEvidence extends ContainmentStamp {
  id: string;
  creatureIds: readonly string[];
  frames?: readonly string[];
  videoUrl?: string;
  /** Outer adapter has resolved a playable remote mediaId even without a public URL. */
  hasVideo?: boolean;
  /** Set only after the outer media adapter verifies decoded, playable media. */
  playable: boolean;
}
export interface ContainmentSnapshot {
  version: 1;
  index: number;
  phase: ContainmentPhase;
  windowOpen: boolean;
  transitDistance: number;
  epoch: number;
  submitted: string[];
  evidenceIds: string[];
}
const finitePosition=(v:unknown):v is MissionPosition=>Array.isArray(v)&&v.length===3&&v.every(n=>typeof n==='number'&&Number.isFinite(n));
const uniqueStrings=(v:unknown):v is string[]=>Array.isArray(v)&&v.every(s=>typeof s==='string'&&s.length>0&&s.length<=512)&&new Set(v).size===v.length;
const media=(v:unknown)=>typeof v==='string'&&/^(data:(image|video)\/|blob:|https?:\/\/|\/)/.test(v)&&v.length>8;

/** Pure mission state. No DOM, navigation teleport, resource changes or old-story mutations.
 * Snapshot integrity is consistency checking, not cryptographic anti-cheat.
 * The caller separately enforces stationary hull and retracted arm before exit.
 */
export class ContainmentMission {
  private state: ContainmentSnapshot={version:1,index:0,phase:'transit',windowOpen:false,transitDistance:0,epoch:1,submitted:[],evidenceIds:[]};
  get index(){return this.state.index;}
  get phase(){return this.state.phase;}
  get windowOpen(){return this.state.windowOpen;}
  get route(){return CONTAINMENT_ROUTES[this.index];}
  get required(){return this.route.required;}
  get submitted():readonly string[]{return [...this.state.submitted];}
  get transitDistance(){return this.state.transitDistance;}
  get remainingDistance(){return Math.max(0,this.route.blindDistance-this.transitDistance);}
  advanceTransit(distance:number):boolean {
    if(this.phase!=='transit'||!Number.isFinite(distance)||distance<0)return false;
    this.state.transitDistance=Math.min(this.route.blindDistance,this.transitDistance+distance);return true;
  }
  arrive():boolean {
    if(this.phase!=='transit'||this.remainingDistance>0)return false;
    this.state.phase='survey';return true;
  }
  setWindow(open:boolean):boolean {
    if(typeof open!=='boolean'||(open&&this.phase!=='survey'&&this.phase!=='extraction'))return false;
    this.state.windowOpen=open;return true;
  }
  captureStamp():ContainmentStamp|null {
    return (this.phase==='survey'||this.phase==='extraction')&&this.windowOpen?{missionIndex:this.index,epoch:this.state.epoch}:null;
  }
  submit(e:ContainmentEvidence):{accepted:boolean;reason:string;added:string[]} {
    const reject=(reason:string)=>({accepted:false,reason,added:[] as string[]});
    if(this.phase!=='survey'&&this.phase!=='extraction')return reject('尚未进入调查区域');
    if(!e||e.missionIndex!==this.index||e.epoch!==this.state.epoch)return reject('不是当前派遣的现场影像');
    if(typeof e.id!=='string'||!e.id.trim()||e.id.length>512)return reject('影像编号无效');
    if(this.state.evidenceIds.includes(e.id))return reject('影像已经提交');
    if(!uniqueStrings(e.creatureIds)||!e.creatureIds.length)return reject('没有可核验收容物');
    if(e.playable!==true||!((Array.isArray(e.frames)&&e.frames.length>=3&&e.frames.every(media))||media(e.videoUrl)||e.hasVideo===true))return reject('影像尚不可播放');
    const added=e.creatureIds.filter(id=>this.required.includes(id)&&!this.state.submitted.includes(id));
    if(!added.length)return reject('没有新的登记收容物');
    this.state.evidenceIds.push(e.id);this.state.submitted.push(...added);
    if(this.required.every(id=>this.state.submitted.includes(id)))this.state.phase='extraction';
    return {accepted:true,reason:this.phase==='extraction'?'万斯：资料齐全，撤离坐标已发送。':'万斯：影像已收到。',added};
  }
  canExit(position:MissionPosition):boolean {
    return this.phase==='extraction'&&finitePosition(position)&&Math.hypot(...position.map((v,i)=>v-this.route.exit[i]))<=4;
  }
  exit(position:MissionPosition):boolean {
    if(!this.canExit(position))return false;
    this.state.windowOpen=false;
    if(this.index===3){this.state.phase='complete';return true;}
    this.state={version:1,index:this.index+1,phase:'transit',windowOpen:false,transitDistance:0,epoch:this.state.epoch+1,submitted:[],evidenceIds:[]};return true;
  }
  snapshot():ContainmentSnapshot{return {...this.state,submitted:[...this.state.submitted],evidenceIds:[...this.state.evidenceIds]};}
  restore(value:unknown):boolean {
    if(!value||typeof value!=='object'||Array.isArray(value))return false;
    const s=value as ContainmentSnapshot;
    const keys=['version','index','phase','windowOpen','transitDistance','epoch','submitted','evidenceIds'];
    if(Object.keys(s).length!==keys.length||!keys.every(k=>Object.hasOwn(s,k)))return false;
    if(s.version!==1||!Number.isInteger(s.index)||s.index<0||s.index>3||s.epoch!==s.index+1)return false;
    if(!['transit','survey','extraction','complete'].includes(s.phase)||typeof s.windowOpen!=='boolean')return false;
    const r=CONTAINMENT_ROUTES[s.index];
    if(!Number.isFinite(s.transitDistance)||s.transitDistance<0||s.transitDistance>r.blindDistance)return false;
    if(!uniqueStrings(s.submitted)||!uniqueStrings(s.evidenceIds)||s.submitted.some(id=>!r.required.includes(id)))return false;
    if(s.evidenceIds.length>s.submitted.length||(s.submitted.length>0&&s.evidenceIds.length===0))return false;
    const full=r.required.every(id=>s.submitted.includes(id));
    if(s.phase==='transit'&&(s.windowOpen||s.submitted.length||s.evidenceIds.length))return false;
    if(s.phase!=='transit'&&s.transitDistance!==r.blindDistance)return false;
    if(s.phase==='survey'&&full)return false;
    if((s.phase==='extraction'||s.phase==='complete')&&!full)return false;
    if(s.phase==='complete'&&(s.index!==3||s.windowOpen))return false;
    this.state={...s,submitted:[...s.submitted],evidenceIds:[...s.evidenceIds]};return true;
  }
}
