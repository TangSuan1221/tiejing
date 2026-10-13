import * as T from 'three';
import {beginExtend,beginGrip,ARM_PHASE_CN} from '../../sim/manipulator';
import {WindowLocks} from '../window-locks';
import {accelerateHarborMesh} from './harbor-raycast';
import type {AuthoredSite} from '../../sim/authored-site';
import type {PodRun} from '../../sim/run';
import {HarborFacility,type FacilityZone,type FacilityResult,type HarborCapture} from '../../sim/harbor-facility';
import {harborHullClear,HARBOR_HULL} from '../../sim/harbor-navigation';
import {harborRouteLookAhead} from '../../sim/harbor-route-guidance';
import {PodExpedition} from './pod-expedition';
import {createReferenceMaterials} from './reference-materials';
import {createHarborMaterials} from './harbor-materials';
import {createHarborRescueWorld,HARBOR_RESCUE_LAYOUT as L} from './harbor-rescue-world';
import {HarborRescueNavigation} from './harbor-rescue-navigation';
import {sonarDeskState} from '../sonar-desk';
import {HarborPursuit,PURSUIT_HULL_GAP} from '../../sim/harbor-pursuit';
import {HULL_WEAR,pumpBilge,seep,strikeSeep} from '../../sim/hull-wear';import {HARBOR_DATUM_DEPTH} from '../../sim/site-coords';
import {spawnedMonsterSubject,videoCreatureSubject} from '../../content/video-creatures';
import {lensView} from './video-lens';
import {MonsterSpawner,type SpawnVec} from '../../sim/monster-spawner';
import {SONAR_RANGE} from '../../sim/navigation-sonar';
import {HARBOR_SPAWN_TABLE,fitSpawnSubjects,spawnPassiveContacts,spawnShotRange} from '../../content/spawn-points';

const HIDDEN:[number,number,number]=[57,-40,11];
/** How far its movement carries through the hull without any instrument. */
const HULL_AUDIBLE=14;
const CLOSE_SHOT=6;

