import type {PodRun} from '../sim/run';
import {captureContainmentSave,containmentSlotTaken,readContainmentSave,writeContainmentSave,type ContainmentStorage} from '../sim/containment-save';

/** Opt-in only. URL resume is explicit and never inferred from slot presence. */
export function containmentSessionOptions(search:string,resume:boolean):{enabled:boolean;resume:boolean}{
  const params=new URLSearchParams(search);
  const enabled=params.get('campaign')==='containment';
  return {enabled,resume:enabled&&(resume||params.get('resume')==='1')};
}
export function readContainmentSession(search:string,resume:boolean,storage:ContainmentStorage){
  const options=containmentSessionOptions(search,resume);
  if(!options.resume)return null;
  const save=readContainmentSave(storage);
  if(!save)throw new Error('没有可恢复的收容调查记录；请移除 resume=1 后开始新调查。');
  return save;
}
export function freshContainmentSeed(seed:number,storage:ContainmentStorage):number{
  while(containmentSlotTaken(storage,seed))seed=(seed+1)>>>0;
  return seed;
}
export function saveContainmentSession(run:PodRun,storage:ContainmentStorage,required=false):boolean{
  const save=captureContainmentSave(run);
  if(!save){if(required)throw new Error('当前无法安全保存：请收回机械臂、等待影像处理结束，并解除警报后重试。');return false;}
  writeContainmentSave(storage,save);return true;
}
