import * as THREE from 'three';

const WATER_VS = /* glsl */`
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewW;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewW = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const JET_FS = /* glsl */`
  uniform float uTime;
  uniform float uPulse;
  uniform float uSheath;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewW;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), f.x), f.y);
  }
  void main() {
    float longitudinal = vUv.x * 10.0 - uTime * (7.2 + uSheath * 1.4);
    float ropes = noise(vec2(longitudinal, vUv.y * 5.0 + uTime * 0.35));
    float fine = noise(vec2(longitudinal * 2.35, vUv.y * 13.0 - uTime));
    float breakup = smoothstep(0.16, 0.88, ropes * 0.72 + fine * 0.28);
    float rim = pow(1.0 - abs(dot(normalize(vNormalW), normalize(vViewW))), 2.2);
    vec3 deep = vec3(0.025, 0.19, 0.18);
    vec3 body = vec3(0.10, 0.39, 0.36);
    vec3 glint = vec3(0.48, 0.70, 0.65);
    vec3 color = mix(deep, body, 0.42 + ropes * 0.42);
    color = mix(color, glint, rim * (0.26 - uSheath * 0.09));
    float edge = mix(0.78, 0.42, rim);
    float alpha = mix(0.74, 0.20, uSheath) * edge * (0.72 + breakup * 0.28) * (0.88 + uPulse * 0.12);
    gl_FragColor = vec4(color, alpha);
  }
`;

const MIST_VS = /* glsl */`
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const MIST_FS = /* glsl */`
  uniform float uTime;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vWorld;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(41.7, 289.1))) * 45758.5453); }
  float noise(vec2 p) {
    vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.0),f.x),f.y);
  }
  void main() {
    float radial = 1.0 - smoothstep(0.12, 0.5, abs(vUv.x - 0.5));
    float ends = smoothstep(0.02, 0.18, vUv.y) * (1.0 - smoothstep(0.68, 1.0, vUv.y));
    float billow = noise(vUv * vec2(6.0, 10.0) + vec2(uTime * 0.12, -uTime * 1.35));
    float alpha = radial * ends * (0.22 + billow * 0.78) * uOpacity;
    gl_FragColor = vec4(0.20, 0.43, 0.40, alpha);
  }
`;

const DROP_VS = /* glsl */`
  attribute float scale;
  varying float vSeed;
  void main() {
    vSeed = scale;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp((7.0 + scale * 8.0) / max(0.35, -mv.z), 2.0, 17.0);
  }
`;

const DROP_FS = /* glsl */`
  uniform float uOpacity;
  varying float vSeed;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(91.7, 267.3))) * 41758.5453); }
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float angle = (vSeed - 0.5) * 1.45;
    p = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * p;
    // Teardrop head plus a narrow motion tail. Angular and cell noise erode the
    // silhouette so a paused frame never resolves to a row of perfect discs.
    vec2 headP = (p - vec2(0.0, -0.12)) * vec2(1.18 + vSeed * .3, .84);
    float headR = length(headP);
    float tailWidth = mix(.035, .17, smoothstep(.46, -.08, p.y));
    float tail = 1.0 - smoothstep(tailWidth, tailWidth + .075, abs(p.x));
    tail *= smoothstep(.48, .02, p.y) * smoothstep(-.31, -.08, p.y);
    float angular = atan(headP.y, headP.x) * 5.0 + vSeed * 19.0;
    float ragged = sin(angular) * .035 + (hash(floor(gl_PointCoord * 11.0) + vSeed) - .5) * .045;
    float head = 1.0 - smoothstep(.34 + ragged, .47 + ragged, headR);
    float body = max(head, tail * .78);
    float rim = smoothstep(.24 + ragged, .38 + ragged, headR) * (1.0 - smoothstep(.38 + ragged, .49 + ragged, headR));
    float highlight = 1.0 - smoothstep(0.0, 0.11, length(headP - vec2(-0.12, 0.1)));
    vec3 color = mix(vec3(0.055, 0.24, 0.23), vec3(0.57, 0.79, 0.74), rim * 0.7 + highlight * 0.65);
    float trailFade = mix(.48, 1.0, smoothstep(.18, -.32, p.y));
    gl_FragColor = vec4(color, body * trailFade * uOpacity * (0.58 + rim * 0.42));
  }
`;

export function makeJetMaterial(sheath: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPulse: { value: 0.5 },
      uSheath: { value: sheath ? 1 : 0 },
    },
    vertexShader: WATER_VS,
    fragmentShader: JET_FS,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/** Both layers use physical transmission; the core has stronger absorption and distortion. */