/** Deck 0 harbor: pressure doors, shore power, cargo gate and one acoustic hunter. No characters, no quest stages. */
export class HarborSite implements AuthoredSite {
 readonly index=0;readonly managesThreats=true;readonly spatialThreat=false;readonly diegeticGuidance=true;readonly managesNarrative=true;
 readonly base:PodExpedition;readonly facility=new HarborFacility();readonly navigationConsole:HarborRescueNavigation;readonly pursuit=new HarborPursuit();
 readonly spawner=new MonsterSpawner(HARBOR_SPAWN_TABLE);
 readonly world;readonly position;readonly visual;private referenceMaterials=createReferenceMaterials();private materials=createHarborMaterials(this.referenceMaterials);
 private camera=new T.PerspectiveCamera(64,1024/720,.08,120);private ray=new T.Raycaster();
 private elapsed=0;private sequence=0;private entryReached=false;private awake=false;private openedTimes=new Map<string,number>();
 private previousOptics:number[]|null=null;
 private liveFrameKey='';private liveFrameRevision=-1;
 private sonarEcho:HTMLCanvasElement|null=null;private echoSweep=-1;
 private threatBeepLeft=0;private audibleBurstLeft=0;private reserveAt=-99;
 noiseBurst(amount:number){if(amount>=.1)this.audibleBurstLeft=Math.max(this.audibleBurstLeft,.6);}
 constructor(readonly run:PodRun){
  this.base=new PodExpedition(run,0);this.world=this.base.world;this.position=this.base.position;
  this.position.set(11,0,10);run.heading=180;run.pitch=0;run.camPan=run.camTilt=0;seep(run);
  this.visual=createHarborRescueWorld(this.world,this.materials);this.world.colliders.push(...this.visual.solids,this.visual.gate.bounds);this.world.decorColliders.push(...this.visual.decor);
  this.world.walkable.push(new T.Box3(new T.Vector3(72,-1,1.6),new T.Vector3(82.2,5.5,26)));
  const self=this;
  this.navigationConsole=new HarborRescueNavigation({run,position:this.position,entryCoordinates:[11,0,16],photoCoordinates:L.observe,
   get signalAvailable(){return false;},get phase(){return self.objective;},canReply:false,photoCoordinatesReleased:true,serialDialogue:true,
   onHeard:()=>{},onReply:()=>false,
   targetReached:target=>{if(!L.power.every((v,i)=>Math.abs(v-target[i])<.1))return false;const hit=this.aimedInterface();return hit.id==='harbor.rescue.power'&&hit.distance<=3.4;},
   photoGuidance:()=>this.photoAssessment(),drawActive:(ctx,w,h)=>this.drawDrivingSonar(ctx,w,h,this.elapsed,true),
   monster:{get position(){return self.pursuit.position;},get hunting(){return self.awake&&!self.facility.state.isolated;}},
   spawnContacts:()=>spawnPassiveContacts(self.spawner.passiveContacts(self.position.toArray() as SpawnVec,self.run.heading)),
   waypointCatalog:[
    {position:[11,0,16],name:'接驳港入口 · A压力闸',detail:'艇首朝门，缓慢驶到3.4米内，Shift制动后按F开启压力门。'},
    {position:L.observe,name:'01 闸机 · 接驳面板',detail:'货仓闸门的开关面板。靠近面板按F开启或关闭闸门。'},
    {position:L.power,name:'02 配电箱 开关',detail:'岸电应急配电箱。靠近面板按F恢复供电；驶入3米内自动为艇载电池充电。'},
    {position:[77,1,22],name:'03 货仓闸口',detail:'隔离货仓的闸门外侧。闸门开启后由此驶入货仓。'},
    {position:L.lure,name:'03 隔离货仓 · 仓内',detail:'货仓内部。仓内发出的脉冲会把声源引进来；落下闸门即可把它关在里面。'},
   ]});
  this.world.root.updateMatrixWorld(true);
 }
 get complete(){return true;}
 get evidenceReady(){return false;}
 get elevation(){return this.position.y;}
 get description(){return this.base.description+' Deep-sea industrial harbor: fractured partition bridge, acoustic creature and isolation cargo bay. Preserve actual captured geometry; never invent future events.';}
 readonly coordinateDatum=HARBOR_DATUM_DEPTH;
 get pulseCostScale(){return this.facility.state.powered?1:1/3;}
 get objective(){
  if(this.run.power<.25&&this.zone()!=='power')return `电量低（${Math.round(this.run.power*100)}%）· 02配电箱可充电`+this.powerGuide();
  return '';
 }
 get hint(){return this.objective;}
 private doorGuide(){
  const next=['harbor.edge.A-C','harbor.edge.C-B'].find(id=>!this.base.state.opened.includes(id)),door=next&&this.world.doors.get(next);if(!door)return '';
  if(next==='harbor.edge.C-B'&&this.position.z<32){
   const path=this.base.level.edges.find(e=>e.id==='harbor.edge.A-C')!.path!;
   const route=[...path,[18,0,35] as [number,number,number],door.bounds.getCenter(new T.Vector3()).toArray() as [number,number,number]].map(p=>new T.Vector3(...p));
   return this.guide(harborRouteLookAhead(this.position,route),'维修弯道下一段');
  }
  return this.guide(door.bounds.getCenter(new T.Vector3()),'压力门');
 }
 private powerGuide(){
  if(this.podInCargo())return this.guide(new T.Vector3(77,0,19),'货仓闸口（先出仓，再去02配电箱）');
  if(this.position.x<34){
   const route=[[11,16],[11,22],[12,24],[14.5,25.5],[17,27],[18,30],[22,35],[32,35],[42,28]].map(([x,z])=>new T.Vector3(x,0,z));
   const flat=new T.Vector3(this.position.x,0,this.position.z);let i=0;route.forEach((p,k)=>{if(p.distanceTo(flat)<route[i].distanceTo(flat))i=k;});
   const next=route[route[i].distanceTo(flat)<4?Math.min(i+1,route.length-1):i];
   const total=route.slice(route.indexOf(next)).reduce((s,p,k,a)=>s+(k?p.distanceTo(a[k-1]):p.distanceTo(flat)),0);
   const shut=['harbor.edge.A-C','harbor.edge.C-B'].some(id=>!this.base.state.opened.includes(id));
   return this.guide(next,`去02配电箱的通道（全程约${total.toFixed(0)}米）下一段`)+(shut?' · 途中压力门没电也能开，到门前按F':'');
  }
  return this.guide(new T.Vector3(...L.power),'02配电箱');
 }
 private guide(c:T.Vector3,label:string){
  const dx=c.x-this.position.x,dz=c.z-this.position.z,bearing=(Math.atan2(dx,-dz)*180/Math.PI+360)%360,rel=((bearing-this.run.heading)%360+540)%360-180,a=Math.abs(rel);
  const side=a<15?'正前方':a>150?'正后方':rel>0?(a<60?'右前方':'右侧'):(a<60?'左前方':'左侧');
  return ` · ${label}在${side}${Math.hypot(dx,dz).toFixed(0)}米（航向${bearing.toFixed(0)}°）`;
 }
 private feedback(text:string){this.run.pushLog(text,'system');this.run.storyCaption=text;this.run.storyCaptionLeft=Math.max(4,Math.min(12,text.length*.13));}
 private windowLocks=new WindowLocks();
 resetWindowFocus(){this.windowLocks.reset();}
 drawWindowLocks(ctx:CanvasRenderingContext2D,w:number,h:number){
  this.pose();this.camera.aspect=w/h;this.camera.updateProjectionMatrix();
  this.windowLocks.draw(ctx,w,h,this.camera,()=>this.solids(),()=>{
   const hit=this.aimedInterface();
   const id=hit.id?.startsWith('harbor.rescue.')?hit.id:['harbor.edge.A-C','harbor.edge.C-B'].includes(hit.door)?hit.door:'';
   if(!id||hit.distance>8)return [];
   const point=this.camera.getWorldDirection(new T.Vector3()).multiplyScalar(hit.distance).add(this.position);
   return [{id,bounds:new T.Box3().setFromCenterAndSize(point,new T.Vector3(.08,.08,.08)),reach:3.4,enabled:true,verifiedDistance:hit.distance}];
  });
 }
 private aimVisualRevision=0;
 private aimMeshes:T.Mesh[]=[];
 private aimBroadBox=new T.Box3();private aimBroadHit=new T.Vector3();
 private aimedCache:{key:number[];value:{id:string;door:string;distance:number}}|null=null;
 private aimedInterface(){
  const key=[this.run.clock,this.elapsed,this.aimVisualRevision,this.position.x,this.position.y,this.position.z,this.run.heading,this.run.pitch,this.run.camPan,this.run.camTilt,this.run.camZoom];
  if(this.aimedCache&&key.every((v,i)=>v===this.aimedCache!.key[i]))return this.aimedCache.value;
  this.pose();this.world.root.updateMatrixWorld(true);this.ray.setFromCamera(new T.Vector2(),this.camera);this.ray.far=8;
  this.aimMeshes.length=0;
  this.world.root.traverseVisible(o=>{
   if(!(o instanceof T.Mesh))return;
   accelerateHarborMesh(o);
   // Merged floor/wall meshes have huge bounding spheres; their local AABB rejects most rays before triangle tests.
   if(!(o instanceof T.SkinnedMesh)&&o.geometry.boundingBox===null)o.geometry.computeBoundingBox();
   if(o instanceof T.InstancedMesh&&o.boundingBox===null)o.computeBoundingBox();
   const bounds=o instanceof T.SkinnedMesh||o instanceof T.InstancedMesh?o.boundingBox:o.geometry.boundingBox;
   if(bounds){
    this.aimBroadBox.copy(bounds).applyMatrix4(o.matrixWorld);
    if(!this.aimBroadBox.containsPoint(this.ray.ray.origin)&&
     (!this.ray.ray.intersectBox(this.aimBroadBox,this.aimBroadHit)||this.aimBroadHit.distanceTo(this.ray.ray.origin)>this.ray.far+1e-6))return;
   }
   this.aimMeshes.push(o);
  });
  const hit=this.ray.intersectObjects(this.aimMeshes,false)[0];
  let o:T.Object3D|null=hit?.object??null,id='',door='';while(o){id=id||o.userData.interactionId;door=door||o.userData.doorId;o=o.parent;}
  const value={id,door,distance:hit?.distance??Infinity};this.aimedCache={key,value};return value;
 }
 private interactionHint(){
  if(this.facilityArm)return this.facilityArm.done?'本次作业已结束 · 按「机械臂操作」或「收臂」收回':this.run.arm.phase==='aiming'?'机械臂已伸出 · 对准原目标按「机械臂操作」，「收臂」取消':ARM_PHASE_CN[this.run.arm.phase];
  const hit=this.aimedInterface();const door=['harbor.edge.A-C','harbor.edge.C-B'].includes(hit.door);if(!door&&!hit.id?.startsWith('harbor.rescue.'))return this.objective;
  const name=door?'压力门':'设施面板';if(hit.distance>3.4)return `${name}距艇 ${hit.distance.toFixed(1)}米 · 缓慢前进至3.4米内，制动后按「机械臂操作」`;
  return `「机械臂操作」 · 伸出机械臂操作${name}（${hit.distance.toFixed(1)}米） · 需照明与供电`;}
 private apply(result:FacilityResult){for(const line of result.events)this.feedback(line);if(result.damage){this.run.hull=Math.max(0,this.run.hull-result.damage);strikeSeep(this.run,this.nearbyCreature()?.bearing);this.run.onShake?.(.8);this.run.onCue?.('hull.crack',.8);}}
 private contactLeft:number=HULL_WEAR.contactInterval;
 private contactWarned=false;
 private wallAt=-99;
 /** While it still hears the pod it keeps pressing the hull it circles. */
 private tickContact(dt:number){
  const gap=this.pursuit.position.distanceTo(this.position);
  if(this.facility.state.isolated||!this.pursuit.hunting||gap>HARBOR_HULL.length/2+PURSUIT_HULL_GAP+.7){this.contactLeft=HULL_WEAR.contactInterval;return;}
  this.contactLeft-=dt;if(this.contactLeft>0)return;
  this.contactLeft=HULL_WEAR.contactInterval;
  this.run.hull=Math.max(0,this.run.hull-HULL_WEAR.contactDamage);strikeSeep(this.run,this.nearbyCreature()?.bearing);
  this.run.onShake?.(.35);this.run.onCue?.('hull.crack',.45);
  if(!this.contactWarned){this.contactWarned=true;this.feedback('艇壳在被什么东西挤压，接缝开始渗水。');}
 }
 private pose(){this.camera.position.copy(this.position);this.camera.rotation.set(-this.run.pitch*Math.PI/180-this.run.camTilt,-this.run.heading*Math.PI/180-this.run.camPan,0,'YXZ');this.camera.fov=64/Math.max(.5,this.run.camZoom);this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld(true);}
 private podInCargo(){return this.position.x>72.5&&this.position.x<81.7&&this.position.z<15.3;}
 private zone():FacilityZone{for(const k of ['observe','power','lure'] as const)if(this.position.distanceTo(new T.Vector3(...L[k]))<3.6)return k;return 'none';}
 private solids(){return [...this.world.colliders,...[...this.world.doors].filter(([id])=>!this.base.state.opened.includes(id)||this.elapsed-(this.openedTimes.get(id)??-99)<1.2).map(([,d])=>d.bounds),...(!this.facility.state.gateOpen?this.visual.gate.occluders:[])];}
 private visible(target:T.Vector3,max=30){this.pose();const d=target.distanceTo(this.position),p=target.clone().project(this.camera);if(d>max||d<.1||Math.abs(p.x)>.99||Math.abs(p.y)>.99||p.z>1||p.z< -1)return false;const ray=new T.Ray(this.position,target.clone().sub(this.position).normalize());return !this.solids().filter(b=>b!==this.visual.gate.bounds).some(b=>{if(b.containsPoint(target))return false;const q=ray.intersectBox(b,new T.Vector3());return q&&q.distanceTo(this.position)<d-.3;});}
 /** Set only while a film frame is drawn with the hunter pressed against the hull; live view never shows it. */
 private filmHunter=false;
 /** Within this range and unobstructed in frame, film records the hunter's body instead of leaving it to generated footage. */
 private closeShot(){return this.pursuit.position.distanceTo(this.position)<=CLOSE_SHOT&&this.creatureVisible();}
 private syncVisual(){this.aimVisualRevision++;const s=this.facility.state;
  this.visual.update({powered:s.powered,gateOpen:s.gateOpen,bridgeExtended:false,monsterPosition:this.pursuit.position.toArray() as [number,number,number],eliasPosition:HIDDEN,monsterVisible:this.filmHunter,rescued:true},this.elapsed);
  this.visual.gate.bounds.min.y=-1.25+this.visual.gate.mesh.position.y;this.visual.gate.bounds.max.y=4.25+this.visual.gate.mesh.position.y;this.world.root.updateMatrixWorld(true);}
 tick(dt:number){dt=Number.isFinite(dt)?Math.max(0,dt):0;this.elapsed+=dt;
  if(!this.entryReached&&this.position.distanceTo(new T.Vector3(11,0,16))<=3)this.entryReached=true;
  if(!this.awake&&this.entryReached&&this.position.x>27&&this.position.z>24)this.awake=true;
  if(this.run.power<.1&&this.run.activeSonarEnabled&&!this.facility.state.powered){this.run.toggleActiveSonar();this.feedback('低压保护：主动声纳自动断电，余电留给推进。被动声纳照常。'+this.powerGuide().slice(3));}
  if(this.zone()==='power'&&this.run.power<.95&&!this.run.blackout){this.run.power=1;pumpBilge(this.run,.3);this.feedback('岸电接上：艇载电池充满，舱底泵把积水抽走了一部分。');}
  if(this.run.power<.03&&!this.run.blackout&&this.elapsed-this.reserveAt>30){this.reserveAt=this.elapsed;this.run.power=.15;this.run.onCue?.('ui.error',.6);
   this.feedback('应急储备接入：仪表和推进保住了，余电只够开回02配电箱。'+this.powerGuide().slice(3));}
  const pulse=this.run.sonarEmitting,noise=Math.abs(this.run.pilot.speed)>.45||this.audibleBurstLeft>0;this.audibleBurstLeft=Math.max(0,this.audibleBurstLeft-dt);
  const monsterDistance=this.position.distanceTo(this.pursuit.position),audible=this.awake&&this.pursuit.hears(this.position,pulse,noise);
  const s0=this.facility.state;
  this.pursuit.tick(dt,this.position,pulse&&this.awake,noise&&this.awake,s0.gateOpen,s0.isolated,this.run.heading);
  this.apply(this.facility.step(dt,{activeSonar:audible&&pulse,monsterInside:this.pursuit.inside,monsterDistance}));
  this.spawner.tick(dt,{pod:this.position.toArray() as SpawnVec,canSee:p=>this.visible(new T.Vector3(...p),80)});
  this.tickContact(dt);
  this.navigationConsole.tick(dt);this.syncVisual();this.tickThreatBeep(dt);
 }
 /** Spawned individuals the shutter would record now, each with its live lens relation. */
 /** Ordinary fauna has no light of its own worth filming: it needs the floodlight. Larger tiers read as silhouettes. */
 private shotSpawns(){const lamp=this.run.lit&&this.run.powered;return this.spawner.active.filter(m=>(m.video.tier>1||lamp)&&this.visible(new T.Vector3(...m.position),spawnShotRange(m.video.tier,m.video.size.length)))
  .sort((a,b)=>this.position.distanceTo(new T.Vector3(...a.position))-this.position.distanceTo(new T.Vector3(...b.position)));}
 move(d:number){
  const moved=this.base.move(d);
  if(!moved&&Math.abs(this.run.pilot.speed)>HULL_WEAR.wallSpeed&&this.elapsed-this.wallAt>HULL_WEAR.wallCooldown){
   this.wallAt=this.elapsed;this.run.hull=Math.max(0,this.run.hull-HULL_WEAR.wallDamage);this.run.onCue?.('hull.crack',.35);this.run.onShake?.(.25);
  }
  return moved;
 }turn(d:number){return this.base.turn(d);}moveVertical(d:number){return this.base.moveVertical(d);}
 sonarPulse(_power:0|1|2){} // Emissions, not screen power, attract the creature.
 private facilityArm:{id:string;door:string;done:boolean}|null=null;
 interact(){
  const arm=this.run.arm;
  if(this.facilityArm?.done&&arm.phase==='aiming'){this.run.retractArm();return;}
  if(['extending','gripping','hauling','jammed','gone'].includes(arm.phase)){this.feedback(ARM_PHASE_CN[arm.phase]);return;}
  if(this.run.shot.viewing||this.run.outcome.kind!=='alive'){this.feedback('请切回实时镜头，确认潜艇可操作。');return;}
  if(this.run.driveBlock&&arm.phase!=='aiming'){this.feedback(this.run.driveBlock);return;}
  if(!this.run.lit||!this.run.powered){this.feedback('请开启照明并恢复液压供电，再操作机械臂。');return;}
  this.aimedCache=null;const hit=this.aimedInterface();
  if(hit.distance>3.4){this.feedback('机械臂未够到目标 · 对准表面并靠近至3.4米内');return;}
  const facility=hit.id?.startsWith('harbor.rescue.')||['harbor.edge.A-C','harbor.edge.C-B'].includes(hit.door);
  if(!facility){
   if(this.facilityArm){this.feedback('目标已改变，请按「收臂」后重新锁定。');return;}
   const item=this.base.level.items.find(i=>i.id===hit.id);
   if(item&&(item.kind==='cache'||item.kind==='pickup')){this.base.interact();return;}
   this.feedback('未对准可操作的门、箱子或设施。');return;
  }
  if(arm.phase==='stowed'){
   this.facilityArm={id:hit.id,door:hit.door,done:false};
   this.base.setExternalArmAnchor(this.ray.ray.at(hit.distance,new T.Vector3()));
   this.run.pilot.stop();this.run.navDriveEngaged=false;beginExtend(arm);
   this.run.power=Math.max(0,this.run.power-.01);this.run.addNoise(.2);this.run.onCue?.('arm.pump-start',.85);
   this.feedback('机械臂伸出中 · 到位后对准原目标，再按「机械臂操作」；「收臂」可取消');return;
  }
  if(!this.facilityArm||hit.id!==this.facilityArm.id||hit.door!==this.facilityArm.door){this.feedback('目标已改变，请先按「收臂」。');return;}
  beginGrip(arm,'harbor.facility.operation');this.run.addNoise(.1);this.run.onCue?.('arm.claw-wet',.8);
  this.feedback('机械爪正在操作，请等待动作完成。');
 }
 armEvent(kind:'grip'|'stowed',id?:string){
  if(!this.facilityArm)return this.base.armEvent(kind,id);
  if(kind==='stowed'){this.facilityArm=null;this.base.setExternalArmAnchor(null);return true;}
  if(id!=='harbor.facility.operation')return false;
  if(this.facilityArm.done)return true;
  this.aimedCache=null;const hit=this.aimedInterface();
  this.facilityArm.done=true;
  if(!this.run.lit||!this.run.powered||hit.distance>3.4||hit.id!==this.facilityArm.id||hit.door!==this.facilityArm.door){this.feedback('操作中断，未改变设施状态 · 按「收臂」后重试');return true;}
  this.commitFacility();return true;
 }
 private commitFacility(){
  this.aimedCache=null;
  const {id,door,distance}=this.aimedInterface();
  if(distance>3.4){this.feedback((door||id?.startsWith('harbor.rescue.'))?this.interactionHint():'这里没有可操作的设施。');return;}
  if(id?.startsWith('harbor.rescue.')){
   const zone=id.slice('harbor.rescue.'.length) as FacilityZone;
   if(zone==='lure'){this.feedback('货舱开关统一在01面板。');return;}
   const operation=this.facility.interact(zone);
   if(zone==='power'){this.run.power=1;this.run.blackout=false;pumpBilge(this.run,.3);this.run.vitals.restore({oxygen:this.run.vitals.vitals.oxygenMax-this.run.vitals.vitals.oxygen});}
   this.feedback(operation.events.join(' ')||'该设施当前没有可执行的操作。');
   this.syncVisual();return;
  }
  if(this.run.blackout){this.feedback('艇内总闸断开。到分析台点「恢复总闸」，再回来开门。');return;}
  if(door&&['harbor.edge.A-C','harbor.edge.C-B'].includes(door)){this.entryReached=true;if(!this.base.state.opened.includes(door)){this.base.openPassage(door);this.openedTimes.set(door,this.elapsed);this.feedback((this.run.powered?'压力门正在开启，等待门叶完全让开再通过。':'压力门走港区液压，不吃艇上的电。门叶在让开——里面02配电箱能补电。')+(door==='harbor.edge.A-C'?' 门后通道向右弯，C-B压力门在弯道尽头。':''));}return;}
  this.feedback(door?'该通道保持隔离。':'这里没有可操作的设施。');
 }
 private creatureVisible(){return this.visible(this.pursuit.position.clone().add(new T.Vector3(0,.8,0)),40);}
 private gateVisible(){return this.visible(new T.Vector3(...L.gate),40);}
 photoAssessment(){
  this.syncVisual();
  const yaw=((this.run.heading+this.run.camPan*180/Math.PI)%360+360)%360,pitch=this.run.pitch+this.run.camTilt*180/Math.PI;
  const creature=this.creatureVisible()||this.shotSpawns().length>0,gate=this.gateVisible();
  const text=creature?'取景内有未登记声源':gate?'取景内有货仓闸门':'取景内没有可核验目标，也可以照常曝光';
  return {kind:creature?'creature':gate?'gate':'scene',ready:creature||gate,text,detail:`曝光镜头 ${yaw.toFixed(0)}° / 俯仰 ${pitch.toFixed(0)}°`,position:this.position.toArray()};
 }
 prepareCapture(){if(this.run.power<.1)return {ok:false,message:'电量不足以曝光（快门和探照灯要吃一格电）。先回02配电箱补电'+this.powerGuide()};
  return {ok:true,message:'开始曝光；当前镜头记录实际视野，内容在分析台核验。'};}
 finishCapture(){if(this.previousOptics){[this.run.camPan,this.run.camTilt,this.run.camZoom]=this.previousOptics;this.previousOptics=null;}}
 videoContext(){
  const s=this.facility.state,monsterVisible=this.creatureVisible(),gateVisible=this.gateVisible();
  this.pose();
  const lamp=this.run.lit&&this.run.powered,depth=HARBOR_DATUM_DEPTH-this.position.y,optics={depth,view:lensView(this.camera,this.pursuit.position.clone().add(new T.Vector3(0,.8,0)),lamp)};
  const spawns=this.shotSpawns();this.pose();
  return {generatedMonsters:!this.closeShot(),depth,story:monsterVisible||gateVisible,settled:false,prefetchKey:JSON.stringify([s.isolated,s.gateOpen]),stateKey:JSON.stringify([s.isolated,s.powered,s.gateOpen,this.visual.gate.mesh.position.y,this.base.state.opened,monsterVisible?this.pursuit.position.toArray():null,spawns.map(m=>[m.id,m.position])]),
   nearestMonster:this.spawner.active.reduce((d,m)=>Math.min(d,this.position.distanceTo(new T.Vector3(...m.position))),this.position.distanceTo(this.pursuit.position)),
   scene:'Fully submerged deep-sea industrial harbor in dark water, no air or water surface; broken partition bridge and cargo isolation grille. Preserve the current camera image.',
   actors:[],
   monsters:fitSpawnSubjects(monsterVisible?[videoCreatureSubject('harbor','harbor:hunter','One individual [harbor.hunter]',optics)]:[],
    spawns.map(m=>spawnedMonsterSubject(m.video,{depth,view:lensView(this.camera,new T.Vector3(...m.position),lamp)}))),
   outcome:s.isolated?'Cargo gate already closed; creature remains confined behind it.':s.monsterInside?'The creature is inside the cargo enclosure. Show only slow movement within it; do not exit, attack or invent a new event.':'Record only the present positions; no predicted escape or attack.'};
 }
 captureEvidence(){const a=this.photoAssessment();return this.facility.capture({id:'harbor-'+(++this.sequence),capturedAt:this.elapsed,creatureVisible:this.creatureVisible(),gateVisible:this.gateVisible(),detail:`${a.detail}；艇位 ${a.position.map(v=>v.toFixed(1)).join(' / ')}。${a.text}`});}
 commitEvidence(value:unknown){this.facility.commitCapture(value as HarborCapture);}
 evidenceStatus(value:unknown){const e=value as HarborCapture|undefined;return {accepted:!!e&&this.facility.state.analyzed.includes(e.id),next:''};}
 analyzeEvidence(value:unknown){const v=value as {capture:HarborCapture;media:{playable:boolean}};if(!v?.capture||!v.media?.playable)return ['没有可播放的录像，请重新曝光。'];
  return this.facility.analyze(v.capture);
 }
 draw(ctx:CanvasRenderingContext2D,w:number,h:number,time:number,recording=false){
  // Cockpit monitors share one live optical circuit within a frame; never reuse photographic frames.
  const key=JSON.stringify([time,w,h,this.position.toArray(),this.run.heading,this.run.pitch,this.run.camPan,this.run.camTilt,this.run.camZoom,this.run.lit,this.facility.state,this.run.arm]);
  if(!recording&&key===this.liveFrameKey&&this.liveFrameRevision===this.aimVisualRevision){this.base.copyRenderedFrame(ctx,w,h);return;}
  this.liveFrameKey='';
  this.filmHunter=recording&&this.closeShot();
  try{this.syncVisual();this.base.draw(ctx,w,h,time,recording);}
  finally{if(this.filmHunter){this.filmHunter=false;this.syncVisual();}}
  if(!recording){this.liveFrameKey=key;this.liveFrameRevision=this.aimVisualRevision;queueMicrotask(()=>{this.liveFrameKey='';});}
 }
 /** Pulses only rebuild terrain; any creature in range with a clear line shows while the active set is powered. */
 private threatContacts(){
  if(!this.run.powered||!this.run.activeSonarEnabled)return [];
  const bodies=[this.pursuit.position.clone(),...this.spawner.active.map(m=>new T.Vector3(...m.position))];
  return bodies.map(p=>({p,distance:Math.hypot(p.x-this.position.x,p.z-this.position.z)})).filter(({p,distance})=>distance<=SONAR_RANGE&&this.echoClear(p));
 }
 private detectedThreatDistance(){
  const near=this.threatContacts().reduce((m,c)=>Math.min(m,c.distance),Infinity);
  return Number.isFinite(near)?near:null;
 }
 private echoClear(target:T.Vector3){
  const d=target.distanceTo(this.position);if(d<.01)return true;
  const ray=new T.Ray(this.position,target.clone().sub(this.position).normalize()),hit=new T.Vector3();
  return !this.solids().some(b=>!b.containsPoint(target)&&ray.intersectBox(b,hit)&&hit.distanceTo(this.position)<d-.5);
 }
 /** The hunter, or a passing spawned individual: both are real sources, only the hunter can touch the hull. */
 nearbyCreature(){
  const hunter=this.pursuit.position,sources=[{p:hunter,hunter:true},...this.spawner.active.map(m=>({p:new T.Vector3(...m.position),hunter:false}))];
  let best:{distance:number;bearing:number;contact:boolean}|null=null;
  for(const {p,hunter:isHunter} of sources){
   const distance=p.distanceTo(this.position);
   if(distance>HULL_AUDIBLE||(best&&distance>=best.distance))continue;
   const bearing=Math.atan2(p.x-this.position.x,-(p.z-this.position.z))-this.run.heading*Math.PI/180;
   best={distance,bearing,contact:isHunter&&!this.facility.state.isolated&&distance<=HARBOR_HULL.length/2+PURSUIT_HULL_GAP+.7};
  }
  return best;
 }
 private tickThreatBeep(dt:number){
  const d=this.detectedThreatDistance();  if(d===null){this.threatBeepLeft=0;return;}
  this.threatBeepLeft-=dt;
  if(this.threatBeepLeft<=0){this.run.onCue?.('sonar.threat',.45);this.threatBeepLeft=.18+1.42*Math.min(1,d/SONAR_RANGE);}
 }
 private drawThreat(ctx:CanvasRenderingContext2D,w:number,h:number,time:number,dedicated:boolean){
  const size=dedicated?Math.min(w,h/.93):Math.min(w*(this.run.lit?.28:.40),h*.66),x=dedicated?0:w-size-w*.025,y=dedicated?0:h*.22,scale=size*.30/SONAR_RANGE;
  for(const {p,distance} of this.threatContacts()){
   const a=Math.atan2(p.x-this.position.x,-(p.z-this.position.z))-this.run.heading*Math.PI/180;
   const r=Math.max(distance*scale,Math.max(12,2.5*scale)+12),px=x+size/2+Math.sin(a)*r,py=y+size*.48-Math.cos(a)*r;
   ctx.save();ctx.fillStyle='#ff334b';ctx.strokeStyle='#ff334b';ctx.lineWidth=2;ctx.globalAlpha=.8+.2*Math.sin(time*6);ctx.beginPath();ctx.arc(px,py,4,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(px,py,8,0,Math.PI*2);ctx.stroke();ctx.restore();
  }
 }
 drawDrivingSonar(ctx:CanvasRenderingContext2D,w:number,h:number,time:number,dedicated=false){
  if(!this.sonarEcho||this.sonarEcho.width!==w||this.sonarEcho.height!==h){this.sonarEcho=document.createElement('canvas');this.sonarEcho.width=w;this.sonarEcho.height=h;this.echoSweep=-1;}
  if(this.run.sweepPower>0&&this.run.sweepId!==this.echoSweep){this.echoSweep=this.run.sweepId;const c=this.sonarEcho.getContext('2d')!;c.clearRect(0,0,w,h);this.base.drawDrivingSonar(c,w,h,time,dedicated);}
  ctx.drawImage(this.sonarEcho,0,0);this.drawThreat(ctx,w,h,time,dedicated);ctx.save();ctx.fillStyle='#dfc98d';ctx.font='12px sans-serif';ctx.fillText(this.echoSweep<0?'开启脉冲获取回波':this.run.sonarEmitting?'脉冲测距中':'历史回波 · 停发静默',8,h-8);ctx.restore();
 }
 get sonarReadout(){return this.echoSweep<0?undefined:this.base.sonarReadout;}
 drawMap(ctx:CanvasRenderingContext2D,w:number,h:number){this.navigationConsole.draw(ctx,w,h);}
 snapshot(){return {...this.base.snapshot(),adapter:'harbor-site',adapterVersion:1,heading:this.run.heading,facility:this.facility.snapshot(),navigation:this.navigationConsole.snapshot(),sonarDesk:structuredClone(sonarDeskState(this.run)),entryReached:this.entryReached,awake:this.awake,elapsed:this.elapsed,sequence:this.sequence,pursuit:this.pursuit.snapshot(),spawns:this.spawner.snapshot()};}
 restore(value:unknown){const s=value as ReturnType<HarborSite['snapshot']>;
  if(!s||s.adapter!=='harbor-site'||s.adapterVersion!==1||!s.navigation||!s.sonarDesk||!Number.isFinite(s.elapsed)||!Number.isInteger(s.sequence)||s.sequence<0||s.elapsed<0||!Number.isFinite(s.heading)||typeof s.entryReached!=='boolean'||typeof s.awake!=='boolean')return false;
  const check=new HarborFacility();if(!check.restore(s.facility))return false;if(!HarborRescueNavigation.validateSnapshot(s.navigation))return false;
  const d=s.sonarDesk;if(!Array.isArray(d.fields)||d.fields.length!==3||!d.fields.every(x=>typeof x==='string')||!Array.isArray(d.records)||!Number.isFinite(d.frequency)||d.frequency<35||d.frequency>45||!Number.isInteger(d.axis)||d.axis<0||d.axis>2||!['home','result','history'].includes(d.page)||typeof d.message!=='string'||(d.target!==null&&(!Array.isArray(d.target)||d.target.length!==3||!d.target.every(Number.isFinite)))||d.records.some(r=>!r||typeof r.text!=='string'||typeof r.kind!=='string'||!Number.isFinite(r.frequency)||(r.recording!==undefined&&typeof r.recording!=='string'))||(d.selected!==undefined&&(!Number.isInteger(d.selected)||d.selected<0||d.selected>=Math.max(d.records.length,s.navigation.radioRecords?.length??0))))return false;
  if(!Array.isArray(s.position)||s.position.length!==3||!s.position.every(Number.isFinite)||!harborHullClear(new T.Vector3(...s.position),s.heading,this.world.walkable,[...this.world.colliders.filter(b=>b!==this.visual.gate.bounds),...(s.facility.gateOpen?[]:[this.visual.gate.bounds.clone().set(new T.Vector3(72.3,-1.25,15.7),new T.Vector3(81.7,4.25,16.3))]),...[...this.world.doors].filter(([id])=>!s.state?.opened?.includes(id)).map(([,door])=>door.bounds)]))return false;
  if(!new HarborPursuit().restore(s.pursuit))return false;
  // Saves from before spawn points carry no `spawns`; they start with an empty spawner.
  const spawns=s.spawns??new MonsterSpawner(HARBOR_SPAWN_TABLE).snapshot();if(!new MonsterSpawner(HARBOR_SPAWN_TABLE).restore(spawns))return false;
  if(!this.base.restore(s))return false;
  this.facility.restore(s.facility);this.pursuit.restore(s.pursuit);this.spawner.restore(spawns);this.navigationConsole.restore(s.navigation);Object.assign(sonarDeskState(this.run),structuredClone(d));
  this.entryReached=s.entryReached;this.awake=s.awake;this.elapsed=s.elapsed;this.sequence=s.sequence;
  this.syncVisual();return true;}
 dispose(){this.visual.dispose();this.base.dispose();this.materials.dispose();this.referenceMaterials.dispose();}
}
