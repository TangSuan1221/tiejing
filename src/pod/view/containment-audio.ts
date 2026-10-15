import type {AudioEngine} from '../../audio/engine';
import type {PodRun} from '../sim/run';

/** Presentation-only blind-transit sound dramaturgy. Does not publish contacts,
 * mutate noise/threat/resources or schedule timers that survive the transit.
 * The main view owns ambience priority; tick never switches its sound bed. */
export class ContainmentAudio {
  private seed=1;
  private dispatch='';
  private elapsed=0;
  private untilCue=0;
  private last=-1;
  private pressure:number|null=null;
  get pressureIntensity():number|null{return this.pressure;}
  private random():number {
    this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;
    return this.seed/4294967296;
  }
  tick(dt:number,run:PodRun,audio:AudioEngine):void {
    const mission=run.containment;
    if(!mission||mission.phase!=='transit'||run.phase!=='transit'||run.outcome.kind!=='alive'){
      this.dispatch='';this.pressure=null;return;
    }
    const key=`${run.seed}:${mission.index}`;
    if(this.dispatch!==key){
      this.dispatch=key;this.seed=(run.seed^Math.imul(mission.index+1,0x9e3779b9))>>>0;
      this.elapsed=0;this.last=-1;this.untilCue=5+this.random()*4;
    }
    // Pause while the app/input is suspended; never catch up with a sound burst.
    if(!Number.isFinite(dt)||dt<=0||run.driveInputBlocked){this.pressure=null;return;}
    const step=Math.min(dt,.1);this.elapsed+=step;
    const endangered=run.seams.length>0||run.flood>.1||run.mode!=='calm';
    this.pressure=endangered?null:.36+Math.min(.10,this.elapsed/600);
    this.untilCue-=step;
    if(this.untilCue>0)return;
    this.untilCue=15+this.random()*15;
    // Let communications and damage audio remain intelligible. Skipped cues
    // are dropped instead of queued for a later barrage.
    if(endangered||run.radioWaiting)return;
    const cues=['listener.call','hull.groan','listener.near','hull.scrape'] as const;
    let choice=Math.floor(this.random()*cues.length);
    if(choice===this.last)choice=(choice+1)%cues.length;
    this.last=choice;
    const pan=(this.random()<.5?-1:1)*(.38+this.random()*.48);
    const distant=choice===0;
    audio.cue(cues[choice],{
      gain:(distant?.34:choice===2?.20:.25)+this.random()*.07,
      pan,
      // Acoustic distance is an artistic filter setting, never a simulated
      // creature position or radar observation exposed to the player.
      space:{dist:distant?46:choice===2?16:3,room:18,flooded:true},
    });
  }
}
