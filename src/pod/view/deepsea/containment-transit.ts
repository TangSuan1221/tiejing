import type {AuthoredSite} from '../../sim/authored-site';
import type {PodRun} from '../../sim/run';
import {LivingNavigation,type LivingNavigationHost} from './living-navigation';

/** Only supplies the existing instruments with inertia/navigation data while
 * the shutter is closed. Does not invent a seabed, contact or scan clearance. */
class TransitNavigation extends LivingNavigation {
  constructor(host:LivingNavigationHost,private readonly transitRun:PodRun){super(host);}
  override get receivedCoordinates(){return this.transitRun.containmentBrief;}
}

export class ContainmentTransit implements AuthoredSite {
  readonly diegeticGuidance=true;
  readonly managesThreats=true;
  readonly managesNarrative=true;
  readonly complete=false;
  readonly navigationConsole:LivingNavigation;
  private readonly dispatchIndex:number;
  constructor(private readonly run:PodRun){
    const mission=run.containment;
    if(!mission||mission.phase!=='transit')throw new Error('Blind-transit adapter requires an active transit dispatch.');
    this.dispatchIndex=mission.index;
    const adapter=this;
    this.navigationConsole=new TransitNavigation({
      run,
      get position(){return adapter.position;},
      get datum(){return adapter.coordinateDatum;},
      contacts:()=>[],
      drawActive:(ctx,w,h)=>adapter.drawEmptyInstrument(ctx,w,h),
      waypointCatalog:[{position:mission.route.entry,name:mission.route.name,detail:'万斯提供的到站坐标 · 惯导航点，不是声纳回波。'}],
    },run);
    // Record the instruction, but do not automatically write the coordinate:
    // players continue to use the unchanged physical coordinate input.
    this.navigationConsole.recordDialogue(run.containmentBrief);
  }
  get index(){return this.dispatchIndex;}
  get description(){return this.run.containmentBrief;}
  get hint(){return this.run.containmentBrief;}
  get coordinateDatum(){return this.run.containment!.route.datum;}
  get position(){const [x,y,z]=this.run.containmentPosition;return {x,y,z};}
  get elevation(){return this.run.containmentPosition[1];}
  /** All translation is owned by PodRun.tickPilot; no second movement path. */
  move(_distance:number){return false;}
  interact():void{}
  tick(dt:number):void{this.navigationConsole.tick(dt);}
  draw(ctx:CanvasRenderingContext2D,w:number,h:number):void{ctx.save();ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);ctx.restore();}
  drawMap(ctx:CanvasRenderingContext2D,w:number,h:number):void{this.navigationConsole.draw(ctx,w,h);}
  drawDrivingSonar(ctx:CanvasRenderingContext2D,w:number,h:number):void{this.navigationConsole.drawActive(ctx,w,h,false);}
  private drawEmptyInstrument(ctx:CanvasRenderingContext2D,w:number,h:number):void{
    // Same geometric register as LivingNavigation's original waypoint layer.
    // These are scale rings only; there is no rotating false return or floor.
    const size=Math.min(w,h/.93),cx=size/2,cy=size*.48,radius=size*.30;
    ctx.save();ctx.fillStyle='rgba(3,10,14,.91)';ctx.fillRect(0,0,w,h);
    ctx.strokeStyle='#294047';ctx.lineWidth=1;
    for(const fraction of [1/3,2/3,1]){ctx.beginPath();ctx.arc(cx,cy,radius*fraction,0,Math.PI*2);ctx.stroke();}
    ctx.beginPath();ctx.moveTo(cx-radius,cy);ctx.lineTo(cx+radius,cy);ctx.moveTo(cx,cy-radius);ctx.lineTo(cx,cy+radius);ctx.stroke();
    ctx.restore();
  }
  /** Transit save stores the real position/mission, not a fictitious level. */
  snapshot():null{return null;}
  dispose():void{}
}

export function createContainmentTransit(run:PodRun):AuthoredSite{return new ContainmentTransit(run);}
