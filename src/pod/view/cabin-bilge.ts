import * as THREE from 'three';
import type { PodRun } from '../sim/run';

const BILGE_WIDTH = 2.18;
const BILGE_LENGTH = 3.86;
const BILGE_CENTER_Z = 0.2;
const BILGE_MIN_Z = BILGE_CENTER_Z - BILGE_LENGTH * 0.5;
const BILGE_MAX_Z = BILGE_CENTER_Z + BILGE_LENGTH * 0.5;
const BILGE_MIN_X = -BILGE_WIDTH * 0.5;
const BILGE_MAX_X = BILGE_WIDTH * 0.5;

/**
 * Cabin standing water. Sim flood 0..1 maps to a readable ankle→shin→knee surface so
 * the player sees accumulation early; death still uses the sim value, not this height.
 */
export function bilgeSurfaceY(flood: number): number {
  const f = THREE.MathUtils.clamp(flood, 0, 1);
  // Early puddles exaggerate; later growth slows so water does not swallow the helm too soon.
  return 0.02 + Math.pow(f, 0.62) * 0.92;
}

function waterNormalMap(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  let seed = 7721;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const data = ctx.createImageData(256, 256);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const n = Math.sin(x * 0.11 + y * 0.07) * 0.35
        + Math.sin(x * 0.03 - y * 0.19) * 0.4 + rnd() * 0.25;
      const nx = 0.5 + n * 0.22;
      const ny = 0.5 + Math.sin(x * 0.09 - y * 0.13) * 0.22;
      const i = (y * 256 + x) * 4;
      data.data[i] = nx * 255;
      data.data[i + 1] = ny * 255;
      data.data[i + 2] = 220;
      data.data[i + 3] = 255;
    }
  }
  ctx.putImageData(data, 0, 0);
  const texture = new THREE.CanvasTexture(c);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3.2, 5.4);
  return texture;
}

function foamTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 48;
  const ctx = c.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, 0, c.height);
  gradient.addColorStop(0, 'rgba(220,242,235,0)');
  gradient.addColorStop(0.32, 'rgba(220,242,235,.72)');
  gradient.addColorStop(0.58, 'rgba(170,210,202,.4)');
  gradient.addColorStop(1, 'rgba(220,242,235,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, c.width, c.height);

  let seed = 9137;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x80000000;
  };
  for (let i = 0; i < 160; i++) {
    const radius = 0.8 + rnd() * 2.2;
    ctx.beginPath();
    ctx.arc(rnd() * c.width, 11 + rnd() * 23, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(235,248,243,${0.16 + rnd() * 0.5})`;
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(c);
  texture.wrapS = THREE.RepeatWrapping;
  texture.repeat.x = 5;
  return texture;
}

function scatterTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  gradient.addColorStop(0, 'rgba(155,224,210,.8)');
  gradient.addColorStop(0.45, 'rgba(87,174,164,.24)');
  gradient.addColorStop(1, 'rgba(40,105,106,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

const noPick = () => {};

/** Standing bilge water with a rippling surface, depth walls and a foam rim against the hull. */
export class CabinBilge {
  private root = new THREE.Group();
  private surface: THREE.Mesh;
  private body: THREE.Mesh;
  private foam: THREE.Mesh[] = [];
  private wetWalls: THREE.Mesh[] = [];
  private wetLines: THREE.Mesh[] = [];
  private scatterLayers: THREE.Mesh[] = [];
  private caustic: THREE.PointLight;
  private normal: THREE.CanvasTexture;
  private foamMap: THREE.CanvasTexture;
  private scatterMap: THREE.CanvasTexture;
  private basePositions: Float32Array;
  private shown = 0;

  constructor(scene: THREE.Scene) {
    this.normal = waterNormalMap();
    this.foamMap = foamTexture();
    this.scatterMap = scatterTexture();

    // Standard is deliberately used instead of transmission: the cabin has little useful
    // environment light, so transmission turns the ankle-deep surface nearly black.
    const surfMat = new THREE.MeshStandardMaterial({
      color: 0x28585b,
      emissive: 0x071d20,
      emissiveIntensity: 0.58,
      metalness: 0.06,
      roughness: 0.24,
      transparent: true,
      opacity: 0.74,
      depthWrite: false,
      side: THREE.DoubleSide,
      normalMap: this.normal,
      normalScale: new THREE.Vector2(0.82, 0.82),
    });
    this.surface = new THREE.Mesh(
      new THREE.PlaneGeometry(BILGE_WIDTH, BILGE_LENGTH, 28, 48),
      surfMat,
    );
    this.surface.rotation.x = -Math.PI / 2;
    this.surface.position.set(0, 0.02, BILGE_CENTER_Z);
    this.surface.renderOrder = 12;
    this.surface.raycast = noPick;
    this.root.add(this.surface);
    const position = this.surface.geometry.getAttribute('position') as THREE.BufferAttribute;
    this.basePositions = new Float32Array(position.array);

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x12383b,
      emissive: 0x071b1e,
      emissiveIntensity: 0.44,
      transparent: true,
      opacity: 0.5,
      roughness: 0.68,
      metalness: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.body = new THREE.Mesh(
      new THREE.BoxGeometry(BILGE_WIDTH - 0.025, 1, BILGE_LENGTH - 0.025),
      bodyMat,
    );
    this.body.position.set(0, 0.5, BILGE_CENTER_Z);
    this.body.renderOrder = 7;
    this.body.raycast = noPick;
    this.root.add(this.body);

    const foamMaterial = new THREE.MeshBasicMaterial({
      color: 0xd4e9e3,
      alphaMap: this.foamMap,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    for (const [width, length, x, z] of [
      [BILGE_WIDTH, 0.11, 0, BILGE_MIN_Z + 0.035],
      [BILGE_WIDTH, 0.11, 0, BILGE_MAX_Z - 0.035],
      [0.11, BILGE_LENGTH, BILGE_MIN_X + 0.035, BILGE_CENTER_Z],
      [0.11, BILGE_LENGTH, BILGE_MAX_X - 0.035, BILGE_CENTER_Z],
    ] as const) {
      const edge = this.foam.length;
      const edgeMap = this.foamMap.clone();
      edgeMap.repeat.x = edge % 2 ? -5 : 5;
      edgeMap.offset.x = edge * 0.37 + (edge % 2 ? 1 : 0);
      edgeMap.needsUpdate = true;
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(width, length),
        foamMaterial.clone(),
      );
      (mesh.material as THREE.MeshBasicMaterial).alphaMap = edgeMap;
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, 0.024, z);
      mesh.renderOrder = 14;
      mesh.raycast = noPick;
      this.foam.push(mesh);
      this.root.add(mesh);
    }
    foamMaterial.dispose();

    const wetWallMaterial = new THREE.MeshStandardMaterial({
      color: 0x163b3c,
      emissive: 0x061516,
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.46,
      roughness: 0.18,
      metalness: 0.08,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const wetLineMaterial = new THREE.MeshBasicMaterial({
      color: 0x7ba7a0,
      transparent: true,
      opacity: 0.44,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.addWallBand(BILGE_WIDTH, 0, BILGE_MIN_Z + 0.008, 0, wetWallMaterial, this.wetWalls);
    this.addWallBand(BILGE_WIDTH, 0, BILGE_MAX_Z - 0.008, Math.PI, wetWallMaterial, this.wetWalls);
    this.addWallBand(BILGE_LENGTH, BILGE_MIN_X + 0.008, BILGE_CENTER_Z, Math.PI / 2, wetWallMaterial, this.wetWalls);
    this.addWallBand(BILGE_LENGTH, BILGE_MAX_X - 0.008, BILGE_CENTER_Z, -Math.PI / 2, wetWallMaterial, this.wetWalls);
    this.addWallBand(BILGE_WIDTH, 0, BILGE_MIN_Z + 0.012, 0, wetLineMaterial, this.wetLines);
    this.addWallBand(BILGE_WIDTH, 0, BILGE_MAX_Z - 0.012, Math.PI, wetLineMaterial, this.wetLines);
    this.addWallBand(BILGE_LENGTH, BILGE_MIN_X + 0.012, BILGE_CENTER_Z, Math.PI / 2, wetLineMaterial, this.wetLines);
    this.addWallBand(BILGE_LENGTH, BILGE_MAX_X - 0.012, BILGE_CENTER_Z, -Math.PI / 2, wetLineMaterial, this.wetLines);
    wetWallMaterial.dispose();
    wetLineMaterial.dispose();

    const scatterMaterial = new THREE.MeshBasicMaterial({
      color: 0x68aaa2,
      alphaMap: this.scatterMap,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < 3; i++) {
      const layer = new THREE.Mesh(
        new THREE.PlaneGeometry(BILGE_WIDTH * 0.62, BILGE_LENGTH * 0.62),
        scatterMaterial.clone(),
      );
      layer.rotation.x = -Math.PI / 2;
      layer.position.z = BILGE_CENTER_Z;
      layer.renderOrder = 9 + i;
      layer.raycast = noPick;
      this.scatterLayers.push(layer);
      this.root.add(layer);
    }
    scatterMaterial.dispose();

    this.caustic = new THREE.PointLight(0x6eaaa3, 0, 3.4, 2);
    this.caustic.position.set(0, 0.12, BILGE_CENTER_Z);
    this.root.add(this.caustic);
    this.root.visible = false;
    scene.add(this.root);
  }

  private addWallBand(
    width: number,
    x: number,
    z: number,
    yaw: number,
    material: THREE.Material,
    target: THREE.Mesh[],
  ): void {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, 1), material.clone());
    mesh.position.set(x, 0.5, z);
    mesh.rotation.y = yaw;
    mesh.renderOrder = target === this.wetLines ? 13 : 8;
    mesh.raycast = noPick;
    target.push(mesh);
    this.root.add(mesh);
  }

  update(run: PodRun, time: number): void {
    const target = run.flood > 0.008 || run.seams.length > 0
      ? bilgeSurfaceY(Math.max(run.flood, run.seams.length ? 0.04 : 0))
      : 0;
    // Ease visual height so new water visibly creeps up the ribs.
    this.shown += (target - this.shown) * Math.min(1, 0.08 + run.leak * 12);
    const y = this.shown;
    const visible = y > 0.025;
    this.root.visible = visible;
    if (!visible) return;

    this.surface.position.y = y;
    const depth = Math.max(0.04, y - 0.005);
    this.body.scale.y = depth;
    this.body.position.y = 0.005 + depth * 0.5;
    const bodyMaterial = this.body.material as THREE.MeshStandardMaterial;
    bodyMaterial.opacity = 0.42 + Math.min(0.24, depth * 0.42);
    const surfaceMaterial = this.surface.material as THREE.MeshStandardMaterial;
    surfaceMaterial.opacity = 0.7 + Math.min(0.17, depth * 0.24);
    const emergency = THREE.MathUtils.clamp(
      (0.72 - run.hull) / 0.47 + (run.blackout ? 0.35 : 0),
      0,
      1,
    );
    surfaceMaterial.color.setHSL(
      0.49,
      0.39,
      0.22 + Math.min(0.055, run.flood * 0.08) + emergency * 0.035,
    );
    surfaceMaterial.emissive.setHSL(0.49 - emergency * 0.47, 0.48, 0.075 + emergency * 0.025);

    const pos = this.surface.geometry.getAttribute('position') as THREE.BufferAttribute;
    const amp = 0.005 + run.flood * 0.011 + (run.seams.length ? 0.006 : 0);
    for (let i = 0; i < pos.count; i++) {
      const bx = this.basePositions[i * 3]!;
      const by = this.basePositions[i * 3 + 1]!;
      const edgeFade = Math.min(
        1,
        Math.max(0, (BILGE_WIDTH * 0.5 - Math.abs(bx)) * 8),
        Math.max(0, (BILGE_LENGTH * 0.5 - Math.abs(by)) * 8),
      );
      const wave = Math.sin(bx * 7.2 + time * 2.1) * Math.cos(by * 5.4 - time * 1.7)
        + Math.sin(bx * 3.1 - by * 4.2 + time * 3.3) * 0.55;
      // PlaneGeometry is rotated into the floor; local Z is therefore world-space height.
      pos.setZ(i, wave * amp * (0.25 + edgeFade * 0.75));
    }
    pos.needsUpdate = true; this.surface.geometry.computeVertexNormals();
    this.normal.offset.x = time * 0.026;
    this.normal.offset.y = -time * 0.041;

    for (let i = 0; i < this.foam.length; i++) {
      const mesh = this.foam[i]!;
      mesh.position.y = y + 0.006;
      const material = mesh.material as THREE.MeshBasicMaterial;
      material.opacity = 0.36
        + Math.min(0.34, depth * 0.72) + Math.sin(time * 3.4 + i * 1.7) * 0.045;
      const edgeMap = material.alphaMap!;
      const direction = i % 2 ? -1 : 1;
      edgeMap.offset.x = i * 0.37 + (i % 2 ? 1 : 0) + time * 0.075 * direction;
    }

    for (const wall of this.wetWalls) {
      wall.scale.y = y + 0.055;
      wall.position.y = (y + 0.055) * 0.5;
      (wall.material as THREE.MeshStandardMaterial).opacity = 0.31 + Math.min(0.22, depth * 0.4);
    }
    for (let i = 0; i < this.wetLines.length; i++) {
      const line = this.wetLines[i]!;
      line.scale.y = 0.026 + Math.sin(time * 2.2 + i) * 0.004;
      line.position.y = y + 0.012;
      (line.material as THREE.MeshBasicMaterial).opacity = 0.3
        + Math.min(0.28, depth * 0.55);
    }

    for (let i = 0; i < this.scatterLayers.length; i++) {
      const layer = this.scatterLayers[i]!;
      layer.position.y = 0.012 + depth * (0.22 + i * 0.25);
      (layer.material as THREE.MeshBasicMaterial).opacity = 0.055
        + Math.min(0.1, depth * 0.1)
        + Math.sin(time * 1.6 + i * 2.1) * 0.012;
      layer.rotation.z = Math.sin(time * 0.12 + i) * 0.04;
    }

    this.caustic.intensity = 0.42 + run.flood * 1.15 + Math.sin(time * 4.2) * 0.07;
    this.caustic.position.y = Math.max(0.05, y * 0.72);
  }

  dispose(): void {
    this.root.removeFromParent();
    this.surface.geometry.dispose();
    this.body.geometry.dispose();
    (this.surface.material as THREE.Material).dispose();
    (this.body.material as THREE.Material).dispose();
    for (const mesh of [
      ...this.foam,
      ...this.wetWalls,
      ...this.wetLines,
      ...this.scatterLayers,
    ]) {
      mesh.geometry.dispose();
      if (this.foam.includes(mesh)) {
        (mesh.material as THREE.MeshBasicMaterial).alphaMap?.dispose();
      }
      (mesh.material as THREE.Material).dispose();
    }
    this.normal.dispose();
    this.foamMap.dispose();
    this.scatterMap.dispose();
  }
}
