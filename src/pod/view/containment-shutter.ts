/** Optical shutter only: no controls, labels, instrument layout or hit regions. */
export function drawContainmentShutter(ctx:CanvasRenderingContext2D,w:number,h:number):void {
 ctx.save();
 const shade=ctx.createLinearGradient(0,0,w,h);
 shade.addColorStop(0,'#151b1a');shade.addColorStop(.5,'#080d0d');shade.addColorStop(1,'#1b211f');
 ctx.fillStyle=shade;ctx.fillRect(0,0,w,h);
 ctx.strokeStyle='#030706';ctx.lineWidth=3;
 for(let y=h*.15;y<h;y+=h*.2){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
 ctx.fillStyle='#020505';ctx.fillRect(w*.495,0,w*.01,h);
 ctx.restore();
}
