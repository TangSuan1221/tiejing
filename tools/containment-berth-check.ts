import assert from 'node:assert/strict';
import {PodRun} from '../src/pod/sim/run';
import {ContainmentMission} from '../src/pod/sim/containment-mission';
import type {AuthoredSite} from '../src/pod/sim/authored-site';

const run=new PodRun(38124),mission=new ContainmentMission();
run.containment=mission;mission.advanceTransit(mission.route.blindDistance);assert.ok(mission.arrive());
run.phase='site';const [x,y,z]=mission.route.entry,position={x,y,z};
run.authoredSite={index:0,position} as AuthoredSite;
const reset=()=>{Object.assign(position,{x,y,z});run.phase='site';run.pilot.stop();run.arm.phase='stowed';run.shot.phase='idle';run.shot.viewing=false;run.charging=false;run.driveInputBlocked=false;run.power=.45;run.blackout=false;};
const resources=()=>({power:run.power,blackout:run.blackout,scrubber:run.scrubber,oxygen:run.vitals.vitals.oxygen,hull:run.hull,flood:run.flood,leak:run.leak,seams:[...run.seams]});
const denied=(label:string)=>{const before=resources();assert.equal(run.serviceContainment(),false,label);assert.deepEqual(resources(),before,label+' changed resources');};
reset();assert.equal(run.atContainmentBerth,true);
for(const axis of ['x','y','z'] as const)for(const sign of [-1,1]){
 reset();position[axis]+=sign*4;assert.equal(run.atContainmentBerth,true,axis+' exact 4m boundary');assert.ok(run.serviceContainment());
 reset();position[axis]+=sign*4.001;assert.equal(run.atContainmentBerth,false,axis+' beyond 4m');denied(axis+' outside');
}
reset();position.x+=3;position.y+=3;assert.equal(run.atContainmentBerth,false,'3D diagonal distance, not per-axis box');denied('diagonal');
reset();run.phase='transit';assert.equal(run.atContainmentBerth,false);denied('transit');
reset();const site=run.authoredSite;run.authoredSite=null;denied('missing site');run.authoredSite=site;
reset();run.containment=null;denied('legacy mode');run.containment=mission;
for(const speed of ['speed','verticalSpeed','yawRate','pitchRate'] as const)for(const sign of [-1,1]){
 reset();run.pilot[speed]=sign*.1;denied(speed+' exact boundary');
 reset();run.pilot[speed]=sign*.099;assert.ok(run.serviceContainment(),speed+' just below boundary');
}
for(const arm of ['extending','aiming','gripping','jammed','hauling'] as const){reset();run.arm.phase=arm;denied(arm);}
for(const shot of ['exposing','developing'] as const){reset();run.shot.phase=shot;denied(shot);}
reset();run.power=.01;run.blackout=true;run.scrubber=.12;run.vitals.restore({oxygen:-500});run.hull=.37;run.flood=.26;run.leak=.004;run.seams=[0,3];
const damage={hull:run.hull,flood:run.flood,leak:run.leak,seams:[...run.seams]};assert.ok(run.serviceContainment(),'blackout recovery');
assert.equal(run.power,1);assert.equal(run.blackout,false);assert.equal(run.scrubber,1);assert.equal(run.vitals.vitals.oxygen,run.vitals.vitals.oxygenMax);
assert.deepEqual({hull:run.hull,flood:run.flood,leak:run.leak,seams:run.seams},damage,'service must not repair hull, seams or flooding');
assert.ok(run.serviceContainment());assert.equal(run.vitals.vitals.oxygen,run.vitals.vitals.oxygenMax,'repeat supply not additive overflow');

reset();assert.equal(run.canDepart,false,'unsubmitted census');mission.setWindow(true);
assert.ok(mission.submit({id:'berth-test',...mission.captureStamp()!,creatureIds:[...mission.required],hasVideo:true,playable:true}).accepted);
reset();assert.equal(run.canDepart,true,'complete census at berth');
for(const axis of ['x','y','z'] as const)for(const sign of [-1,1]){
 reset();position[axis]+=sign*4;assert.equal(run.canDepart,true,axis+' departure boundary');
 reset();position[axis]+=sign*4.001;assert.equal(run.canDepart,false,axis+' departure beyond boundary');
}
reset();position.x+=3;position.y+=3;assert.equal(run.canDepart,false,'departure uses 3D sphere');
for(const speed of ['speed','verticalSpeed','yawRate','pitchRate'] as const)for(const sign of [-1,1]){
 reset();run.pilot[speed]=sign*.1;assert.equal(run.canDepart,false,speed+' .1 blocks departure');
 reset();run.pilot[speed]=sign*.099;assert.equal(run.canDepart,true,speed+' .099 allows departure');
}
for(const arm of ['extending','aiming','gripping','jammed','hauling'] as const){reset();run.arm.phase=arm;assert.equal(run.canDepart,false,arm+' blocks departure');}
reset();run.shot.phase='exposing';assert.equal(run.canDepart,false,'exposure blocks departure');
reset();run.shot.phase='developing';assert.equal(run.canDepart,true,'finished capture may develop while escaping');
reset();run.shot.viewing=true;assert.equal(run.canDepart,false,'replay blocks controls');
reset();run.power=.01;assert.equal(run.canDepart,false,'unpowered departure');
reset();run.blackout=true;assert.equal(run.canDepart,false,'blackout departure');
reset();run.charging=true;assert.equal(run.canDepart,false,'charging cable departure');
reset();run.driveInputBlocked=true;assert.equal(run.canDepart,false,'modal controls departure');
console.log('PASS berth: 4m 3D boundary; four signed .1 motion gates; arm/exposure/development interlocks; blackout resupply; hull, seams, leaks and flooding preserved.');
console.log('PASS departure: census, 4m 3D boundary, signed speed/vertical/yaw/pitch .1 gates, power, arm, exposure, replay, charging and modal controls.');
