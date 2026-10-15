import * as T from 'three';
import type {PodRun} from '../../sim/run';
import type {AuthoredSite,NavigationConsole,PassiveContact} from '../../sim/authored-site';
import {harborHullClear,sweepHarborHeading} from '../../sim/harbor-navigation';
import {scanNavigationSonar,sonarRay} from '../../sim/navigation-sonar';
import {sharedExpeditionRenderer} from './pod-expedition';
import {lexiconCreatureSubject} from '../../content/video-creatures';
import {lensView} from './video-lens';
import type {VideoContext} from '../../content/video-policy';
import {fitSpawnSubjects} from '../../content/spawn-points';

type Vec=[number,number,number];
type Animal={id:string;name:string;home:T.Vector3;position:T.Vector3;model:T.Group;phase:number};
const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
const vector=(v:unknown):v is Vec=>Array.isArray(v)&&v.length===3&&v.every(finite);
const bounds=(x:number,y:number,z:number,w:number,h:number,d:number)=>new T.Box3(new T.Vector3(x-w/2,y-h/2,z-d/2),new T.Vector3(x+w/2,y+h/2,z+d/2));

/** Playable survey greybox with local Three.js marine proxies, not final creature art.
 * Recorded reference frames omit proxies; generated appearances use the lexicon. */
