import assert from 'node:assert/strict';
import {PodRun} from '../src/pod/sim/run';
import {ContainmentAudio} from '../src/pod/view/containment-audio';
import {CUES} from '../src/audio/cues';
import type {AudioEngine} from '../src/audio/engine';
const run=new PodRun(719);run.beginContainment();run.storyCaptionLeft=18;
const score=new ContainmentAudio(),calls:{name:string;at:number;pan:number}[]=[];
let time=0;
const audio={cue:(name:string,opts:{pan:number})=>{assert.ok(CUES[name]);calls.push({name,at:time,pan:opts.pan});},ambience:()=>{throw new Error('sound scheduler must not seize ambient bus');}} as unknown as AudioEngine;
const before=JSON.stringify({hull:run.hull,noise:run.noise,power:run.power,mission:run.containment?.snapshot()});
for(let i=0;i<2400;i++){time+=.1;score.tick(.1,run,audio);}
assert.ok(calls.length>=7&&calls.length<=16);
assert.ok(calls[0].at>=5&&calls[0].at<=9.2,'first cue is heard on a short blind leg even with text caption');
for(let i=1;i<calls.length;i++){assert.ok(calls[i].at-calls[i-1].at>=15);assert.ok(calls[i].at-calls[i-1].at<=30.2);assert.notEqual(calls[i].name,calls[i-1].name);}
assert.ok(calls.some(c=>c.pan<0)&&calls.some(c=>c.pan>0));
assert.equal(JSON.stringify({hull:run.hull,noise:run.noise,power:run.power,mission:run.containment?.snapshot()}),before);
const count=calls.length;run.driveInputBlocked=true;for(let i=0;i<600;i++)score.tick(.1,run,audio);assert.equal(calls.length,count);
run.driveInputBlocked=false;run.seams.push(0);score.tick(.1,run,audio);assert.equal(score.pressureIntensity,null);
run.containment!.advanceTransit(run.containment!.route.blindDistance);run.containment!.arrive();score.tick(.1,run,audio);assert.equal(score.pressureIntensity,null);
console.log('containment audio: 15–30s sparse spacing, alternating material cues/stereo, pause/site/damage priority and no gameplay mutation passed');
