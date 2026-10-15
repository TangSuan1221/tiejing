import assert from 'node:assert/strict';
import {PodRun,type TapeRecord} from '../src/pod/sim/run';
import {ContainmentMission} from '../src/pod/sim/containment-mission';
import type {AuthoredSite} from '../src/pod/sim/authored-site';
import {wrapContainmentSite} from '../src/pod/view/deepsea/containment-adapter';

const run=new PodRun(1489);let calls=0,blocked=false,visible=true,generated=true,oldReceive=0;
const base={index:0,position:{x:11,y:0,z:10},marker:17,
 captureEvidence(this:{marker:number}){assert.equal(this.marker,17);calls++;return {id:'old-evidence',lensBlocked:blocked,creatureVisible:visible};},
 videoContext(){return {generatedMonsters:generated,story:false,settled:false,stateKey:'x',nearestMonster:10,scene:'test',actors:[],monsters:visible?['One individual [harbor.hunter]']:[],outcome:'test'};},
 snapshot(this:{marker:number}){assert.equal(this.marker,17);return {adapter:'old',marker:this.marker};},
 restore(this:{marker:number},v:unknown){assert.equal(this.marker,17);return (v as {marker?:number})?.marker===17;},
 receiveTape(){oldReceive++;return true;},
} as unknown as AuthoredSite;
assert.equal(wrapContainmentSite(run,base),base,'default mode untouched');
const fresh=()=>{const m=new ContainmentMission();m.advanceTransit(m.route.blindDistance);m.arrive();m.setWindow(true);run.containment=m;run.power=1;run.blackout=false;run.lamp=true;run.flareLeft=0;run.fx.flash=0;run.tapes.length=0;calls=0;blocked=false;visible=true;generated=true;run.authoredSite=wrapContainmentSite(run,base);return run.authoredSite;};
const tape=(site:AuthoredSite,videoResult:TapeRecord['videoResult']='video')=>{const siteEvidence=site.captureEvidence!();assert.equal(calls,1);assert.deepEqual(site.containmentSubjects!(),(siteEvidence as {containment:{ids:string[]}}).containment.ids);const t={id:'tape-1',siteEvidence,ready:true,videoResult,creatureMissing:false,sensorFrames:['data:image/png;base64,AAAA','data:image/png;base64,BBBB','data:image/png;base64,CCCC']} as TapeRecord;run.tapes.push(t);return t;};
let site=fresh();assert.deepEqual(site.snapshot(),{adapter:'old',marker:17});assert.ok(site.restore!({marker:17}));tape(site);visible=false;assert.ok(site.receiveTape!('vance','tape-1'),'receipt must use frozen visibility');assert.equal(calls,1);assert.equal(site.receiveTape!('vance','tape-1'),false,'duplicate');assert.equal(run.containment!.phase,'extraction');
site=fresh();tape(site,'failed');assert.equal(site.receiveTape!('vance','tape-1'),false,'environment frames cannot replace generated monster');
site=fresh();generated=false;tape(site,'failed');assert.ok(site.receiveTape!('vance','tape-1'),'original close-shot local recording preserved');
site=fresh();blocked=true;tape(site);assert.equal(site.receiveTape!('vance','tape-1'),false,'lens attached/blocked cannot reveal farther individuals');
site=fresh();visible=false;tape(site);visible=true;assert.equal(site.receiveTape!('vance','tape-1'),false,'receipt cannot add newly visible creature');
site=fresh();run.lamp=false;tape(site);assert.equal(site.receiveTape!('vance','tape-1'),false,'dark capture');
for(const mutate of [(t:TapeRecord)=>{t.ready=false;},(t:TapeRecord)=>{t.creatureMissing=true;},(t:TapeRecord)=>{(t.siteEvidence as any).containment.seed++;},(t:TapeRecord)=>{(t.siteEvidence as any).containment.epoch++;},(t:TapeRecord)=>{delete (t.siteEvidence as any).containmentMedia;}]){
 site=fresh();mutate(tape(site));assert.equal(site.receiveTape!('vance','tape-1'),false);assert.equal(run.containment!.submitted.length,0);
}
site=fresh();assert.ok(site.receiveTape!('elias','anything'));assert.equal(oldReceive,1,'non-Vance old receiver retained');
console.log('PASS opt-in adapter: bound original methods/snapshot/restore, frozen optical IDs, no double capture, light/lens gates, generated-vs-local media provenance, seed/epoch/readiness/duplicate rejection, old recipient delegation.');
