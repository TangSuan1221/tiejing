import { clamp01 } from '@/core/util';

function hash(index: number, salt: number): number {
  const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

export function cabinLensWet(flood: number, seams: number): number {
  return clamp01(flood * 0.7 + Math.min(seams, 6) * 0.085);
}

/** Final-visor condensation only. Sensor canvases never consume this value. */
export function cabinLensFog(wet: number, breathPhase: number): number {
  const exhale = Math.max(0, breathPhase);
  return clamp01(wet * 0.38 + exhale * (0.085 + wet * 0.09));
}

function sharpDropAllowed(x: number, y: number, width: number, height: number): boolean {
  const nx = (x - width * 0.5) / (width * 0.31);
  const ny = (y - height * 0.43) / (height * 0.27);
  return nx * nx + ny * ny > 1;
}

function edgePosition(index: number, width: number, height: number): [number, number] {
  const lane = hash(index, 17);
  if (lane < 0.5) return [width * (0.04 + hash(index, 18) * 0.92), height * (0.67 + hash(index, 19) * 0.27)];
  if (lane < 0.7) return [width * (0.025 + hash(index, 18) * 0.13), height * (0.08 + hash(index, 19) * 0.76)];
  if (lane < 0.9) return [width * (0.845 + hash(index, 18) * 0.13), height * (0.08 + hash(index, 19) * 0.76)];
  return [width * (0.08 + hash(index, 18) * 0.84), height * (0.035 + hash(index, 19) * 0.12)];
}

function blobPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  seed: number,
  merged: number,
): void {
  const points: [number, number][] = [];
  const segments = 10;
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const lowerWeight = Math.max(0, Math.sin(a));
    const wobble = 0.82 + hash(seed * 13 + i, 21) * 0.28 + lowerWeight * merged * 0.23;
    const lobe = merged > 0 && i >= 1 && i <= 4 ? 1 + Math.sin((i - 1) / 3 * Math.PI) * merged * 0.28 : 1;
    points.push([cx + Math.cos(a) * rx * wobble * lobe, cy + Math.sin(a) * ry * wobble]);
  }
  ctx.beginPath();
  ctx.moveTo((points[9]![0] + points[0]![0]) * 0.5, (points[9]![1] + points[0]![1]) * 0.5);
  for (let i = 0; i < segments; i++) {
    const point = points[i]!;
    const next = points[(i + 1) % segments]!;
    ctx.quadraticCurveTo(point[0], point[1], (point[0] + next[0]) * 0.5, (point[1] + next[1]) * 0.5);
  }
  ctx.closePath();
}

