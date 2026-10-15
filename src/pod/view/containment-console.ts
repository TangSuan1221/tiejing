import type {PodRun} from '../sim/run';
import type {HitMap} from './chrome';
import {formatCoords} from '../sim/site-coords';

/** Physical terminal surface; no world overlay or hidden creature positions. */
export function drawContainmentNavigation(c:CanvasRenderingContext2D,run:PodRun,w:number,h:number,hits?:HitMap,buttons=true):void {
 const m=run.containment;if(!m)return;
 c.save();c.scale(w/1024,h/720);c.fillStyle='#111d12';c.fillRect(0,0,1024,720);
 c.textBaseline='middle';c.textAlign='left';c.font='25px monospace';c.fillStyle='#95aa7a';
 c.fillText('VANCE / 收容事故调查',30,40);c.fillRect(30,72,964,1);
 c.fillStyle='#d0dda9';c.font='32px monospace';c.fillText(`${m.index+1} / 4   ${m.route.name}`,30,116);
 const p=run.phase==='transit'?run.containmentPosition:run.authoredSite?.position;
 const world=Array.isArray(p)?p:p?[p.x,p.y,p.z]:[0,0,0];
 c.font='25px monospace';c.fillStyle='#a4b48d';c.fillText('当前位置  '+formatCoords(world,m.route.datum),30,170);
 const target=m.phase==='extraction'?m.route.exit:m.route.entry;
 const dx=target[0]-world[0],dz=target[2]-world[2],bearing=(Math.atan2(dx,-dz)*180/Math.PI+360)%360;
 c.fillText(`艇首 ${run.heading.toFixed(0)}°   目标方位 ${bearing.toFixed(0)}°`,30,219);
 c.fillStyle='#cad9a4';c.fillText((m.phase==='extraction'?'撤离':'派遣')+'坐标  '+formatCoords(target,m.route.datum),30,272);
 c.font='34px monospace';c.fillText(m.phase==='complete'?'四区资料归档完成':m.phase==='transit'?'盲航 / 外部视野锁闭':`收容报告 ${m.submitted.length} / ${m.required.length}`,30,341);
 c.font='24px monospace';c.fillStyle='#94a781';
 const lines=m.phase==='transit'?['空格 / N 推进与倒车 · J / L 转舵 · Shift 制动','PageUp / PageDown 升降 · U 舷窗（到站解锁）','目标坐标为惯性导航数据，不是生物距离。']:
 ['U 开关舷窗 · 遇到生物停艇、关闭主动声纳','拍摄并显影后：右侧分析台 → 发送给万斯','完整报告回执后，返回撤离坐标，停艇按 B'];
 lines.forEach((s,i)=>c.fillText(s,30,412+i*44));
 if(!buttons){c.restore();return;}
 c.fillStyle='#203221';c.fillRect(30,584,450,78);c.fillStyle='#d0dda9';c.fillText(m.windowOpen?'U 关闭舷窗':'U 打开舷窗',50,623);
 hits?.add({id:'containment.window',x:30*w/1024,y:584*h/720,w:450*w/1024,h:78*h/720});
 c.fillStyle='#203221';c.fillRect(500,584,494,78);c.fillStyle='#d0dda9';c.fillText('B 撤离 / 返回泊位',520,623);
 hits?.add({id:'containment.depart',x:500*w/1024,y:584*h/720,w:494*w/1024,h:78*h/720});
 c.restore();
}

export function drawContainmentShutter(c:CanvasRenderingContext2D,w:number,h:number):void {
 const g=c.createLinearGradient(0,0,w,h);g.addColorStop(0,'#1b211e');g.addColorStop(.45,'#0c100f');g.addColorStop(1,'#222520');
 c.fillStyle=g;c.fillRect(0,0,w,h);
 c.strokeStyle='#050807';c.lineWidth=4;for(let y=h*.12;y<h;y+=h*.19){c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke();}
 c.fillStyle='#080b09';c.fillRect(w*.49,0,w*.018,h);c.strokeStyle='#3b4137';c.lineWidth=1;c.strokeRect(w*.49,0,w*.018,h);
 c.fillStyle='#78806a';c.font=`${w*.025}px monospace`;c.textAlign='center';c.fillText('PRESSURE SHUTTER / 遮板锁闭',w/2,h*.48);c.textAlign='left';
}
