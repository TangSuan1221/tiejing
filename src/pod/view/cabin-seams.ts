import * as THREE from 'three';
import type { PodRun } from '../sim/run';
import { HULL_WEAR } from '../sim/hull-wear';
import { bilgeSurfaceY } from './cabin-bilge';
import {
  crackWetHaloTexture, makeBallisticDroplets, makeDropletMaterial, makeMistMaterial,
  makeRefractiveJetMaterial, puddleMaskTexture, updateJetMaterial, wetStainTexture,
} from './cabin-seam-water';

/** Seam points on the hull plate just aft of a rib weld, matched by index to HULL_WEAR.seams (side, fore). */
const SLOTS: readonly [number, number, number][] = [
  [-1.1, 1.45, -0.1], [1.1, 1.30, -0.1], [-1.1, 0.95, -0.9], [1.1, 1.55, -0.9], [1.1, 1.15, 1.5], [-1.1, 0.62, 1.5],
];
const DROPS = 128, SPLASH = 72;
const STREAM_PUSH = 0.76;
const noPick = () => {};
const WET_IN = 5, DRY_OUT = 22;
const UP = new THREE.Vector3(0, 1, 0);
const instanceMatrix = new THREE.Matrix4(), instanceQuat = new THREE.Quaternion();
const instancePos = new THREE.Vector3(), instanceVel = new THREE.Vector3(), instanceScale = new THREE.Vector3();
function hash01(n: number): number { return ((Math.sin(n * 91.733) * 43758.5453) % 1 + 1) % 1; }
function smoothNoise(time: number, seed: number): number {
  const i = Math.floor(time), f = time - i, u = f * f * (3 - 2 * f);
  return THREE.MathUtils.lerp(hash01(i + seed), hash01(i + 1 + seed), u) * 2 - 1;
}

function crackTexture(seed: number) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const ctx = c.getContext('2d')!;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  ctx.strokeStyle = 'rgba(4,7,7,.95)'; ctx.lineCap = 'round';
  for (let pass = 0; pass < 2; pass++) {
    ctx.lineWidth = pass ? 1.4 : 5.2; ctx.beginPath();
    let x = 10, y = 32 + (rnd() - .5) * 8; ctx.moveTo(x, y);
    while (x < 246) { x += 8 + rnd() * 14; y = THREE.MathUtils.clamp(y + (rnd() - .5) * 14, 12, 52); ctx.lineTo(x, y); }
    ctx.stroke();
  }
  for (let i = 0; i < 9; i++) {
    const x = 40 + rnd() * 170, y = 32; ctx.lineWidth = 1.1; ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + (rnd() - .5) * 34, y + (rnd() > .5 ? 1 : -1) * (10 + rnd() * 18)); ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function streamGeometry(height: number, push: number, radius: number) {
  const points: THREE.Vector3[] = [];
  for (let t = 0; t <= 1.35; t += .025) {
    const y = -.015 + .18 * t - 4.6 * t * t;
    points.push(new THREE.Vector3(0, Math.max(-height + 0.02, y), .012 + push * t));
    if (y <= -height + 0.02) break;
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 56, radius, 8, false);
}

interface Seam {
  group: THREE.Group; crack: THREE.Mesh; crackBack: THREE.Mesh; wetHalo: THREE.Mesh;
  wetLip: THREE.Mesh; streak: THREE.Mesh; jetCore: THREE.Mesh; jetSheath: THREE.Mesh;
  mist: THREE.Points; mistCone: THREE.Mesh; spray: THREE.InstancedMesh; splash: THREE.InstancedMesh;
  crown: THREE.Mesh; ripple: THREE.Mesh; puddle: THREE.Mesh; clamp: THREE.Mesh; target: THREE.Mesh;
  height: number; dropSeeds: Float32Array; mistSeeds: Float32Array; splashSeeds: Float32Array;
  wet: number; open: boolean; patched: boolean;
}

/** Visible split seams: pressure jet, mist, floor splash, wet streak and a clamp once sealed. */
export class CabinSeams {
  private seams: Seam[] = [];
  private textures: THREE.Texture[] = [];

