import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const mode=process.argv[2]||'verify',dir='qa/containment/incremental';await mkdir(dir,{recursive:true});
const files=['src/main.ts','src/pod/view/lab-desk.ts','src/pod/view/sonar-desk.ts','src/pod/view/cabin-active-controls.ts','src/pod/view/cabin-three.ts','src/pod/view/cabin-crt-art.ts','src/pod/view/cabin-dressing.ts','src/pod/view/cabin-porthole-art.ts','src/pod/view/cabin-helm.ts','src/pod/view/cabin-navigation-keyboard.ts','src/pod/view/cabin-passive-controls.ts','src/pod/view/deepsea/reference-materials.ts','src/pod/view/deepsea/harbor-materials.ts','src/pod/view/deepsea/living-materials.ts','src/pod/view/deepsea/materials.ts','src/pod/view/footage.ts'];
const hashes={};for(const f of files)hashes[f]=createHash('sha256').update(await readFile(f)).digest('hex');
if(mode==='baseline')await writeFile(`${dir}/protected-baseline.json`,JSON.stringify({recordedAt:new Date().toISOString(),files:hashes},null,2));
else{const baseline=JSON.parse(await readFile(`${dir}/protected-baseline.json`,'utf8'));assert.deepEqual(hashes,baseline.files,'protected UI/material/footage bytes must remain unchanged');}
if(mode==='hashes'){console.log('PASS 16 protected UI/material/footage SHA256 files unchanged; no browser was launched');process.exit(0);}
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']});
const runs=[];
try{
 for(const variant of (mode==='baseline'?['default']:['default','containment'])){
  const ctx=await browser.newContext({viewport:{width:1600,height:900}}),page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>r.abort());await page.routeWebSocket('**',s=>s.close());
  await page.goto('http://127.0.0.1:5173/'+(variant==='containment'?'?campaign=containment':''));
  await page.screenshot({path:`${dir}/${mode}-${variant}-title.png`});
  await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__pod);
  await page.evaluate(()=>window.__pod.walkTo('camera'));await page.waitForTimeout(2000);
  const startup=await page.evaluate(async()=>{const r=window.__pod,{labDeskState}=await import('/src/pod/view/lab-desk.ts');return {containment:!!r.containment,phase:r.phase,level:r.legIndex,active:r.activeSonarEnabled,pulse:r.sonarPulseEnabled,labTab:labDeskState(r).tab};});
  assert.equal(startup.containment,variant==='containment');assert.equal(startup.labTab,'tapes');
  if(variant==='default')assert.deepEqual(startup,{containment:false,phase:'site',level:0,active:true,pulse:true,labTab:'tapes'});
  await page.screenshot({path:`${dir}/${mode}-${variant}-cockpit.png`});
  if(variant==='containment'){
   assert.equal(startup.phase,'transit');await page.keyboard.press('u');assert.equal(await page.evaluate(()=>window.__pod.containment.windowOpen),false);
   await page.evaluate(()=>{const r=window.__pod;r.containmentPosition=[...r.containment.route.entry];r.holdPilot(0,0,0);});
   await page.waitForFunction(()=>window.__pod.containment.phase==='survey');
   assert.equal(await page.evaluate(()=>window.__pod.containment.windowOpen),false);
   await page.keyboard.press('u');assert.equal(await page.evaluate(()=>window.__pod.containment.windowOpen),true);
   await page.waitForTimeout(1200);await page.screenshot({path:`${dir}/${mode}-${variant}-arrived.png`});
  }
  const surfaces=await page.evaluate(()=>window.__podView.cabin.screens.map(s=>({id:s.id,geometry:{width:s.mesh.geometry.parameters.width,height:s.mesh.geometry.parameters.height},hits:s.hits.hits.map(h=>({...h})).sort((a,b)=>a.id.localeCompare(b.id))})));
  await page.mouse.click(1400,300);await page.waitForTimeout(1200);assert.equal(await page.evaluate(()=>window.__podView.cabin.zoomedDevice),'lab');
  await page.screenshot({path:`${dir}/${mode}-${variant}-lab.png`});
  const localKeys=await page.evaluate(()=>Object.keys(localStorage));
  if(variant==='containment')assert(!localKeys.some(k=>k.startsWith('ironlung.harbor')||k.startsWith('ironlung.living')),'new mode must not write legacy saves');
  assert.deepEqual(errors,[]);runs.push({variant,startup,surfaces,localKeys,errors});await ctx.close();
 }
 if(mode==='verify'){
  // Arrival shares the original adapters, so button IDs and hit rectangles must match.
  assert.deepEqual(runs[1].surfaces,runs[0].surfaces,'new mode must preserve existing physical UI geometry and hit maps');
 }
 await writeFile(`${dir}/${mode}-result.json`,JSON.stringify({passed:true,hashes,runs,method:'Read-only protected-file hashes; independent fresh Edge contexts; API/HMR blocked; original default startup and opt-in arrival; existing lab real pointer zoom; no generated-footage substitution or successful-evidence fabrication.'},null,2));
 console.log('PASS incremental',mode);
}finally{await browser.close();}
