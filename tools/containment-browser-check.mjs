import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const dir=process.argv[2]||'qa/containment/browser';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>r.abort());
await page.routeWebSocket('**',socket=>socket.close()); // Freeze HMR during a single reproducible sample.
try{
 await page.goto('http://127.0.0.1:5173/');await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__pod?.containment);
 await page.evaluate(()=>window.__pod.walkTo('camera'));await page.waitForTimeout(2500);
 assert.equal(await page.evaluate(()=>window.__pod.containment.phase),'transit');
 await page.keyboard.press('u');assert.equal(await page.evaluate(()=>window.__pod.containment.windowOpen),false);
 await page.screenshot({path:`${dir}/01-transit-closed.png`});
 // Only the approach position is accelerated. Arrival uses the live movement tick and 3D distance.
 await page.evaluate(()=>{const r=window.__pod;r.containmentPosition=[...r.containment.route.entry];r.holdPilot(0,0,0);});
 await page.waitForFunction(()=>window.__pod.containment.phase==='survey');
 assert.equal(await page.evaluate(()=>window.__pod.containment.windowOpen),false);
 await page.screenshot({path:`${dir}/02-arrived-closed.png`});
 await page.keyboard.press('u');assert.equal(await page.evaluate(()=>window.__pod.containment.windowOpen),true);
 await page.waitForTimeout(1500);await page.screenshot({path:`${dir}/03-arrived-open.png`});
 // Validate the actual lab action refuses old/no-stamp footage; no fabricated success evidence.
 const rejected=await page.evaluate(async()=>{const r=window.__pod,{labDeskAction}=await import('/src/pod/view/lab-desk.ts');
  const frame=r.captureSensorFrame();if(!frame)throw Error('No real sensor image');
  r.tapes.push({id:'review-old',legId:r.leg.id,siteName:r.leg.siteName,purpose:'identify',atBreath:r.breaths,fauna:[],caughtThreat:null,creatureMissing:false,analyzed:false,report:[],ready:true,sensorFrames:[frame,frame,frame]});r.tapeCursor=r.tapes.length-1;
  const before=r.containment.submitted.length,accepted=labDeskAction(r,'lab.send:vance');r.tapes.pop();r.tapeCursor=Math.max(0,r.tapes.length-1);
  return {accepted,before,after:r.containment.submitted.length};});
 assert.deepEqual(rejected,{accepted:false,before:0,after:0});
 await page.mouse.click(1400,300);await page.waitForTimeout(1600);assert.equal(await page.evaluate(()=>window.__podView.cabin.zoomedDevice),'lab');await page.screenshot({path:`${dir}/04-lab-mission.png`});
 await page.mouse.click(650,140);await page.waitForTimeout(600);
 await page.keyboard.press('u');assert.equal(await page.evaluate(()=>window.__pod.containment.windowOpen),false);
 // Third-sector diagnostic setup, followed by an actual fixed-lens exposure and local rendering.
 await page.evaluate(()=>{const r=window.__pod;r.authoredSite?.dispose();r.authoredSite=null;
  if(!r.containment.restore({version:1,index:2,phase:'transit',windowOpen:false,transitDistance:0,epoch:3,submitted:[],evidenceIds:[]}))throw Error('setup rejected');
  r.legIndex=2;r.phase='transit';r.containmentPosition=[...r.containment.route.entry];r.power=1;r.hull=1;r.pilot.stop();r.walkTo('camera');});
 await page.waitForFunction(()=>window.__pod.containment.phase==='survey');await page.keyboard.press('u');
 const shot=await page.evaluate(()=>{const r=window.__pod;r.authoredSite.position.set(-23,0,0);r.heading=0;r.pitch=0;r.camPan=r.camTilt=0;r.lamp=true;r.activeSonarEnabled=false;r.pilot.stop();r.beginShoot();
  for(let i=0;i<400;i++)r.frame(.05);const t=r.tapes.at(-1);return {phase:r.shot.phase,frames:t?.sensorFrames?.length??0,ids:t?.siteEvidence?.containment?.ids??[]};});
 assert(shot.frames>=3,'real rendered frames');assert(shot.ids.includes('sector.2.a'),'real in-frame animal');
 const sent=await page.evaluate(async()=>{const r=window.__pod,{labDeskAction}=await import('/src/pod/view/lab-desk.ts');r.walkTo('lab');r.tapeCursor=r.tapes.length-1;
  const accepted=labDeskAction(r,'lab.send:vance'),duplicate=labDeskAction(r,'lab.send:vance');return {accepted,duplicate,count:r.containment.submitted.length};});
 assert.deepEqual(sent,{accepted:true,duplicate:false,count:1});
 await page.evaluate(()=>window.__pod.walkTo('camera'));await page.waitForTimeout(1200);await page.screenshot({path:`${dir}/05-sector-photographed.png`});
 const negative=await page.evaluate(()=>{const r=window.__pod;const before=r.tapes.length;r.toggleContainmentWindow();r.beginShoot();const closed=r.shot.phase!=='exposing';r.toggleContainmentWindow();r.heading=180;r.beginShoot();for(let i=0;i<400;i++)r.frame(.05);return {closed,before,after:r.tapes.length};});assert(negative.closed);
 const wrong=await page.evaluate(async()=>{const r=window.__pod,{labDeskAction}=await import('/src/pod/view/lab-desk.ts');r.tapeCursor=r.tapes.length-1;return {accepted:labDeskAction(r,'lab.send:vance'),count:r.containment.submitted.length};});assert.deepEqual(wrong,{accepted:false,count:1});
 await page.evaluate(async()=>{const r=window.__pod,{captureContainmentSave,writeContainmentSave}=await import('/src/pod/sim/containment-save.ts');r.shot.viewing=false;r.pilot.stop();const s=captureContainmentSave(r);if(!s)throw Error('no safe save');writeContainmentSave(localStorage,s);});
 await page.reload();await page.locator('[data-id="continue"]').click();await page.waitForFunction(()=>!!window.__pod?.containment);
 assert.deepEqual(await page.evaluate(()=>({index:window.__pod.containment.index,submitted:[...window.__pod.containment.submitted]})),{index:2,submitted:['sector.2.a']});
 await page.mouse.click(1400,300);await page.waitForTimeout(1200);await page.screenshot({path:`${dir}/06-sector-restored.png`});
 assert.deepEqual(errors,[]);await writeFile(`${dir}/result.json`,JSON.stringify({passed:true,errors,rejected,shot,sent,negative,wrong,method:'Independent ephemeral Edge context; API routes blocked; real U input; diagnostic approach/sector setup and pose; real fixed-lens sensor recording, send and save/refresh/Continue; not full playthrough.'},null,2));
 console.log('PASS containment main-game transit/window/arrival/old-film rejection',dir);
}finally{await browser.close();}
