import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const ts=require('typescript');
// 空场景参考帧若同时作首尾帧，模型只能让怪物入画再出画（“从镜头前游过”）；生成怪物镜头只传首帧
const source=readFileSync('src/pod/content/fixed-camera.ts','utf8')+'\n'+readFileSync('src/pod/net/video.ts','utf8').replace(/import \{lockVideoCamera\} from '[^']+';/,'').replaceAll('import.meta.env','({VITE_VIDEO_ENABLED:"1"})');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {buildBody}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const frame='data:image/jpeg;base64,AAAA';
const monster='ENVIRONMENT_ONLY_REFERENCE: The reference has no monster model.';
const story='Preserve the supplied first frame.';
for(const contract of [0,1,2]){
 const m=buildBody(monster,10,frame,contract),s=buildBody(story,10,frame,contract);
 const roles=b=>(b.content??[]).map(c=>c.role).filter(Boolean);
 if(contract===0){assert.deepEqual(roles(m),['first_frame']);assert.deepEqual(roles(s),['first_frame','last_frame']);}
 if(contract===1){assert.equal(m.first_frame_image,frame);assert.equal(m.last_frame_image,undefined);assert.equal(s.last_frame_image,frame);}
 if(contract===2){assert.equal(m.input_reference.image_url,frame);assert.equal(m.image_end,undefined);assert.equal(s.image_end,frame);}
}
// 出片亮度主要服从参考帧：生成怪物镜头的参考帧必须压暗，剧情镜头保持原样
const raw=readFileSync('src/pod/net/video.ts','utf8');
assert(raw.includes('toJpegFrame(keyframe, !usesEndFrame(prompt))'),'environment reference frame is not graded before upload');
const grade=/brightness\(([\d.]+)\)/.exec(raw);assert(grade&&Number(grade[1])<=0.6,'reference grade does not darken the frame');
assert(/'Dark, murky deep-sea ROV footage[^']*'\s*\n?\s*:/.test(raw)||raw.includes("? 'Dark, murky deep-sea ROV footage"),'environment-only prefix does not open with darkness');
console.log('PASS end frame: generated-monster shots send the empty reference as first frame only; other shots keep first = last for camera lock');