export function makeRefractiveJetMaterial(
  layer: 'core' | 'sheath', seed: number,
): THREE.MeshPhysicalMaterial {
  const core = layer === 'core';
  const material = new THREE.MeshPhysicalMaterial({
    color: core ? 0x0b3533 : 0x164c49,
    roughness: core ? .09 : .17,
    metalness: 0,
    transmission: core ? .58 : .82,
    thickness: core ? .13 : .065,
    ior: 1.333,
    attenuationColor: new THREE.Color(core ? 0x063532 : 0x0b4a46),
    attenuationDistance: core ? .19 : .48,
    transparent: true,
    opacity: core ? .96 : .76,
    depthWrite: false,
    side: THREE.DoubleSide,
    clearcoat: core ? .1 : .24,
    clearcoatRoughness: core ? .16 : .22,
  });
  material.userData.flow = {
    time: 0, pulse: .5, seed, radius: core ? .021 : .043,
    shader: null as THREE.WebGLProgramParametersWithUniforms | null,
  };
  material.onBeforeCompile = shader => {
    shader.uniforms.uJetTime = { value: material.userData.flow.time };
    shader.uniforms.uJetPulse = { value: material.userData.flow.pulse };
    shader.uniforms.uJetSeed = { value: material.userData.flow.seed };
    shader.uniforms.uJetRadius = { value: material.userData.flow.radius };
    material.userData.flow.shader = shader;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uJetTime;
        uniform float uJetSeed;
        uniform float uJetRadius;
        varying vec2 vJetUv;
        varying float vJetBreak;
        float jetVHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vJetUv = uv;
        float travel = sin(uv.x*39.0-uJetTime*12.7+uJetSeed)*.075
          + sin(uv.x*73.0-uJetTime*18.1+uJetSeed*2.1)*.045;
        float bucket = floor(uJetTime*1.15+uJetSeed);
        float eventOn = step(.79,jetVHash(vec2(bucket,uJetSeed)));
        float breakCenter = mix(.24,.82,jetVHash(vec2(bucket+3.7,uJetSeed+9.1)));
        float gap = (1.0-smoothstep(.012,.058,abs(uv.x-breakCenter)))*eventOn;
        float neck = 1.0+travel-gap*.72;
        transformed += normal*uJetRadius*(neck-1.0);
        transformed.x += (sin(uv.x*24.0-uJetTime*15.0+uJetSeed)*.006
          + sin(uv.x*51.0+uJetTime*9.0)*.003)*smoothstep(.08,.9,uv.x);
        transformed.y += sin(uv.x*31.0-uJetTime*11.0+uJetSeed*.7)*.003*smoothstep(.1,.9,uv.x);
        vJetBreak = gap;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uJetTime;
        uniform float uJetPulse;
        varying vec2 vJetUv;
        varying float vJetBreak;
        float jetHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float jetNoise(vec2 p){
          vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
          return mix(mix(jetHash(i),jetHash(i+vec2(1.,0.)),f.x),mix(jetHash(i+vec2(0.,1.)),jetHash(i+1.),f.x),f.y);
        }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float jetFlow = jetNoise(vec2(vJetUv.x*13.0-uJetTime*8.4,vJetUv.y*7.0+uJetTime*.42));
        diffuseColor.a *= mix(.62,.98,jetFlow) * mix(.93,1.0,uJetPulse) * (1.0-vJetBreak*.995);
        diffuseColor.rgb *= mix(.72,1.08,jetFlow);`);
  };
  material.customProgramCacheKey = () => `cabin-seam-refractive-jet-v3-${layer}`;
  return material;
}

export function updateJetMaterial(material: THREE.Material, time: number, pulse: number): void {
  if (material instanceof THREE.ShaderMaterial) {
    material.uniforms.uTime!.value = time;
    material.uniforms.uPulse!.value = pulse;
    return;
  }
  const flow = material.userData.flow as {
    time: number; pulse: number; seed: number; radius: number;
    shader: THREE.WebGLProgramParametersWithUniforms | null;
  } | undefined;
  if (!flow) return;
  flow.time = time; flow.pulse = pulse;
  if (flow.shader) {
    flow.shader.uniforms.uJetTime.value = time;
    flow.shader.uniforms.uJetPulse.value = pulse;
  }
}

export function makeMistMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0.34 } },
    vertexShader: MIST_VS,
    fragmentShader: MIST_FS,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
  });
}

export function makeDropletMaterial(opacity: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: opacity } },
    vertexShader: DROP_VS,
    fragmentShader: DROP_FS,
    transparent: true,
    depthWrite: false,
  });
}

const STREAK_VS = /* glsl */`
  attribute float instanceSeed;
  varying vec2 vUv;
  varying float vSeed;
  void main() {
    vUv = uv;
    vSeed = instanceSeed;
    vec4 local = vec4(position, 1.0);
    #ifdef USE_INSTANCING
      local = instanceMatrix * local;
    #endif
    gl_Position = projectionMatrix * modelViewMatrix * local;
  }
`;

const STREAK_FS = /* glsl */`
  uniform float uOpacity;
  varying vec2 vUv;
  varying float vSeed;
  float hash(vec2 p){return fract(sin(dot(p,vec2(91.7,267.3)))*41758.5453);}
  void main() {
    vec2 p = vUv - .5;
    float taper = mix(.08,.46,smoothstep(.48,-.5,p.y));
    float edgeNoise = (hash(floor(vUv*vec2(13.,29.))+vSeed*17.)-.5)*.13;
    float body = 1.0-smoothstep(taper+edgeNoise,taper+.105+edgeNoise,abs(p.x));
    float head = 1.0-smoothstep(.24+edgeNoise,.48+edgeNoise,length(vec2(p.x,p.y+.34)*vec2(1.0,.72)));
    float alpha = max(body*smoothstep(.5,-.34,p.y)*.74,head);
    float rim = smoothstep(.2,.43,abs(p.x)/max(.03,taper))*(1.0-smoothstep(.43,.62,abs(p.x)/max(.03,taper)));
    vec3 color = mix(vec3(.025,.17,.16),vec3(.38,.66,.61),rim*.62);
    gl_FragColor = vec4(color,alpha*uOpacity);
  }
`;

function crossedStreakGeometry(count: number, seeds: Float32Array): THREE.InstancedBufferGeometry {
  // Two crossed quads avoid camera-facing sprite math while staying visible from any
  // cabin angle. Their local +Y axis is aligned to velocity by the instance matrix.
  const vertices = new Float32Array([
    -.5,-.5,0, .5,-.5,0, .5,.5,0, -.5,.5,0,
    0,-.5,-.5, 0,-.5,.5, 0,.5,.5, 0,.5,-.5,
  ]);
  const uv = new Float32Array([
    0,0, 1,0, 1,1, 0,1,
    0,0, 1,0, 1,1, 0,1,
  ]);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setAttribute('instanceSeed', new THREE.InstancedBufferAttribute(seeds, 1));
  geometry.setIndex([0,1,2,0,2,3, 4,5,6,4,6,7]);
  geometry.instanceCount = count;
  return geometry;
}

export function makeBallisticDroplets(
  seeds: Float32Array, opacity: number,
): THREE.InstancedMesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial> {
  const count = seeds.length;
  const material = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: opacity } },
    vertexShader: STREAK_VS,
    fragmentShader: STREAK_FS,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.InstancedMesh(crossedStreakGeometry(count, seeds), material, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  return mesh;
}

export function wetStainTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 192; c.height = 512;
  const ctx = c.getContext('2d')!;
  let seed = 7189;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const image = ctx.createImageData(c.width, c.height);
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    const nx = Math.abs((x - c.width * .5) / (c.width * .5));
    const taper = 1 - THREE.MathUtils.smoothstep(nx, .32 + y / c.height * .24, .96);
    const rivulet = Math.pow(Math.max(0, Math.sin(x * .17 + Math.sin(y * .025) * 3.2)), 7) * .34;
    const grain = rnd() * .18;
    const top = THREE.MathUtils.smoothstep(y / c.height, 0, .08);
    const a = Math.min(1, taper * (.34 + grain + rivulet) * (1 - top * .35));
    const i = (y * c.width + x) * 4;
    const mask = a * 255;
    image.data[i] = mask; image.data[i + 1] = mask; image.data[i + 2] = mask; image.data[i + 3] = mask;
  }
  ctx.putImageData(image, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Soft wet halo aligned to the deterministic crack path, with no rectangular card edge. */
export function crackWetHaloTexture(seed = 9133): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const ctx = c.getContext('2d')!;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const path = new Path2D();
  let x = 10, y = 32 + (rnd() - .5) * 8; path.moveTo(x, y);
  while (x < 246) { x += 8 + rnd() * 14; y = THREE.MathUtils.clamp(y + (rnd() - .5) * 14, 12, 52); path.lineTo(x, y); }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(255,255,255,.72)'; ctx.shadowBlur = 15;
  ctx.strokeStyle = 'rgba(255,255,255,.32)'; ctx.lineWidth = 15; ctx.stroke(path);
  ctx.shadowBlur = 6; ctx.strokeStyle = 'rgba(255,255,255,.58)'; ctx.lineWidth = 6; ctx.stroke(path);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function puddleMaskTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(124, 130, 20, 128, 128, 124);
  g.addColorStop(0, 'rgba(255,255,255,.96)');
  g.addColorStop(.58, 'rgba(255,255,255,.78)');
  g.addColorStop(.82, 'rgba(255,255,255,.34)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  for (let i = 0; i <= 48; i++) {
    const a = i / 48 * Math.PI * 2;
    const r = 104 + Math.sin(a * 5) * 9 + Math.sin(a * 11 + .7) * 5;
    const x = 128 + Math.cos(a) * r, y = 128 + Math.sin(a) * r * .73;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath(); ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
