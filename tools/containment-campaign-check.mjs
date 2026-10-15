import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const dir=process.argv[2]||'qa/containment/campaign';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[],levels=[];
page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>r.abort());await page.routeWebSocket('**',s=>s.close());
try{
 await page.goto('http://127.0.0.1:5173/');await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__pod?.containment);
 for(let index=0;index<4;index++){
  console.log('START level',index);
  await page.evaluate(()=>{const r=window.__pod;r.walkTo('camera');r.containmentPosition=[...r.containment.route.entry];r.holdPilot(0,0,0);});
  await page.waitForFunction(()=>window.__pod.containment.phase==='survey');
  assert.equal(await page.evaluate(()=>window.__pod.containment.windowOpen),false);await page.keyboard.press('u');
  assert.equal(await page.evaluate(()=>window.__pod.containment.windowOpen),true);
  const oldRejected=await page.evaluate(async()=>{const r=window.__pod;if(!r.tapes.length)return true;const {labDeskAction}=await import('/src/pod/view/lab-desk.ts');r.tapeCursor=0;return !labDeskAction(r,'lab.send:vance');});assert(oldRejected);
  const ids=await page.evaluate(()=>[...window.__pod.containment.required]),shots=[];
  for(const id of ids){
   if(await page.evaluate(id=>window.__pod.containment.submitted.includes(id),id))continue;
   const pose=await page.evaluate(async id=>{
    const r=window.__pod,s=r.authoredSite,Vector3=s.position.constructor,{harborHullClear}=await import('/src/pod/sim/harbor-navigation.ts');
    // Diagnostic replenishment isolates mission/camera integration, NOT survival/resource balance.
    r.power=1;r.hull=1;r.flood=0;r.lamp=true;r.activeSonarEnabled=false;r.stopSonarPulses();r.pilot.stop();r.shot.viewing=false;r.walkTo('camera');
    const c=s.pursuit?{position:s.pursuit.position.toArray()}:s.creatures?s.creatures.views.find(c=>c.id===id):s.animals.find(c=>c.id===id);
    if(!c)throw Error('missing physical subject '+id);const target=Array.isArray(c.position)?new Vector3(...c.position):c.position.clone();
    for(const radius of [8,10,6,12,16,20])for(const dy of [0,1,-1,3,-3])for(let a=0;a<16;a++){
      const t=a*Math.PI/8,p=target.clone().add(new Vector3(Math.sin(t)*radius,dy,Math.cos(t)*radius));
      const d=target.clone().sub(p),heading=(Math.atan2(d.x,-d.z)*180/Math.PI+360)%360;
      const legal=s.pursuit?harborHullClear(p,heading,s.world.walkable,s.solids()):s.clear(p,heading);
      if(!legal)continue;s.position.copy(p);r.heading=heading;r.pitch=-Math.atan2(d.y,Math.hypot(d.x,d.z))*180/Math.PI;r.camPan=r.camTilt=0;r.camZoom=1;
      const seen=s.containmentSubjects?s.containmentSubjects():s.captureEvidence().containment.ids;
      if(seen.includes(id))return {id,position:p.toArray(),heading,seen};
    }
    throw Error('no legal visible diagnostic pose for '+id+' at '+target.toArray());
   },id);
   const shot=await page.evaluate(async id=>{const r=window.__pod,{labDeskAction}=await import('/src/pod/view/lab-desk.ts');
    const before=r.tapes.length;r.beginShoot();for(let i=0;i<410;i++)r.frame(.05);const tape=r.tapes.at(-1);
    if(r.tapes.length!==before+1)throw Error('exposure produced no reel '+id+' / '+r.shot.phase);
    if(!tape?.siteEvidence?.containment?.ids.includes(id))throw Error('shutter did not freeze expected subject '+id);
    r.tapeCursor=r.tapes.length-1;const accepted=labDeskAction(r,'lab.send:vance');
    return {id,frames:tape.sensorFrames?.length??0,ready:tape.ready,accepted,captured:tape.siteEvidence.containment.ids,submitted:[...r.containment.submitted],remaining:r.containment.required.length-r.containment.submitted.length};
   },id);
   assert(shot.frames>=3);assert.equal(shot.ready,true);assert(shot.accepted);shots.push({...pose,...shot});console.log('SHOT',index,id,shot.frames,shot.remaining);
   const film=await page.evaluate(()=>window.__pod.tapes.at(-1).sensorFrames[0]);
   await writeFile(`${dir}/creature-${index+1}-${id}.png`,Buffer.from(film.split(',')[1],'base64'));
   if(shot.remaining>0){const can=await page.evaluate(()=>{const r=window.__pod;r.authoredSite.position.set(...r.containment.route.exit);r.pilot.stop();return r.canDepart;});assert.equal(can,false);}
  }
  await page.screenshot({path:`${dir}/level-${index+1}-reports.png`});
  const departed=await page.evaluate(async()=>{const r=window.__pod;r.authoredSite.position.set(...r.containment.route.exit);r.pilot.stop();r.shot.viewing=false;r.walkTo('camera');
   // Existing lumen release mechanic: darkness, not silence alone, releases attached individuals.
   r.lamp=false;
   // Normal silent time at the actual exit permits creatures to stop hunting; never force their modes.
   for(let i=0;i<1200&&r.authoredSite.saveSafe===false;i++)r.frame(.05);
   const can=r.canDepart;let saveDiagnostic;try{const {captureContainmentSave}=await import('/src/pod/sim/containment-save.ts');const s=captureContainmentSave(r);saveDiagnostic=s?{ok:true,bytes:JSON.stringify(s).length}:{ok:false,mode:r.mode,fx:r.fx,saveSafe:r.authoredSite.saveSafe,pendingCaptureId:r.authoredSite.pendingCaptureId,shot:r.shot.phase,creatures:r.authoredSite.creatures?.views.map(c=>({id:c.id,mode:c.mode}))};}catch(e){saveDiagnostic={error:String(e)};}r.depart();return {can,index:r.containment.index,phase:r.containment.phase,window:r.containment.windowOpen,saveDiagnostic,logs:r.log?.slice(-3)};});
  levels.push({index,shots,departed});await writeFile(`${dir}/progress.json`,JSON.stringify({levels,errors},null,2));
  assert(departed.can);assert.equal(departed.phase,index===3?'complete':'transit');assert.equal(departed.window,false);
 }
 await page.evaluate(()=>{const r=window.__pod;for(let i=0;i<20;i++)r.frame(.05);});
 assert.equal(await page.evaluate(()=>window.__pod.authoredSite),null);
 await page.evaluate(async()=>{const r=window.__pod,{captureContainmentSave,writeContainmentSave}=await import('/src/pod/sim/containment-save.ts');const s=captureContainmentSave(r);if(!s)throw Error('complete snapshot unavailable');writeContainmentSave(localStorage,s);});
 await page.reload();await page.locator('[data-id="continue"]').click();await page.waitForFunction(()=>!!window.__pod?.containment);
 assert.equal(await page.evaluate(()=>window.__pod.containment.phase),'complete');assert.equal(await page.evaluate(()=>window.__pod.authoredSite),null);
 await page.evaluate(()=>window.__pod.walkTo('camera'));await page.waitForTimeout(2000);
 await page.screenshot({path:`${dir}/complete-restored.png`});assert.deepEqual(errors,[]);
 await writeFile(`${dir}/result.json`,JSON.stringify({passed:true,levels,errors,method:'Ephemeral Edge, API/HMR blocked. Diagnostic legal hull/LOS poses and full resource replenishment for every exposure. Real fixed-lens 10-frame local clips, lab action submissions, 4 departure callbacks and completion save/refresh/Continue. Not human playthrough or resource-balance certification.'},null,2));
 console.log('PASS four-level containment camera/submission/departure/save loop');
}catch(error){await writeFile(`${dir}/failure.json`,JSON.stringify({error:String(error),levels,errors},null,2));throw error;}finally{await browser.close();}
