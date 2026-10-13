import * as THREE from 'three';
import type { PodRun } from '../sim/run';
import { HULL_WEAR } from '../sim/hull-wear';

/** Seam points on the hull plate just aft of a rib weld, matched by index to HULL_WEAR.seams (side, fore). Inner plate face is |x| ≈ 1.105. */
const SLOTS: readonly [number, number, number][] = [
  [-1.1, 1.45, -0.1], [1.1, 1.30, -0.1], [-1.1, 0.95, -0.9], [1.1, 1.55, -0.9], [1.1, 1.15, 1.5], [-1.1, 0.62, 1.5],
];
const SPRAY = 70;
/** Horizontal speed (m/s) water leaves the crack with; sets where it lands in the footwell. */
const STREAM_PUSH = .6;
/** Raycaster ignores visibility; spray points (1 m default threshold) and closed targets must not swallow cabin picks. */
const noPick = () => {};
/** Seconds for the wet streak to reach full darkness, and to dry after a clamp goes on. */
const WET_IN = 8, DRY_OUT = 18;

function crackTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const ctx = c.getContext('2d')!;
  let seed = 9133; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  ctx.strokeStyle = 'rgba(4,7,7,.95)'; ctx.lineCap = 'round';
  for (let pass = 0; pass < 2; pass++) {
    ctx.lineWidth = pass ? 1.2 : 4.5; ctx.beginPath();
    let x = 10, y = 32 + (rnd() - .5) * 8; ctx.moveTo(x, y);
    while (x < 246) { x += 8 + rnd() * 14; y = THREE.MathUtils.clamp(y + (rnd() - .5) * 14, 12, 52); ctx.lineTo(x, y); }
    ctx.stroke();
  }
  for (let i = 0; i < 7; i++) { const x = 40 + rnd() * 170, y = 32; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rnd() - .5) * 30, y + (rnd() > .5 ? 1 : -1) * (8 + rnd() * 16)); ctx.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function dropTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const ctx = c.getContext('2d')!, g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.45, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}
/** Broken lengthwise bands so the scrolling stream reads as moving water, not a rod. */
function flowTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 16;
  const ctx = c.getContext('2d')!;
  let seed = 411; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let x = 0; x < 128; x += 4) { ctx.fillStyle = `rgba(255,255,255,${.25 + rnd() * .75})`; ctx.fillRect(x, 0, 2 + rnd() * 4, 16); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.x = 3; return t;
}
/** Parabolic stream from the crack into the bilge, in seam-local space (+z into the cabin, y up). */
function streamGeometry(height: number, push: number) {
  const points: THREE.Vector3[] = [];
  for (let t = 0; t <= 1.2; t += .03) {
    const y = -.01 + .12 * t - 4.9 * t * t; points.push(new THREE.Vector3(0, Math.max(-height, y), .01 + push * t));
    if (y <= -height) break;
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 48, .003, 6, false);
}
function streakTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256;
  const ctx = c.getContext('2d')!;
  for (let x = 0; x < 64; x++) {
    const core = Math.exp(-(((x - 32) / 13) ** 2));
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, `rgba(255,255,255,${core})`); g.addColorStop(.75, `rgba(255,255,255,${core * .85})`); g.addColorStop(1, `rgba(255,255,255,${core * .35})`);
    ctx.fillStyle = g; ctx.fillRect(x, 0, 1, 256);
  }
  return new THREE.CanvasTexture(c);
}

interface Seam {
  group: THREE.Group; crack: THREE.Mesh; streak: THREE.Mesh; jet: THREE.Mesh; spray: THREE.Points; clamp: THREE.Mesh; target: THREE.Mesh;
  height: number; seeds: Float32Array; wet: number; open: boolean; patched: boolean;
}

/** Visible split seams in the cabin: crack, spray into the bilge, a spreading wet streak; a clamp once sealed. */
export class CabinSeams {
  private seams: Seam[] = [];
  private textures: THREE.Texture[] = [];
  private flow = flowTexture();

