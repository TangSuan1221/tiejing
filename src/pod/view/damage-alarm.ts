/**
 * 只做缓慢的应急呼吸；不快速频闪，也不做爆闪。
 * Hull is remaining integrity, 0..1.
 */
export function damageAlarm(hull:number,time:number){
 const level=hull<=.25?2:hull<=.5?1:0;
 const hz=level===2?.46:.32;
 // Incommensurate low-frequency drift models voltage wander. Phase and depth
 // both move, so watching for 20 seconds does not reveal a perfect LFO loop.
 const wander=(Math.sin(time*.31)+.62*Math.sin(time*.173+1.37)+.31*Math.sin(time*.071+4.1))/1.93;
 const phase=time*Math.PI*2*hz+.42*Math.sin(time*.19+level)+.18*Math.sin(time*.083+2.4);
 const depth=.86+wander*.14;
 const pulse=.5-.5*Math.cos(phase);
 const eased=pulse*pulse*(3-2*pulse);
 return {
  level,
  pulse:eased*depth,
  wander,
  intensity:level===0?0:(level===2?2.5:1.45)+eased*depth*(level===2?3.7:2.25),
  reflection:level===0?0:(level===2?.34:.22)+eased*depth*(level===2?.66:.48),
 };
}