export class ContainmentSector implements AuthoredSite {
 readonly position=new T.Vector3(0,0,20);
 readonly entry:Vec=[0,0,20];readonly exit:Vec=[0,0,20];
 readonly managesNarrative=true;readonly managesThreats=true;readonly spatialThreat=true;
 readonly descriptionOnly=false;readonly complete=false;
 readonly world={root:new T.Group(),colliders:[] as T.Box3[],decorColliders:[] as T.Box3[],walkable:[bounds(0,0,0,68,8,56)]};
 readonly navigationConsole:NavigationConsole;
 readonly animals:Animal[]=[];
 private scene=new T.Scene();private camera=new T.PerspectiveCamera(64,512/360,.05,100);
 private light=new T.SpotLight(0xb6ccd0,190,32,1.05,.85,1.3);
 private elapsed=0;private noise=0;private beep=0;
 private echo:{bearing:number;distance:number}[]=[];private echoPosition=new T.Vector3();private echoHeading=0;
 private target:number[]|null=null;
 sonarReadout?:{above:number;below:number;front:number;back:number;left:number;right:number};
 constructor(private readonly run:PodRun,readonly index:2|3){
  this.scene.background=new T.Color(0x010507);this.scene.fog=new T.FogExp2(0x02090d,.055);
  this.scene.add(this.world.root,this.camera,this.light,this.light.target,new T.HemisphereLight(0x243944,0x080706,.24));
  const metal=new T.MeshStandardMaterial({color:index===2?0x343c3b:0x37332f,metalness:.68,roughness:.77});
  const dark=new T.MeshStandardMaterial({color:0x171c1d,metalness:.55,roughness:.9});
  const trim=new T.MeshStandardMaterial({color:0x71624b,metalness:.5,roughness:.75});
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,mat:T.Material,solid:boolean)=>{
   const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=true;this.world.root.add(mesh);
   (solid?this.world.colliders:this.world.decorColliders).push(bounds(x,y,z,w,h,d));return mesh;
  };
  box(0,-4.25,0,70,.5,58,metal,true);box(0,4.25,0,70,.5,58,dark,true);
  box(-34.5,0,0,1,8,58,metal,true);box(34.5,0,0,1,8,58,metal,true);
  box(0,0,-28.5,68,8,1,metal,true);box(0,0,28.5,68,8,1,metal,true);
  if(index===2)box(0,0,0,20,8,18,dark,true);
  else {box(-8,0,0,9,8,16,dark,true);box(8,0,0,9,8,16,dark,true);}
  // Panels and ribs are visual only; broad corridors remain clear at boat height.
  for(let z=-24;z<=24;z+=8)for(const x of [-33.7,33.7])box(x,0,z,.12,7.9,.35,trim,false);
  for(let x=-28;x<=28;x+=8){box(x,-3.94,0,.025,.03,54,trim,false);box(x,3.8,0,.14,.25,54,dark,false);}
  for(const x of [-28,28])for(const z of [-22,22]){
   box(x,3.75,z,1.1,.16,.35,new T.MeshStandardMaterial({color:0x746850,emissive:0x89744d,emissiveIntensity:.5}),false);
   const lamp=new T.PointLight(0x8f8063,2,9,2);lamp.position.set(x,3.5,z);this.scene.add(lamp);
  }
  const homes:Vec[]=index===2?[[-23,0,-16],[23,0,-16]]:[[-23,0,-16],[23,0,-16],[0,0,-20]];
  const names=['鳍膜收容体','长躯收容体','伞膜收容体'];
  homes.forEach((p,i)=>{const model=this.marineProxy(i);model.position.fromArray(p);this.world.root.add(model);this.animals.push({id:`sector.${index}.${'abc'[i]}`,name:names[i]!,home:new T.Vector3(...p),position:new T.Vector3(...p),model,phase:i*2});});
  const self=this;
  this.navigationConsole={editing:false,get passiveContacts(){return self.contacts();},get target(){return self.target;},
   receivedCoordinates:`调查区 ${index+1} · 本地坐标`,setWaypoint(v){if(!vector(v))return false;self.target=[...v];return true;},
   controls:()=>[],action:()=>false,key:()=>false,draw:(ctx,w,h)=>self.drawMap(ctx,w,h),drawActive:(ctx,w,h)=>self.drawDrivingSonar(ctx,w,h),
   waypointBrief:()=>({title:'调查区导航',lines:self.target?[`X ${self.target[0]} / Y ${self.target[1]}`,`Z ${self.target[2]}`]:['等待坐标输入']}),
  };
 }
 get surveySubjects(){return this.animals.map(({id,name})=>({id,name}));}
 get coordinateDatum(){return this.index===2?1250:1460;}
 get elevation(){return this.position.y;}
 get description(){return `第${this.index+1}调查区 · 收容设施（原型）`;}
 get hint(){return '保持安静，拍摄收容物并提交给万斯。';}
 private marineProxy(kind:number){
  const root=new T.Group(),skin=new T.MeshStandardMaterial({color:kind===1?0x413339:0x475761,roughness:.46,metalness:.03});
  const membrane=new T.MeshStandardMaterial({color:0x25343f,side:T.DoubleSide,roughness:.66});
  const cartilage=new T.MeshStandardMaterial({color:0x929589,roughness:.68});
  const dark=new T.MeshStandardMaterial({color:0x0d1016,roughness:.32});
  const ellipsoid=(sx:number,sy:number,sz:number,x:number,y:number,z:number,mat:T.Material)=>{
   const mesh=new T.Mesh(new T.SphereGeometry(1,32,20),mat);mesh.scale.set(sx,sy,sz);mesh.position.set(x,y,z);root.add(mesh);return mesh;
  };
  // Three distinguishable marine plans: split fin-mantle, dorsal-ridged longbody,
  // and folded medusa bell. None uses a human body or a uniformly luminous orb.
  ellipsoid(kind===1?.53:1.02,kind===2?.64:.7,kind===1?2.4:1.2,0,0,0,skin);
  const tube=(points:T.Vector3[],radius:number,material:T.Material)=>root.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points),20,radius,7,false),material));
  if(kind===2){
   for(let i=0;i<12;i++){
    const a=i/12*Math.PI*2,x=Math.cos(a),z=Math.sin(a);
    // Thick marginal folds and bundled tentacles survive the distant silhouette.
    ellipsoid(.25,.21,.25,x,-.2,z,skin);
    tube([new T.Vector3(x,-.2,z),new T.Vector3(x*1.22,-.85,z*1.1),new T.Vector3(x*.72,-1.65,z*.65),new T.Vector3(x*.92,-2.12,z*.8)],.055,membrane);
    tube([new T.Vector3(0,.59,0),new T.Vector3(x*.7,.4,z*.7),new T.Vector3(x,-.1,z)],.025,cartilage);
   }
  }else{
   // Six scalloped lateral fin lobes, physically connected to the mantle.
   for(const sign of [-1,1])for(let j=0;j<3;j++){
    const fin=ellipsoid(kind===1?.42:.65,.07,.53,sign*(kind===1?.56:.98),-.08,.65-j*.65,membrane);fin.rotation.z=sign*(.28+j*.12);
   }
   const mouth=new T.Mesh(new T.TorusGeometry(kind===1?.39:.47,.065,10,32),skin);mouth.position.set(0,-.04,kind===1?2.08:1.03);root.add(mouth);
   ellipsoid(kind===1?.32:.4,.28,.075,0,-.04,kind===1?2.11:1.06,dark);
   for(let i=0;i<9;i++){
    const a=i/9*Math.PI*2,r=kind===1?.31:.38,z=kind===1?2.2:1.15;
    const tooth=new T.Mesh(new T.ConeGeometry(.035,.16,5),cartilage);tooth.position.set(Math.cos(a)*r,Math.sin(a)*r-.04,z);tooth.rotation.z=a+Math.PI/2;root.add(tooth);
   }
   for(const sign of [-1,1]){
    ellipsoid(.16,.2,.13,sign*.56,.25,kind===1?1.62:.77,cartilage);
    ellipsoid(.09,.14,.09,sign*.57,.26,kind===1?1.72:.87,dark);
   }
   if(kind===0)for(const sign of [-1,1])for(let i=0;i<2;i++){
    tube([new T.Vector3(sign*.48,-.3,1),new T.Vector3(sign*(.7+i*.2),-.5,1.5),new T.Vector3(sign*(.55+i*.3),-.8,2.1),new T.Vector3(sign*.3,-1.05,2.4)],.065,skin);
   }
   if(kind===1)for(let i=0;i<7;i++){
    const z=-1.7+i*.53,fin=new T.Mesh(new T.ConeGeometry(.23,.48,3),membrane);fin.position.set(0,.65,z);fin.rotation.y=Math.PI/2;root.add(fin);
   }
  }
  root.traverse(o=>{if(o instanceof T.Mesh){o.castShadow=true;o.receiveShadow=true;}});return root;
 }
 private clear(p:T.Vector3,heading=this.run.heading){return harborHullClear(p,heading,this.world.walkable,this.world.colliders);}
 move(distance:number){if(!finite(distance)||Math.abs(distance)>10)return false;const a=T.MathUtils.degToRad(this.run.heading);return this.translate(new T.Vector3(Math.sin(a)*distance,0,-Math.cos(a)*distance));}
 moveVertical(distance:number){return finite(distance)&&Math.abs(distance)<=10?this.translate(new T.Vector3(0,distance,0)):false;}
 private translate(delta:T.Vector3){const n=Math.max(1,Math.ceil(delta.length()/.04));delta.multiplyScalar(1/n);let moved=false;for(let i=0;i<n;i++){const next=this.position.clone().add(delta);if(!this.clear(next))break;this.position.copy(next);moved=true;}return moved;}
 turn(degrees:number){return finite(degrees)?sweepHarborHeading(this.run.heading,degrees,h=>this.clear(this.position,h)):this.run.heading;}
 interact(){}
 private lineClear(a:T.Vector3,b:T.Vector3){const d=a.distanceTo(b);if(d<.001)return true;const ray=new T.Ray(a.clone(),b.clone().sub(a).normalize());return !this.world.colliders.some(box=>{const hit=ray.intersectBox(box,new T.Vector3());return hit!==null&&hit.distanceTo(a)<d-.05;});}
 private pose(aspect=512/360){this.camera.position.copy(this.position);this.camera.rotation.set(-T.MathUtils.degToRad(this.run.pitch)-this.run.camTilt,-T.MathUtils.degToRad(this.run.heading)-this.run.camPan,0,'YXZ');this.camera.fov=64/Math.max(.5,this.run.camZoom);this.camera.aspect=aspect;this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld(true);}
 captureEvidence(){this.pose();const ids=this.run.lit?this.animals.filter(a=>{const q=a.position.clone().project(this.camera);return a.position.distanceTo(this.position)<=24&&q.z>=-1&&q.z<=1&&Math.abs(q.x)<.9&&Math.abs(q.y)<.85&&this.lineClear(this.position,a.position);}).map(a=>a.id):[];return {containment:{index:this.index,ids}};}
 videoContext():VideoContext{
  const ids=this.captureEvidence().containment.ids,depth=this.coordinateDatum-this.position.y;
  this.pose();
  return {generatedMonsters:true,story:false,settled:false,depth,
   stateKey:JSON.stringify([this.index,this.animals.map(a=>[a.id,a.position.toArray()]),ids]),
   nearestMonster:Math.min(...this.animals.map(a=>a.position.distanceTo(this.position))),
   scene:'Fully submerged deep-sea industrial containment sector. Preserve the structures, occlusion and camera framing in the environment reference.',actors:[],
   monsters:fitSpawnSubjects([],this.animals.filter(a=>ids.includes(a.id)).map(a=>lexiconCreatureSubject(2,`containment:${a.id}`,`One individual [${a.id}]`,{depth,view:lensView(this.camera,a.position,this.run.lit)}))),
   outcome:'Record only current visible individuals in their present positions. No escape, attack, injury or door transition.'};
 }
 prepareCapture(){return {ok:true};}
 private bearing(p:T.Vector3){return Math.atan2(p.x-this.position.x,-(p.z-this.position.z))-T.MathUtils.degToRad(this.run.heading);}
 private contacts():PassiveContact[]{const labels=['前方','右前方','右舷','右后方','后方','左后方','左舷','左前方'];return this.animals.filter(a=>a.position.distanceTo(this.position)<65).map((a,i)=>({id:a.id,kind:'unknown',label:'未登记声源',form:'深水低频涌动',frequency:36+i*2.5,width:.5,intensity:.5,bearing:labels[Math.round((this.bearing(a.position)+Math.PI*4)/(Math.PI/4))%8]!}));}
 nearbyCreature(){const a=[...this.animals].sort((a,b)=>a.position.distanceToSquared(this.position)-b.position.distanceToSquared(this.position))[0];if(!a)return null;const distance=a.position.distanceTo(this.position);return distance<=14?{distance,bearing:this.bearing(a.position),contact:distance<4}:null;}
 sonarPulse(power:0|1|2){if(!power||!this.run.powered||!this.run.activeSonarEnabled)return;this.echo=scanNavigationSonar(this.position,this.run.heading,this.world.colliders);this.echoPosition.copy(this.position);this.echoHeading=this.run.heading;const a=T.MathUtils.degToRad(this.run.heading);const ray=(offset:number,margin:number)=>Math.max(0,sonarRay(this.position,Math.sin(a+offset),-Math.cos(a+offset),this.world.colliders)-margin);this.sonarReadout={above:2.5-this.position.y,below:this.position.y+2.5,front:ray(0,2.5),back:ray(Math.PI,2.5),left:ray(-Math.PI/2,1.4),right:ray(Math.PI/2,1.4)};}
 noiseBurst(amount:number){if(finite(amount)&&amount>0)this.noise=Math.max(this.noise,Math.min(3,amount*3));}
 tick(dt:number){if(!finite(dt)||dt<=0)return;dt=Math.min(dt,.25);this.elapsed+=dt;this.noise=Math.max(0,this.noise-dt);const noisy=(this.run.powered&&this.run.activeSonarEnabled)||Math.abs(this.run.pilot.speed)>.45||this.noise>0;
  for(const a of this.animals){const following=noisy&&a.position.distanceTo(this.position)<28&&this.lineClear(a.position,this.position),target=following?this.position:a.home;const delta=target.clone().sub(a.position),d=delta.length();if(d>(following?4.5:.05)){const next=a.position.clone().addScaledVector(delta,Math.min(d,(following?.55:.24)*dt)/d);const animalBox=bounds(next.x,next.y,next.z,3.2,4.5,5.2);if(this.world.walkable[0]!.containsBox(animalBox)&&!this.world.colliders.some(b=>b.intersectsBox(animalBox)))a.position.copy(next);}a.model.position.copy(a.position);a.model.rotation.z=Math.sin(this.elapsed*.35+a.phase)*.06;}
  this.beep-=dt;if(this.beep<=0&&this.run.powered&&this.run.activeSonarEnabled){const close=this.animals.filter(a=>a.position.distanceTo(this.position)<=24&&this.lineClear(this.position,a.position));if(close.length){this.run.onCue?.('sonar.threat',.3);this.beep=1.2;}}
 }
 draw(ctx:CanvasRenderingContext2D,w:number,h:number,_time:number,recording=false){this.pose(w/h);this.light.position.copy(this.position);this.light.target.position.copy(this.position).add(this.camera.getWorldDirection(new T.Vector3()).multiplyScalar(12));this.light.intensity=this.run.lit?190:0;const {renderer}=sharedExpeditionRenderer();const size=renderer.getSize(new T.Vector2()),exposure=renderer.toneMappingExposure,target=renderer.getRenderTarget();const visibility=this.animals.map(a=>a.model.visible);try{if(recording)this.animals.forEach(a=>a.model.visible=false);renderer.setRenderTarget(null);renderer.setSize(w,h,false);renderer.toneMappingExposure=.7;renderer.render(this.scene,this.camera);ctx.drawImage(renderer.domElement,0,0,w,h);}finally{this.animals.forEach((a,i)=>a.model.visible=visibility[i]!);renderer.setSize(size.x,size.y,false);renderer.toneMappingExposure=exposure;renderer.setRenderTarget(target);}}
 drawDrivingSonar(ctx:CanvasRenderingContext2D,w:number,h:number){
  ctx.save();ctx.fillStyle='#030b06';ctx.fillRect(0,0,w,h);
  if(this.run.powered&&this.run.activeSonarEnabled){
   const r=Math.min(w,h)*.43,cx=w/2,cy=h/2;ctx.strokeStyle='#3c6543';
   for(const f of [.5,1]){ctx.beginPath();ctx.arc(cx,cy,r*f,0,Math.PI*2);ctx.stroke();}
   ctx.fillStyle='#aab57b';
   // Old terrain remains at its measured world position after the boat turns/moves.
   for(const e of this.echo){
    if(e.distance>=24)continue;
    const angle=T.MathUtils.degToRad(this.echoHeading)+e.bearing;
    const p=this.echoPosition.clone().add(new T.Vector3(Math.sin(angle)*e.distance,0,-Math.cos(angle)*e.distance));
    const d=Math.hypot(p.x-this.position.x,p.z-this.position.z),b=this.bearing(p);
    if(d<=24)ctx.fillRect(cx+Math.sin(b)*d/24*r-1,cy-Math.cos(b)*d/24*r-1,2,2);
   }
   ctx.fillStyle='#ed645d';for(const a of this.animals){const d=a.position.distanceTo(this.position);if(d<=24&&this.lineClear(this.position,a.position)){const b=this.bearing(a.position);ctx.beginPath();ctx.arc(cx+Math.sin(b)*d/24*r,cy-Math.cos(b)*d/24*r,4,0,Math.PI*2);ctx.fill();}}
   ctx.fillStyle='#bac9a0';ctx.fillRect(cx-2,cy-3,4,6);ctx.font='12px monospace';ctx.fillText(this.echo.length?'地形：上次脉冲 / 红点：实时':'发射脉冲获取地形',8,h-10);
  }
  ctx.restore();
 }
 drawMap(ctx:CanvasRenderingContext2D,w:number,h:number){this.drawDrivingSonar(ctx,w,h);}
 snapshot(){return {adapter:'containment-sector',adapterVersion:1,version:1,index:this.index,position:this.position.toArray(),heading:this.run.heading,elapsed:this.elapsed,animals:this.animals.map(a=>({id:a.id,position:a.position.toArray()})),target:this.target};}
 restore(value:unknown){const s=value as ReturnType<ContainmentSector['snapshot']>|null;if(!s||s.adapter!=='containment-sector'||s.adapterVersion!==1||s.version!==1||s.index!==this.index||!vector(s.position)||!finite(s.heading)||!finite(s.elapsed)||s.elapsed<0||!Array.isArray(s.animals)||s.animals.length!==this.animals.length||(s.target!==null&&!vector(s.target)))return false;
  const p=new T.Vector3(...s.position);if(!this.clear(p,s.heading))return false;const seen=new Set<string>();
  for(const a of s.animals){if(!a||!this.animals.some(x=>x.id===a.id)||seen.has(a.id)||!vector(a.position))return false;seen.add(a.id);const b=bounds(...a.position,3.2,4.5,5.2);if(!this.world.walkable[0]!.containsBox(b)||this.world.colliders.some(solid=>solid.intersectsBox(b)))return false;}
  this.position.copy(p);this.run.heading=s.heading;this.elapsed=s.elapsed;this.target=s.target?[...s.target]:null;for(const a of s.animals){const animal=this.animals.find(x=>x.id===a.id)!;animal.position.fromArray(a.position);animal.model.position.copy(animal.position);}this.echo=[];this.sonarReadout=undefined;this.noise=0;return true;
 }
 dispose(){const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>();this.scene.traverse(o=>{if(o instanceof T.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());this.scene.clear();}
}
