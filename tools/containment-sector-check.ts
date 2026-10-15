import assert from 'node:assert/strict';
import {Box3,Vector3} from 'three';
import {ContainmentSector} from '../src/pod/view/deepsea/containment-sector';
import {harborHullClear} from '../src/pod/sim/harbor-navigation';
import type {PodRun} from '../src/pod/sim/run';

const near=(a:number,b:number)=>Math.abs(a-b)<.001;
let totalSteps=0;
for(const index of [2,3] as const){
 const state={heading:0,pitch:0,camTilt:0,camPan:0,camZoom:1,lit:true,powered:true,activeSonarEnabled:false,pilot:{speed:0}};
 const site=new ContainmentSector(state as unknown as PodRun,index);
 const valid=()=>assert.ok(harborHullClear(site.position,state.heading,site.world.walkable,site.world.colliders),'full hull outside legal space');
 const turn=(heading:number)=>{const delta=((heading-state.heading+540)%360)-180;state.heading=site.turn(delta);assert.ok(near(((state.heading-heading+540)%360)-180,0),'turn blocked');valid();};
 const leg=(x:number,z:number)=>{
  assert.ok(near(x,site.position.x)||near(z,site.position.z),'test route must be axis-aligned');
  const dx=x-site.position.x,dz=z-site.position.z,distance=Math.hypot(dx,dz);if(distance<.001)return;
  turn(Math.atan2(dx,-dz)*180/Math.PI);
  for(let remaining=distance;remaining>.000001;){const step=Math.min(.08,remaining);assert.ok(site.move(step),'route blocked');remaining-=step;valid();totalSteps++;}
  assert.ok(near(site.position.x,x)&&near(site.position.z,z),'route endpoint mismatch');
 };
 const initial=site.snapshot();assert.ok(site.restore(initial));valid();
 // A complete perimeter lap including both side aisles and north/south crossovers.
 for(const [x,z] of [[-23,20],[-23,-20],[23,-20],[23,20],[0,20]])leg(x!,z!);
 // Test vertical sweep at the entrance using the real 3m-high envelope.
 for(let i=0;i<10;i++){assert.ok(site.moveVertical(.1));valid();}
 for(let i=0;i<20;i++){assert.ok(site.moveVertical(-.1));valid();}
 for(let i=0;i<10;i++){assert.ok(site.moveVertical(.1));valid();}
 const captured=new Set<string>();
 const photo=(id:string)=>{turn(0);const evidence=site.captureEvidence();assert.ok(evidence.containment.ids.includes(id),`unphotographable ${id}`);captured.add(id);state.lit=false;assert.deepEqual(site.captureEvidence().containment.ids,[],'dark photo accepted');state.lit=true;};
 leg(-23,20);leg(-23,0);photo(`sector.${index}.a`);
 leg(-23,-20);leg(23,-20);leg(23,0);photo(`sector.${index}.b`);
 if(index===3){leg(23,-20);leg(0,-20);leg(0,-12);photo('sector.3.c');leg(0,-20);leg(23,-20);leg(23,20);}
 else leg(23,20);
 leg(0,20);
 assert.deepEqual([...captured].sort(),site.surveySubjects.map(s=>s.id).sort());
 // Occlusion: the straight line from entrance to the west subject crosses the core.
 const subject=site.animals[0]!;turn(Math.atan2(subject.position.x-site.position.x,-(subject.position.z-site.position.z))*180/Math.PI);
 assert.ok(!site.captureEvidence().containment.ids.includes(subject.id),'photographed through structural core');
 assert.ok(site.restore(initial));
 const bad=site.snapshot();assert.equal(site.restore({...bad,position:[0,99,0]}),false);assert.deepEqual(site.snapshot(),bad,'invalid restore mutated state');
 assert.equal(site.restore({...bad,animals:[]}),false);assert.deepEqual(site.snapshot(),bad);
 assert.equal(site.restore({...bad,animals:bad.animals.map((a,i)=>i?bad.animals[0]:a)}),false);assert.deepEqual(site.snapshot(),bad);
 // Poison decoration channel: none of the navigation/photo/sonar paths may read it.
 const poison=new Box3(new Vector3(-100,-100,-100),new Vector3(100,100,100));site.world.decorColliders.push(poison);
 leg(-23,20);leg(-23,0);photo(`sector.${index}.a`);state.activeSonarEnabled=true;site.sonarPulse(1);assert.ok(site.sonarReadout!.front>0);assert.ok(site.restore(initial));site.world.decorColliders.pop();
 // Both X and Y bounds reject movement without ever accepting a crossing step.
 leg(-23,20);turn(0);for(let i=0;i<800;i++){site.move(.08);valid();}assert.ok(site.position.z>=-25.5);
 for(let i=0;i<200;i++){site.moveVertical(.04);valid();}assert.ok(site.position.y<=2.5);
 console.log(`PASS sector ${index+1}: ${captured.size} subjects photographed from driven legal positions; full loop, vertical navigation, dark/occluded rejection, decoration isolation, atomic restore`);
 site.dispose();
}
console.log(`PASS ${totalSteps} swept route steps. Diagnostic prototype checks, not browser/AAA acceptance.`);