  constructor(private scene: THREE.Scene, steel: THREE.Material) {
    const crack = crackTexture(), streak = streakTexture(), drop = dropTexture(); this.textures.push(crack, streak, drop, this.flow);
    SLOTS.forEach((at, slot) => {
      const side = Math.sign(at[0]), height = at[1];
      const group = new THREE.Group(); group.position.set(...at); group.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      const crackMesh = new THREE.Mesh(new THREE.PlaneGeometry(.3, .075), new THREE.MeshBasicMaterial({ map: crack, transparent: true, depthWrite: false }));
      crackMesh.position.z = .004; crackMesh.rotation.z = (slot % 3 - 1) * .35; group.add(crackMesh);
      const streakMesh = new THREE.Mesh(new THREE.PlaneGeometry(.1, height), new THREE.MeshBasicMaterial({ color: 0x020606, alphaMap: streak, transparent: true, opacity: 0, depthWrite: false }));
      streakMesh.position.set(0, -height / 2, .003); group.add(streakMesh);
      const jet = new THREE.Mesh(streamGeometry(height, STREAM_PUSH), new THREE.MeshBasicMaterial({ color: 0x8fb1ad, alphaMap: this.flow, transparent: true, opacity: .3, depthWrite: false }));
      group.add(jet);
      const positions = new Float32Array(SPRAY * 3), seeds = new Float32Array(SPRAY * 3);
      for (let i = 0; i < SPRAY; i++) { seeds[i * 3] = Math.random(); seeds[i * 3 + 1] = Math.random(); seeds[i * 3 + 2] = Math.random(); }
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const spray = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xb6d4d0, map: drop, size: .007, transparent: true, opacity: .6, depthWrite: false }));
      spray.frustumCulled = false; spray.raycast = noPick; jet.raycast = noPick; group.add(spray);
      const clamp = new THREE.Mesh(new THREE.BoxGeometry(.26, .045, .03), steel); clamp.position.z = .015; clamp.rotation.z = crackMesh.rotation.z; clamp.visible = false; group.add(clamp);
      const target = new THREE.Mesh(new THREE.BoxGeometry(.36, .3, .12), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
      target.position.z = .06; target.userData.seam = slot; group.add(target);
      this.seams.push({ group, crack: crackMesh, streak: streakMesh, jet, spray, clamp, target, height, seeds, wet: 0, open: false, patched: false });
    });
  }

  /** Seam slot under a picked object, if any. */
  slotOf(object: THREE.Object3D | null): number | null {
    for (let o = object; o; o = o.parent) if (typeof o.userData.seam === 'number') return o.userData.seam;
    return null;
  }

  update(run: PodRun, time: number, dt: number) {
    const water = .015 + run.flood * .65;
    this.flow.offset.x = -time * 2.4;
    this.seams.forEach((s, slot) => {
      const open = run.seams.includes(slot) && slot < HULL_WEAR.seams.length;
      if (open !== s.open) {
        if (open) { s.patched = false; this.scene.add(s.group); }
        else if (s.open) s.patched = true;
        s.open = open;
      }
      s.wet = THREE.MathUtils.clamp(s.wet + (open ? dt / WET_IN : -dt / DRY_OUT), 0, 1);
      if (!open && !s.patched && s.wet <= 0) { s.group.removeFromParent(); return; }
      s.crack.visible = s.jet.visible = s.spray.visible = open;
      s.target.raycast = open ? THREE.Mesh.prototype.raycast : noPick;
      s.clamp.visible = s.patched;
      (s.streak.material as THREE.MeshBasicMaterial).opacity = .42 * s.wet;
      if (!open) return;
      (s.jet.material as THREE.MeshBasicMaterial).opacity = .22 + .1 * Math.abs(Math.sin(time * 17 + slot));
      // Droplets peel off the stream and fall into the bilge; local +z is into the cabin.
      const pos = s.spray.geometry.getAttribute('position') as THREE.BufferAttribute, floor = water - s.height;
      for (let i = 0; i < SPRAY; i++) {
        const a = s.seeds[i * 3]!, b = s.seeds[i * 3 + 1]!, c = s.seeds[i * 3 + 2]!;
        const life = .7, t = ((time * (1.3 + c * .5) + a) % 1) * life;
        const vx = (b - .5) * .18, vy = .12 + (c - .5) * .25, vz = STREAM_PUSH * (.75 + a * .5);
        const y = Math.max(floor, -.02 + vy * t - 4.9 * t * t);
        pos.setXYZ(i, vx * t, y, .01 + vz * t);
      }
      pos.needsUpdate = true;
    });
  }

  dispose() {
    for (const s of this.seams) s.group.traverse(o => { if (o instanceof THREE.Mesh || o instanceof THREE.Points) { o.geometry.dispose(); if (o.material !== s.clamp.material) (o.material as THREE.Material).dispose(); } });
    this.textures.forEach(t => t.dispose());
  }
}