function drawResidualBead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  alpha: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.22);
  ctx.scale(1.45, 0.72);
  ctx.fillStyle = `rgba(151,190,183,${alpha})`;
  ctx.beginPath();
  ctx.ellipse(0, 0, radius, radius * 0.72, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Water caught on the operator's visor. This samples the already-rendered cabin scene
 * only for tiny inverted reflections, then draws on the final HUD; film stays untouched.
 */
export function drawCabinLensWater(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  wet: number,
  source: CanvasImageSource,
): void {
  const strength = clamp01(wet);
  if (strength <= 0.02) return;

  ctx.save();

  // Large defocused wet blooms: broad, dim and edge-biased, unlike sharp sticker dots.
  const bloomCount = 2 + Math.floor(strength * 5);
  for (let i = 0; i < bloomCount; i++) {
    const [x, y] = edgePosition(i + 70, width, height);
    const radius = height * (0.045 + hash(i, 23) * 0.085);
    const bloom = ctx.createRadialGradient(x - radius * 0.15, y - radius * 0.12, radius * 0.05, x, y, radius);
    bloom.addColorStop(0, `rgba(173,199,191,${0.018 + strength * 0.026})`);
    bloom.addColorStop(0.46, `rgba(52,91,88,${0.016 + strength * 0.022})`);
    bloom.addColorStop(1, 'rgba(16,43,44,0)');
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((hash(i, 24) - 0.5) * 0.75);
    ctx.scale(1.35 + hash(i, 25) * 0.6, 0.65 + hash(i, 26) * 0.35);
    ctx.translate(-x, -y);
    ctx.fillStyle = bloom;
    ctx.fillRect(x - radius * 2, y - radius * 2, radius * 4, radius * 4);
    ctx.restore();
  }

  // Dense micro-condensation arrives in edge clusters, with a clear central optical ellipse.
  const clusterCount = 4 + Math.floor(strength * 7);
  for (let cluster = 0; cluster < clusterCount; cluster++) {
    const [cx, cy] = edgePosition(cluster + 120, width, height);
    const beads = 5 + Math.floor(hash(cluster, 27) * 8);
    for (let bead = 0; bead < beads; bead++) {
      const a = hash(cluster * 19 + bead, 28) * Math.PI * 2;
      const spread = height * (0.008 + hash(cluster * 19 + bead, 29) * 0.035);
      const x = cx + Math.cos(a) * spread;
      const y = cy + Math.sin(a) * spread * 0.72;
      if (!sharpDropAllowed(x, y, width, height)) continue;
      const radius = Math.max(0.7, height * (0.0008 + hash(cluster * 23 + bead, 30) * 0.0021));
      drawResidualBead(ctx, x, y, radius, (0.055 + hash(bead, 31) * 0.1) * strength);
    }
  }

  // A few merged drops: pin, swell/merge, then release and leave dirty strings of beads.
  const dropCount = 3 + Math.floor(strength * 8);
  for (let i = 0; i < dropCount; i++) {
    const [baseX, baseY] = edgePosition(i + 210, width, height);
    if (!sharpDropAllowed(baseX, baseY, width, height)) continue;
    const cycle = (time * (0.025 + hash(i, 32) * 0.025) + hash(i, 33)) % 1;
    const merging = cycle >= 0.56 && cycle < 0.74 ? (cycle - 0.56) / 0.18 : 0;
    const release = cycle >= 0.74 ? (cycle - 0.74) / 0.26 : 0;
    const pinnedGrowth = cycle < 0.56 ? 0.82 + cycle * 0.32 : 1;
    const radius = height * (0.008 + hash(i, 34) * 0.019) * (0.72 + strength * 0.48);
    const rx = radius * (1.12 + hash(i, 35) * 0.62) * pinnedGrowth;
    const ry = radius * (0.72 + hash(i, 36) * 0.38) * (1 + release * 1.25);
    const x = baseX + Math.sin(release * Math.PI) * radius * (hash(i, 37) - 0.5);
    const y = Math.min(height * 0.93, baseY + release * release * height * (0.12 + hash(i, 38) * 0.22));
    const alpha = (0.34 + strength * 0.28) * (1 - release * 0.18);

    if (release > 0.05) {
      const trailTop = baseY - radius * 0.7;
      const trail = ctx.createLinearGradient(x, trailTop, x, y);
      trail.addColorStop(0, 'rgba(85,132,127,0)');
      trail.addColorStop(0.55, `rgba(73,123,119,${alpha * 0.16})`);
      trail.addColorStop(1, `rgba(180,210,201,${alpha * 0.32})`);
      ctx.strokeStyle = trail;
      ctx.lineWidth = Math.max(1, rx * 0.16);
      ctx.beginPath();
      ctx.moveTo(baseX, trailTop);
      ctx.bezierCurveTo(baseX - rx * 0.35, (trailTop + y) * 0.48, x + rx * 0.3, y - ry * 1.2, x, y);
      ctx.stroke();
      const residueCount = 2 + Math.floor(release * 5);
      for (let bead = 0; bead < residueCount; bead++) {
        const t = (bead + 1) / (residueCount + 1);
        drawResidualBead(
          ctx,
          baseX + Math.sin(t * 8 + i) * rx * 0.14,
          trailTop + (y - trailTop) * t,
          Math.max(0.8, radius * (0.07 + hash(bead + i * 7, 39) * 0.09)),
          alpha * (0.23 - t * 0.1),
        );
      }
    }

    // Clip and invert a compressed sample of the actual cabin scene: a cheap but spatially honest refraction cue.
    ctx.save();
    blobPath(ctx, x, y, rx, ry, i, merging);
    ctx.clip();
    ctx.globalAlpha = 0.12 + strength * 0.07;
    ctx.translate(x + rx * 0.12, y - ry * 0.08);
    ctx.scale(0.88, -0.58);
    ctx.translate(-x, -y);
    ctx.drawImage(source, 0, 0, width, height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const reflection = ctx.createLinearGradient(x, y - ry, x, y + ry);
    reflection.addColorStop(0, `rgba(213,233,225,${alpha * 0.34})`);
    reflection.addColorStop(0.4, `rgba(20,56,57,${alpha * 0.12})`);
    reflection.addColorStop(0.62, `rgba(190,111,67,${alpha * 0.15})`);
    reflection.addColorStop(1, `rgba(4,25,29,${alpha * 0.28})`);
    ctx.globalAlpha = 1;
    ctx.fillStyle = reflection;
    ctx.fillRect(x - rx * 1.4, y - ry * 1.4, rx * 2.8, ry * 2.8);
    ctx.restore();

    blobPath(ctx, x, y, rx, ry, i, merging);
    ctx.strokeStyle = `rgba(8,31,34,${alpha * 0.56})`;
    ctx.lineWidth = Math.max(1, radius * 0.15);
    ctx.stroke();
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((hash(i, 40) - 0.5) * 0.6);
    ctx.strokeStyle = `rgba(216,235,226,${alpha * (0.42 + 0.12 * Math.sin(time * 0.8 + i))})`;
    ctx.lineWidth = Math.max(0.8, radius * 0.09);
    ctx.beginPath();
    ctx.ellipse(-rx * 0.05, -ry * 0.05, rx * 0.78, ry * 0.7, 0, Math.PI * 1.08, Math.PI * 1.68);
    ctx.stroke();
    ctx.restore();
  }

  // Lower splash carries a broken meniscus highlight and short vertical reflections.
  const wetTop = height * (0.94 - strength * 0.075);
  const wetPoints: [number, number][] = [];
  for (let i = 0; i <= 24; i++) {
    const x = (i / 24) * width;
    const ripple = Math.sin(i * 2.31 + time * 0.72) * height * 0.003;
    const splash = hash(i, 41) < strength * 0.52 ? -height * (0.007 + hash(i, 42) * 0.028) : 0;
    wetPoints.push([x, wetTop + ripple + splash]);
  }
  ctx.beginPath();
  ctx.moveTo(0, height);
  ctx.lineTo(wetPoints[0]![0],wetPoints[0]![1]);
  for(const [x,y] of wetPoints.slice(1))ctx.lineTo(x,y);
  ctx.lineTo(width, height);
  ctx.closePath();
  const wetEdge = ctx.createLinearGradient(0, wetTop, 0, height);
  wetEdge.addColorStop(0, `rgba(89,139,134,${0.055 + strength * 0.1})`);
  wetEdge.addColorStop(0.18, `rgba(27,67,67,${0.08 + strength * 0.12})`);
  wetEdge.addColorStop(1, `rgba(7,29,32,${0.13 + strength * 0.18})`);
  ctx.fillStyle = wetEdge;
  ctx.fill();

  ctx.strokeStyle=`rgba(202,226,216,${0.18+strength*.2})`;ctx.lineWidth=Math.max(1,height*.0014);
  for(let part=0;part<5;part++){
    const start=part*5+(part%2),segment=wetPoints.slice(start,Math.min(start+3,wetPoints.length));
    if(segment.length<2)continue;
    ctx.beginPath();ctx.moveTo(segment[0]![0],segment[0]![1]);
    for(const [x,y] of segment.slice(1))ctx.lineTo(x,y);
    ctx.stroke();
  }
  for(let i=0;i<3;i++){
    const x=width*(.18+hash(i,43)*.64),length=height*(.018+hash(i,44)*.045)*strength;
    const y=wetTop-height*(.004+hash(i,45)*.015);
    const drip=ctx.createLinearGradient(x,y-length,x,y);
    drip.addColorStop(0,'rgba(194,222,213,0)');drip.addColorStop(1,`rgba(205,230,220,${.15+strength*.18})`);
    ctx.strokeStyle=drip;ctx.lineWidth=Math.max(.8,height*.001);
    ctx.beginPath();ctx.moveTo(x+2,y-length);ctx.quadraticCurveTo(x-3,y-length*.45,x,y);ctx.stroke();
  }

  ctx.restore();
}
