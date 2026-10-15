import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

// These files were clean before the containment work. Keep their original
// interfaces and art byte-equivalent (ignoring line endings).
const protectedFiles=['src/main.ts','src/pod/view/lab-desk.ts','src/pod/view/sonar-desk.ts','src/pod/view/cabin-active-controls.ts','src/pod/view/cabin-crt-art.ts','src/pod/view/cabin-dressing.ts','src/pod/view/cabin-porthole-art.ts'];
for(const file of protectedFiles){
 const original=execFileSync('git',['show',`HEAD:${file}`],{encoding:'utf8'});
 assert.equal((await readFile(file,'utf8')).replace(/\r\n/g,'\n'),original.replace(/\r\n/g,'\n'),file);
}
const dir='qa/original-design-restored';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',r=>r.abort());await page.routeWebSocket('**',s=>s.close());
 await page.goto('http://127.0.0.1:5173/');
 await page.locator('[data-id="new"]').click();
 await page.waitForFunction(()=>!!window.__pod);
 const state=await page.evaluate(async()=>{
  const r=window.__pod,{labDeskState}=await import('/src/pod/view/lab-desk.ts');
  r.walkTo('camera');
  return {containment:r.containment,level:r.legIndex,active:r.activeSonarEnabled,pulse:r.sonarPulseEnabled,labTab:labDeskState(r).tab};
 });
 assert.deepEqual(state,{containment:null,level:0,active:true,pulse:true,labTab:'tapes'});
 await page.waitForTimeout(2000);await page.screenshot({path:`${dir}/cockpit.png`});
 await page.mouse.click(1400,300);await page.waitForTimeout(1200);
 await page.screenshot({path:`${dir}/lab.png`});
 assert.deepEqual(errors,[]);
 await writeFile(`${dir}/result.json`,JSON.stringify({passed:true,protectedFiles,state,errors},null,2));
 console.log('PASS original UI/art equality, original startup, sonar defaults, lab default, browser errors');
}finally{await browser.close();}
