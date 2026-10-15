import assert from 'node:assert/strict';
import {PodRun} from '../src/pod/sim/run';
import {ContainmentMission} from '../src/pod/sim/containment-mission';
import {captureContainmentSave,isContainmentSave,restoreContainmentSave,readContainmentSave,writeContainmentSave,CONTAINMENT_SAVE_KEY} from '../src/pod/sim/containment-save';

const run=new PodRun(17371);
run.beginContainment();
const initial=captureContainmentSave(run);assert.ok(initial,'new blind transit saves');
assert.equal(initial.phase,'transit');assert.equal(initial.mission.windowOpen,false);
const memory=new Map<string,string>([['ironlung.harbor.v1','legacy-harbor'],['ironlung.living.v1','legacy-living']]);
const storage={getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>{memory.set(k,v);}};
writeContainmentSave(storage,initial);
assert.deepEqual(readContainmentSave(storage),initial);
assert.equal(memory.get('ironlung.harbor.v1'),'legacy-harbor');assert.equal(memory.get('ironlung.living.v1'),'legacy-living');
const resumed=new PodRun(run.seed);assert.ok(restoreContainmentSave(resumed,initial));
assert.deepEqual(resumed.containment?.snapshot(),run.containment?.snapshot());
assert.deepEqual(resumed.containmentPosition,run.containmentPosition);
const before=JSON.stringify({power:resumed.power,phase:resumed.phase,mission:resumed.containment?.snapshot()});
for(const corrupt of [
  {...initial,seed:-1},
  {...initial,mission:{...initial.mission,windowOpen:true}},
  {...initial,run:{...initial.run,power:Infinity}},
  {...initial,run:{...initial.run,containmentPosition:[0,NaN,1]}},
  {...initial,run:{...initial.run,seams:[0,0]}},
  {...initial,run:{...initial.run,tapes:[{id:'broken'}]}},
]){
  assert.equal(isContainmentSave(corrupt),false);
  assert.equal(restoreContainmentSave(resumed,corrupt as typeof initial),false);
  assert.equal(JSON.stringify({power:resumed.power,phase:resumed.phase,mission:resumed.containment?.snapshot()}),before);
}
run.shot.phase='exposing';assert.equal(captureContainmentSave(run),null);
run.shot.phase='developing';assert.equal(captureContainmentSave(run),null);
run.shot.phase='idle';
const mission=new ContainmentMission();mission.advanceTransit(mission.route.blindDistance);mission.arrive();
const survey={...initial,phase:'site' as const,mission:mission.snapshot(),site:{index:0,adapter:'test',adapterVersion:1,position:[0,0,0]}};
assert.ok(isContainmentSave(survey));
const frames=['data:image/png;base64,AAAA','data:image/png;base64,BBBB','data:image/png;base64,CCCC'];
mission.setWindow(true);
mission.submit({id:'evidence-1',...mission.captureStamp()!,creatureIds:['harbor.hunter'],frames,playable:true});
const evidenceSave={...survey,mission:mission.snapshot(),run:{...initial.run,tapes:[{id:'evidence-1',legId:'harbor',siteName:'Harbor',purpose:'identify',atBreath:1,fauna:[],report:[],analyzed:true,ready:true,sensorFrames:frames,siteEvidence:{containment:{seed:initial.seed,missionIndex:0,epoch:1,ids:['harbor.hunter']}}}]}};
assert.ok(isContainmentSave(evidenceSave));
for(const badStamp of [{seed:999},{missionIndex:1},{epoch:3},{ids:[]}]){
  const bad=structuredClone(evidenceSave);Object.assign(bad.run.tapes[0].siteEvidence.containment,badStamp);
  assert.equal(isContainmentSave(bad),false,'submitted evidence stamp must match and cover census');
}
const noMedia=structuredClone(evidenceSave);delete (noMedia.run.tapes[0] as {sensorFrames?:string[]}).sensorFrames;
assert.equal(isContainmentSave(noMedia),false,'acknowledgement needs actual media');
let disposed=0;
resumed.createAuthoredSite=(_index,target)=>{
  assert.notEqual(target,resumed,'adapter validation is isolated');
  return {index:0,restore:()=>false,dispose:()=>{disposed++;}} as unknown as NonNullable<PodRun['authoredSite']>;
};
assert.equal(restoreContainmentSave(resumed,survey),false);assert.equal(disposed,1);
assert.equal(JSON.stringify({power:resumed.power,phase:resumed.phase,mission:resumed.containment?.snapshot()}),before);
// Preflight can pass while the second (real) constructor/restore fails. Even
// non-persisted values and mutated collection identities must roll back.
for(const failInConstructor of [true,false]){
  const live:PodRun=new PodRun(initial.seed);live.beginContainment();live.power=.67;
  live.pilot.speed=.23;live.navDriveEngaged=true;live.shot.phase='ready';
  const oldSite={index:99,dispose:()=>{throw new Error('old scene must stay alive');}} as unknown as NonNullable<PodRun['authoredSite']>;
  live.authoredSite=oldSite;
  const stock=live.stock,tapes=live.tapes,position=live.containmentPosition,oldMission=live.containment;
  const snapshot=()=>JSON.stringify({power:live.power,stock:[...live.stock],tapes:live.tapes,position:live.containmentPosition,caption:live.storyCaption,pilot:live.pilot.speed,engaged:live.navDriveEngaged,shot:live.shot,mission:live.containment?.snapshot(),vitals:live.vitals.serialize(),flags:live.flags.serialize(),phase:live.phase,index:live.legIndex,seams:live.seams});
  const previous=snapshot();let builds=0;
  live.createAuthoredSite=(_index:number,target:PodRun=live)=>{
    builds++;
    if(builds===1)return {index:0,restore:()=>true,dispose:()=>{}} as unknown as NonNullable<PodRun['authoredSite']>;
    target.power=.02;target.stock.clear();target.tapes.length=0;target.containmentPosition[0]=900;target.seams.push(2);
    target.vitals.restore({oxygen:-100});target.flags.set('bad.restore',true);target.storyCaption='wrong';target.pilot.stop();target.navDriveEngaged=false;target.shot.phase='idle';
    if(failInConstructor)throw new Error('second constructor failed');
    return {index:0,restore:()=>false,dispose:()=>{target.power=.001;}} as unknown as NonNullable<PodRun['authoredSite']>;
  };
  assert.equal(restoreContainmentSave(live,survey),false);assert.equal(builds,2);
  assert.equal(snapshot(),previous);assert.equal(live.authoredSite,oldSite);
  assert.equal(live.stock,stock);assert.equal(live.tapes,tapes);assert.equal(live.containmentPosition,position);assert.equal(live.containment,oldMission);
}
const prior=memory.get(`${CONTAINMENT_SAVE_KEY}.${run.seed}`);
assert.throws(()=>writeContainmentSave({getItem:storage.getItem,setItem:(k,v)=>{if(k===CONTAINMENT_SAVE_KEY)throw new Error('quota');storage.setItem(k,v);}}, {...initial,savedAt:initial.savedAt+1}));
assert.equal(memory.get(`${CONTAINMENT_SAVE_KEY}.${run.seed}`),prior);
console.log('containment save: isolated namespace, transit roundtrip, malformed-state rejection, pending-photo veto, adapter preflight and quota rollback passed');