  constructor(private scene: THREE.Scene, steel: THREE.Material) {
    const streak = wetStainTexture(), puddleMask = puddleMaskTexture();
    this.textures.push(streak, puddleMask);
    SLOTS.forEach((at, slot) => {
      const side = Math.sign(at[0]), height = at[1];
      const group = new THREE.Group(); group.position.set(...at); group.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      const crackSeed = 9133 + slot * 7919;
      const crack = crackTexture(crackSeed), crackHalo = crackWetHaloTexture(crackSeed);
      this.textures.push(crack, crackHalo);

      const crackRotation = (slot % 3 - 1) * .32;
      // Three depths: soaked steel halo, recessed shadow, and the sharp split lip.
      // Their millimetre offsets produce real parallax at patching distance.
      const wetHalo = new THREE.Mesh(new THREE.PlaneGeometry(.58, .18), new THREE.MeshStandardMaterial({
        color: 0x061819, alphaMap: crackHalo, transparent: true, opacity: 0, depthWrite: false,
        roughness: .08, metalness: .03,
      }));
      wetHalo.position.z = .001; wetHalo.rotation.z = crackRotation; wetHalo.raycast = noPick; group.add(wetHalo);
      const crackBack = new THREE.Mesh(new THREE.PlaneGeometry(.43, .12), new THREE.MeshStandardMaterial({
        map: crack, color: 0x000202, roughness: .88, metalness: 0, transparent: true, opacity: .96, depthWrite: false,
      }));
      crackBack.position.set(.012, -.007, .003); crackBack.rotation.z = crackRotation; crackBack.raycast = noPick; group.add(crackBack);
      const crackMesh = new THREE.Mesh(new THREE.PlaneGeometry(.38, .1), new THREE.MeshStandardMaterial({
        map: crack, color: 0x071011, roughness: .18, metalness: .06, transparent: true, depthWrite: false,
      }));
      crackMesh.position.z = .019; crackMesh.rotation.z = crackRotation; group.add(crackMesh);

      const streakMesh = new THREE.Mesh(new THREE.PlaneGeometry(.42, height), new THREE.MeshStandardMaterial({
        color: 0x082a2b, alphaMap: streak, transparent: true, opacity: 0, depthWrite: false,
        roughness: .24, metalness: .03,
      }));
      streakMesh.position.set(0, -height / 2, .003); group.add(streakMesh);
      const wetLip = new THREE.Mesh(new THREE.PlaneGeometry(.43, .045), new THREE.MeshStandardMaterial({
        color: 0x010909, alphaMap: streak, transparent: true, opacity: 0, depthWrite: false,
        roughness: .12, metalness: .02,
      }));
      wetLip.position.set(0, -.04, .009); wetLip.rotation.z = crackRotation; wetLip.raycast = noPick; group.add(wetLip);

      const jetCore = new THREE.Mesh(streamGeometry(height, STREAM_PUSH, .021), makeRefractiveJetMaterial('core', slot * 7.1 + .3));
      const jetSheath = new THREE.Mesh(streamGeometry(height, STREAM_PUSH * .985, .043), makeRefractiveJetMaterial('sheath', slot * 7.1 + 3.7));
      jetCore.raycast = jetSheath.raycast = noPick; group.add(jetCore, jetSheath);

      const mistSeeds = new Float32Array(36 * 3), mistPos = new Float32Array(36 * 3);
      for (let i = 0; i < 36; i++) { mistSeeds[i * 3] = Math.random(); mistSeeds[i * 3 + 1] = Math.random(); mistSeeds[i * 3 + 2] = Math.random(); }
      const mistGeo = new THREE.BufferGeometry(); mistGeo.setAttribute('position', new THREE.BufferAttribute(mistPos, 3));
      const mistScale = new Float32Array(36); for (let i = 0; i < 36; i++) mistScale[i] = mistSeeds[i * 3 + 2]!;
      mistGeo.setAttribute('scale', new THREE.BufferAttribute(mistScale, 1));
      const mistPts = new THREE.Points(mistGeo, makeDropletMaterial(.17));
      mistPts.frustumCulled = false; mistPts.raycast = noPick; group.add(mistPts);

      const mistDirection = new THREE.Vector3(0, -.13, .66);
      const mistCone = new THREE.Mesh(new THREE.ConeGeometry(.19, mistDirection.length(), 24, 1, true), makeMistMaterial());
      mistCone.position.copy(mistDirection).multiplyScalar(.5);
      mistCone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), mistDirection.clone().normalize().negate());
      mistCone.raycast = noPick; group.add(mistCone);

      const dropSeeds = new Float32Array(DROPS * 3);
      for (let i = 0; i < DROPS; i++) { dropSeeds[i * 3] = Math.random(); dropSeeds[i * 3 + 1] = Math.random(); dropSeeds[i * 3 + 2] = Math.random(); }
      const dropScale = new Float32Array(DROPS); for (let i = 0; i < DROPS; i++) dropScale[i] = dropSeeds[i * 3 + 2]!;
      const spray = makeBallisticDroplets(dropScale, .82);
      spray.frustumCulled = false; spray.raycast = noPick; group.add(spray);

      const splashSeeds = new Float32Array(SPLASH * 3);
      for (let i = 0; i < SPLASH; i++) { splashSeeds[i * 3] = Math.random(); splashSeeds[i * 3 + 1] = Math.random(); splashSeeds[i * 3 + 2] = Math.random(); }
      const splashScale = new Float32Array(SPLASH); for (let i = 0; i < SPLASH; i++) splashScale[i] = splashSeeds[i * 3 + 1]!;
      const splash = makeBallisticDroplets(splashScale, .68);
      splash.frustumCulled = false; splash.raycast = noPick; group.add(splash);

      const crownMaterial = new THREE.MeshPhysicalMaterial({
        color: 0x164d49, roughness: .12, metalness: 0, transparent: true, opacity: .44,
        transmission: .28, thickness: .025, depthWrite: false, side: THREE.DoubleSide,
      });
      const crown = new THREE.Mesh(new THREE.ConeGeometry(.18, .09, 28, 1, true), crownMaterial);
      crown.raycast = noPick; group.add(crown);
      const ripple = new THREE.Mesh(new THREE.TorusGeometry(.13, .007, 6, 36), crownMaterial.clone());
      ripple.rotation.x = Math.PI / 2; ripple.raycast = noPick; group.add(ripple);

      const puddle = new THREE.Mesh(new THREE.CircleGeometry(.28, 24), new THREE.MeshPhysicalMaterial({
        color: 0x103638, alphaMap: puddleMask, metalness: .04, roughness: .16, transparent: true,
        opacity: 0, depthWrite: false, transmission: .3, thickness: .06, clearcoat: .55,
      }));
      puddle.rotation.x = -Math.PI / 2; puddle.position.set(0, -height + .015, STREAM_PUSH * .55); puddle.raycast = noPick; group.add(puddle);

      const clamp = new THREE.Mesh(new THREE.BoxGeometry(.28, .05, .034), steel);
      clamp.position.z = .016; clamp.rotation.z = crackMesh.rotation.z; clamp.visible = false; group.add(clamp);
      const target = new THREE.Mesh(new THREE.BoxGeometry(.4, .34, .14), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
      target.position.z = .07; target.userData.seam = slot; group.add(target);

      this.seams.push({
        group, crack: crackMesh, crackBack, wetHalo, wetLip, streak: streakMesh,
        jetCore, jetSheath, mist: mistPts, mistCone,
        spray, splash, crown, ripple, puddle, clamp, target,
        height, dropSeeds, mistSeeds, splashSeeds, wet: 0, open: false, patched: false,
      });
    });
  }

  slotOf(object: THREE.Object3D | null): number | null {
    for (let o = object; o; o = o.parent) if (typeof o.userData.seam === 'number') return o.userData.seam;
    return null;
  }

  /** Average lateral pan for open seams: −1 port … +1 starboard. */
  openPan(): number {
    let sum = 0, n = 0;
    for (let i = 0; i < this.seams.length; i++) if (this.seams[i]!.open) { sum += Math.sign(SLOTS[i]![0]); n++; }
    return n ? sum / n : 0;
  }

  update(run: PodRun, time: number, dt: number) {
    const waterY = bilgeSurfaceY(Math.max(run.flood, run.seams.length ? 0.04 : 0));
    this.seams.forEach((s, slot) => {
      const open = run.seams.includes(slot) && slot < HULL_WEAR.seams.length;
      if (open !== s.open) {
        if (open) { s.patched = false; this.scene.add(s.group); }
        else if (s.open) s.patched = true;
        s.open = open;
      }
      s.wet = THREE.MathUtils.clamp(s.wet + (open ? dt / WET_IN : -dt / DRY_OUT), 0, 1);
      if (!open && !s.patched && s.wet <= 0) { s.group.removeFromParent(); return; }

      s.crack.visible = s.crackBack.visible = s.jetCore.visible = s.jetSheath.visible = s.mist.visible = s.mistCone.visible =
        s.spray.visible = s.splash.visible = s.crown.visible = s.ripple.visible = open;
      s.wetHalo.visible = s.wetLip.visible = s.wet > 0;
      s.target.raycast = open ? THREE.Mesh.prototype.raycast : noPick;
      s.clamp.visible = s.patched;
      (s.streak.material as THREE.MeshStandardMaterial).opacity = .72 * s.wet;
      (s.wetHalo.material as THREE.MeshStandardMaterial).opacity = (.34 + (open ? .18 : 0)) * s.wet;
      (s.wetLip.material as THREE.MeshStandardMaterial).opacity = (.45 + (open ? .25 : 0)) * s.wet;
      const puddleMat = s.puddle.material as THREE.MeshPhysicalMaterial;
      puddleMat.opacity = open ? .42 + .34 * s.wet : .22 * s.wet;
      s.puddle.scale.set(0.72 + s.wet * 1.72 + (open ? .28 : 0), 0.62 + s.wet * 1.25, 1);
      s.puddle.position.y = waterY - s.height + 0.004;

      if (!open) return;
      const pulse = .5 + .5 * Math.abs(Math.sin(time * 19 + slot * 1.7));
      const tremor = smoothNoise(time * 19.3, slot * 17.1);
      const wander = smoothNoise(time * 2.15, slot * 31.7);
      const reach = 1 + smoothNoise(time * 3.7, slot * 11.3) * .035;
      // Shader deformation carries the traveling necks. The nozzle aims at an
      // explicit ±6.5cm impact offset, guaranteeing a clearly readable floor sweep.
      const impactSweep = wander * .065 + tremor * .012;
      const aimYaw = Math.atan2(impactSweep, STREAM_PUSH * reach * .55);
      const aimPitch = smoothNoise(time * 2.8, slot * 23.9) * .025;
      s.jetCore.scale.set(1, 1, reach); s.jetSheath.scale.set(1, 1, reach);
      s.jetCore.rotation.y = aimYaw; s.jetSheath.rotation.y = aimYaw * .94;
      s.jetCore.rotation.x = aimPitch; s.jetSheath.rotation.x = aimPitch * .92;
      updateJetMaterial(s.jetCore.material as THREE.Material, time + slot * .37, pulse);
      updateJetMaterial(s.jetSheath.material as THREE.Material, time + slot * .37, pulse);
      const mistMat = s.mistCone.material as THREE.ShaderMaterial;
      mistMat.uniforms.uTime!.value = time + slot;
      mistMat.uniforms.uOpacity!.value = .24 + pulse * .12;
      s.mistCone.scale.set(.9 + pulse * .2, 1, reach);
      const wetSpread = .88 + s.wet * .18 + pulse * .035;
      s.wetHalo.scale.set(wetSpread, wetSpread, 1);
      s.wetLip.scale.x = .82 + s.wet * .24 + pulse * .04;

      const floor = waterY - s.height;
      const mistPos = s.mist.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < 36; i++) {
        const a = s.mistSeeds[i * 3]!, b = s.mistSeeds[i * 3 + 1]!, c = s.mistSeeds[i * 3 + 2]!;
        const t = ((time * (.8 + c) + a) % 1);
        const spread = .025 + t * .16;
        mistPos.setXYZ(i, (b - .5) * spread + Math.tan(aimYaw) * STREAM_PUSH * t * .48, -.018 - .12 * t + (c - .5) * spread, .04 + STREAM_PUSH * reach * .48 * t);
      }
      mistPos.needsUpdate = true;

      for (let i = 0; i < DROPS; i++) {
        const a = s.dropSeeds[i * 3]!, b = s.dropSeeds[i * 3 + 1]!, c = s.dropSeeds[i * 3 + 2]!;
        const life = .72, t = ((time * (1.28 + c * .62) + a) % 1) * life;
        const vx = (b - .5) * .38 + Math.tan(aimYaw) * STREAM_PUSH, vy = .27 + (c - .5) * .24;
        const vz = STREAM_PUSH * reach * (.78 + a * .48);
        const y = -.02 + vy * t - 4.8 * t * t;
        instancePos.set(vx * t, y, .01 + vz * t);
        instanceVel.set(vx, vy - 9.6 * t, vz);
        const speed = instanceVel.length();
        instanceQuat.setFromUnitVectors(UP, instanceVel.normalize());
        const visible = y > floor;
        instanceScale.set(visible ? .007 + c * .007 : 0, visible ? .035 + speed * .018 : 0, visible ? .007 + c * .007 : 0);
        instanceMatrix.compose(instancePos, instanceQuat, instanceScale);
        s.spray.setMatrixAt(i, instanceMatrix);
      }
      s.spray.instanceMatrix.needsUpdate = true;

      const landZ = STREAM_PUSH * reach * .55;
      const landX = impactSweep;
      for (let i = 0; i < SPLASH; i++) {
        const a = s.splashSeeds[i * 3]!, b = s.splashSeeds[i * 3 + 1]!, c = s.splashSeeds[i * 3 + 2]!;
        const life = .5, t = ((time * (2 + c * .9) + a) % 1) * life;
        const ang = a * Math.PI * 2, maxR = .045 + b * .28, r = maxR * (t / life);
        const amp = .045 + c * .085, lift = Math.max(0, amp * Math.sin(Math.PI * t / life));
        instancePos.set(landX + Math.cos(ang) * r, floor + lift, landZ + Math.sin(ang) * r * .72);
        instanceVel.set(Math.cos(ang) * maxR / life, amp * Math.PI / life * Math.cos(Math.PI * t / life), Math.sin(ang) * maxR * .72 / life);
        const speed = instanceVel.length();
        instanceQuat.setFromUnitVectors(UP, instanceVel.normalize());
        instanceScale.set(.006 + c * .006, .028 + speed * .03, .006 + c * .006);
        instanceMatrix.compose(instancePos, instanceQuat, instanceScale);
        s.splash.setMatrixAt(i, instanceMatrix);
      }
      s.splash.instanceMatrix.needsUpdate = true;

      const impactPhase = (time * 2.65 + slot * .61) % 1;
      s.crown.position.set(landX, floor + .018, landZ);
      s.crown.scale.set(0.55 + impactPhase * 1.05, 0.4 + (1 - impactPhase) * 1.05, 0.55 + impactPhase * 1.05);
      (s.crown.material as THREE.MeshPhysicalMaterial).opacity = .5 * Math.pow(1 - impactPhase, 1.6);
      s.ripple.position.set(landX, floor + .012, landZ);
      s.ripple.scale.setScalar(.5 + impactPhase * 2.15);
      (s.ripple.material as THREE.MeshPhysicalMaterial).opacity = .34 * (1 - impactPhase);
    });
  }

  dispose() {
    for (const s of this.seams) s.group.traverse(o => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
        o.geometry.dispose();
        if (o.material !== s.clamp.material) (o.material as THREE.Material).dispose();
      }
    });
    this.textures.forEach(t => t.dispose());
  }
}
