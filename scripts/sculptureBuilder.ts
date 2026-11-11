import fs from 'node:fs';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface Station {
  y: number;
  x?: number;
  z?: number;
  rx: number;
  rz: number;
  b0: number;
  b1: number;
  w0: number;
  w1: number;
}

export interface BakedTexEntry {
  width: number;
  height: number;
  file: string;
}

export type SculptOffsetFn = (
  th: number,
  u: number,
  v: number,
  px: number,
  pz: number,
  py: number,
) => { dx?: number; dy?: number; dz?: number; scaleR?: number };

export class BakedTextureBank {
  private readonly dir: string;
  private readonly manifest: Record<string, BakedTexEntry>;
  private readonly cache = new Map<string, THREE.DataTexture>();

  constructor(dir = path.resolve(process.cwd(), 'scripts/baked_textures')) {
    this.dir = dir;
    const raw = fs.readFileSync(path.join(dir, 'manifest.json'), 'utf-8');
    this.manifest = JSON.parse(raw) as Record<string, BakedTexEntry>;
  }

  get(name: string, opts: { srgb?: boolean; nearest?: boolean; wrapClampV?: boolean } = {}): THREE.DataTexture {
    const { srgb = true, nearest = false, wrapClampV = true } = opts;
    const cacheKey = `${name}:${srgb}:${nearest}:${wrapClampV}`;
    const existing = this.cache.get(cacheKey);
    if (existing) return existing;

    const entry = this.manifest[name];
    if (!entry) throw new Error(`Missing baked texture "${name}" in ${this.dir}`);

    const compressed = fs.readFileSync(path.join(this.dir, entry.file));
    const rgba = new Uint8Array(inflateSync(compressed));
    const tex = new THREE.DataTexture(rgba, entry.width, entry.height, THREE.RGBAFormat);
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = wrapClampV ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    tex.magFilter = nearest ? THREE.NearestFilter : THREE.LinearFilter;
    tex.minFilter = nearest ? THREE.NearestFilter : THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = !nearest;
    tex.needsUpdate = true;
    this.cache.set(cacheKey, tex);
    return tex;
  }

  makeMat(opts: {
    albedo?: string;
    normal?: string;
    orm?: string;
    emissiveMap?: string;
    color?: number;
    roughness?: number;
    metalness?: number;
    normalScale?: number;
    emissive?: number;
    emissiveIntensity?: number;
    nearest?: boolean;
    side?: THREE.Side;
  }): THREE.MeshStandardMaterial {
    const mat = new THREE.MeshStandardMaterial({
      color: opts.color ?? 0xffffff,
      roughness: opts.orm ? 1.0 : (opts.roughness ?? 0.55),
      metalness: opts.orm ? 1.0 : (opts.metalness ?? 0.08),
      side: opts.side ?? THREE.FrontSide,
    });
    if (opts.albedo) mat.map = this.get(opts.albedo, { srgb: true, nearest: opts.nearest });
    if (opts.normal) {
      mat.normalMap = this.get(opts.normal, { srgb: false, nearest: false });
      const ns = opts.normalScale ?? 0.85;
      mat.normalScale = new THREE.Vector2(ns, ns);
    }
    if (opts.orm) {
      // Single linear metallicRoughness map (G=roughness, B=metalness) avoids GLTFExporter canvas merge
      const ormTex = this.get(opts.orm, { srgb: false, nearest: false });
      mat.roughnessMap = ormTex;
      mat.metalnessMap = ormTex;
    }
    if (opts.emissiveMap) {
      mat.emissiveMap = this.get(opts.emissiveMap, { srgb: true, nearest: opts.nearest });
      mat.emissive = new THREE.Color(opts.emissive ?? 0xffffff);
      mat.emissiveIntensity = opts.emissiveIntensity ?? 1.25;
    } else if (opts.emissive !== undefined) {
      mat.emissive = new THREE.Color(opts.emissive);
      mat.emissiveIntensity = opts.emissiveIntensity ?? 1.0;
    }
    return mat;
  }
}

export function gauss(x: number, center: number, sigma: number): number {
  const d = (x - center) / sigma;
  return Math.exp(-(d * d));
}

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * Builds a seamless skinned mesh from vertical stations.
 * Seam u=0 / u=1 sits on the BACK (-Z) so the front center (+Z) is continuous at u=0.5!
 */
export function buildSculptedSkinnedMesh(
  rawStations: Station[],
  radialSegs: number,
  mat: THREE.Material,
  skeleton: THREE.Skeleton,
  sculptFn?: SculptOffsetFn,
  capEnds = true,
): THREE.SkinnedMesh {
  const stations =
    rawStations.length > 1 && rawStations[0].y > rawStations[rawStations.length - 1].y
      ? [...rawStations].reverse()
      : rawStations;

  const positions: number[] = [];
  const uvs: number[] = [];
  const skinIdx: number[] = [];
  const skinWgt: number[] = [];
  const indices: number[] = [];

  const rows = stations.length;
  for (let r = 0; r < rows; r++) {
    const st = stations[r];
    const v = r / Math.max(1, rows - 1);
    const cx = st.x ?? 0;
    const cz = st.z ?? 0;
    for (let s = 0; s <= radialSegs; s++) {
      const u = s / radialSegs;
      const th = (u - 0.5) * Math.PI * 2;
      let px = Math.sin(th) * st.rx;
      let pz = Math.cos(th) * st.rz;
      let py = st.y;
      if (sculptFn) {
        const off = sculptFn(th, u, v, px, pz, py);
        if (off.scaleR !== undefined) {
          px *= off.scaleR;
          pz *= off.scaleR;
        }
        px += off.dx ?? 0;
        py += off.dy ?? 0;
        pz += off.dz ?? 0;
      }
      positions.push(cx + px, py, cz + pz);
      uvs.push(u, v);
      skinIdx.push(st.b0, st.b1, 0, 0);
      skinWgt.push(st.w0, st.w1, 0, 0);
    }
  }

  const stride = radialSegs + 1;
  for (let r = 0; r < rows - 1; r++) {
    for (let s = 0; s < radialSegs; s++) {
      const a = r * stride + s;
      const b = a + 1;
      const c = (r + 1) * stride + s;
      const d = c + 1;
      indices.push(a, b, c);
      indices.push(b, d, c);
    }
  }

  if (capEnds) {
    const botCenterIdx = positions.length / 3;
    const bot = stations[0];
    positions.push(bot.x ?? 0, bot.y, bot.z ?? 0);
    uvs.push(0.5, 0);
    skinIdx.push(bot.b0, bot.b1, 0, 0);
    skinWgt.push(bot.w0, bot.w1, 0, 0);
    for (let s = 0; s < radialSegs; s++) {
      indices.push(botCenterIdx, s + 1, s);
    }

    const topCenterIdx = positions.length / 3;
    const top = stations[rows - 1];
    positions.push(top.x ?? 0, top.y, top.z ?? 0);
    uvs.push(0.5, 1);
    skinIdx.push(top.b0, top.b1, 0, 0);
    skinWgt.push(top.w0, top.w1, 0, 0);
    const topRow = (rows - 1) * stride;
    for (let s = 0; s < radialSegs; s++) {
      indices.push(topCenterIdx, topRow + s, topRow + s + 1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIdx, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWgt, 4));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.bind(skeleton);
  return mesh;
}

export function makeBoneBoundPart(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  boneIdx: number,
  skeleton: THREE.Skeleton,
  offset = new THREE.Vector3(),
  rot = new THREE.Euler(),
  secondBoneIdx?: number,
  secondWeight = 0,
): THREE.SkinnedMesh {
  const g = geo.clone();
  const q = new THREE.Quaternion().setFromEuler(rot);
  const boneWorldPos = new THREE.Vector3();
  skeleton.bones[boneIdx].getWorldPosition(boneWorldPos);

  const m = new THREE.Matrix4().compose(boneWorldPos.clone().add(offset), q, new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(m);

  const count = g.attributes.position.count;
  const idx = new Uint16Array(count * 4);
  const wgt = new Float32Array(count * 4);
  const w1 = secondBoneIdx !== undefined ? secondWeight : 0;
  const w0 = 1 - w1;
  for (let i = 0; i < count; i++) {
    idx[i * 4] = boneIdx;
    idx[i * 4 + 1] = secondBoneIdx ?? 0;
    wgt[i * 4] = w0;
    wgt[i * 4 + 1] = w1;
  }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wgt, 4));
  const mesh = new THREE.SkinnedMesh(g, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.bind(skeleton);
  return mesh;
}

export interface TorsoSculptOpts {
  scale: number;
  belly: number;
  chestBuild: number;
  shoulders: number;
  muscularity: number;
  hardSurface?: number;
}

export function buildAnatomicalTorso(
  opts: TorsoSculptOpts,
  map: Record<string, number>,
  mat: THREE.Material,
  skeleton: THREE.Skeleton,
): THREE.SkinnedMesh {
  const { scale: s, belly: b, chestBuild: c, shoulders: sh, muscularity: mus, hardSurface = 0 } = opts;

  const raw: [number, number, number, number, number, number, number][] = [
    [0.82 * s, 0.145 * b, 0.102 * b, map.Hips, map.Spine, 1.0, 0.0],
    [0.89 * s, 0.156 * b, 0.112 * b, map.Hips, map.Spine, 0.92, 0.08],
    [0.96 * s, 0.152 * b, 0.114 * b, map.Hips, map.Spine, 0.72, 0.28],
    [1.03 * s, 0.143 * b, 0.112 * b, map.Hips, map.Spine, 0.42, 0.58],
    [1.10 * s, 0.148 * (b * 0.5 + c * 0.5), 0.116 * c, map.Spine, map.Chest, 0.75, 0.25],
    [1.18 * s, 0.168 * c, 0.128 * c, map.Spine, map.Chest, 0.52, 0.48],
    [1.26 * s, 0.190 * c, 0.140 * c, map.Spine, map.Chest, 0.22, 0.78],
    [1.34 * s, 0.214 * c, 0.148 * c, map.Chest, map.Neck, 0.96, 0.04],
    [1.42 * s, 0.222 * sh, 0.144 * c, map.Chest, map.Neck, 0.94, 0.06],
    [1.48 * s, 0.162 * sh, 0.118 * c, map.Chest, map.Neck, 0.78, 0.22],
    [1.53 * s, 0.095 * s, 0.088 * s, map.Chest, map.Neck, 0.45, 0.55],
    [1.57 * s, 0.062 * s, 0.062 * s, map.Neck, map.Head, 0.65, 0.35],
    [1.62 * s, 0.058 * s, 0.058 * s, map.Neck, map.Head, 0.15, 0.85],
  ];

  const stations: Station[] = raw.map(([y, rx, rz, b0, b1, w0, w1]) => ({ y, rx, rz, b0, b1, w0, w1 }));

  return buildSculptedSkinnedMesh(stations, 22, mat, skeleton, (th, _u, v) => {
    const cosT = Math.cos(th);
    const absT = Math.abs(th);
    let dz = 0;
    let dx = 0;

    if (v > 0.12 && v < 0.88) {
      // Sculpted pectoral shelves + sternum divider
      const pecEnvelope = gauss(v, 0.70, 0.095) * clamp01((cosT - 0.15) * 1.4);
      const sternumCleft = gauss(absT, 0, 0.12) * gauss(v, 0.70, 0.09);
      const pecBulge = (gauss(absT, 0.46, 0.28) - sternumCleft * 0.55) * pecEnvelope;
      dz += pecBulge * 0.022 * s * mus;

      // Sculpted 6-pack abs & obliques
      const abCol = (gauss(absT, 0.20, 0.14) - gauss(absT, 0, 0.07) * 0.65) * clamp01(cosT);
      const abRows = gauss(v, 0.26, 0.045) + gauss(v, 0.38, 0.045) + gauss(v, 0.49, 0.045);
      dz += abCol * abRows * 0.011 * s * mus;

      // Latissimus V-taper + back spinal channel
      const latMask = gauss(v, 0.68, 0.14) * gauss(absT, 1.65, 0.45);
      dx += Math.sign(Math.sin(th)) * latMask * 0.016 * s * mus;
      const spineFurrow = gauss(Math.PI - absT, 0, 0.18) * gauss(v, 0.52, 0.24);
      dz += spineFurrow * 0.012 * s * mus; // moves -Z inward toward +Z

      // Hard-surface angular armor bevel for Iron Man
      if (hardSurface > 0) {
        const chestHex = gauss(v, 0.70, 0.07) * (gauss(absT, 0, 0.20) * 0.4 + gauss(absT, 0.55, 0.2) * 0.9);
        dz += chestHex * 0.014 * s * hardSurface;
      }
    }

    return { dx, dz };
  });
}

export interface HeadSculptOpts {
  scale: number;
  browProminence?: number;
  jawWidth?: number;
  monkeyMuzzle?: number;
  helmetMode?: boolean;
}

export function buildSculptedHead(
  opts: HeadSculptOpts,
  map: Record<string, number>,
  mat: THREE.Material,
  skeleton: THREE.Skeleton,
): THREE.SkinnedMesh {
  const { scale: s, browProminence = 1.0, jawWidth = 1.0, monkeyMuzzle = 0, helmetMode = false } = opts;
  const baseY = 1.56 * s;

  const raw: [number, number, number, number, number, number, number, number][] = [
    // yOff, zOff, rx, rz, b0, b1, w0, w1
    [0.01 * s, 0.008 * s, 0.056 * s, 0.060 * s, map.Head, map.Neck, 0.85, 0.15],
    [0.042 * s, 0.016 * s, 0.072 * s * jawWidth, 0.094 * s, map.Head, map.Neck, 1.0, 0.0],
    [0.076 * s, 0.018 * s, 0.088 * s * jawWidth, 0.108 * s, map.Head, map.Neck, 1.0, 0.0],
    [0.112 * s, 0.014 * s, 0.098 * s, 0.114 * s, map.Head, map.Neck, 1.0, 0.0],
    [0.148 * s, 0.010 * s, 0.104 * s, 0.118 * s, map.Head, map.Neck, 1.0, 0.0],
    [0.184 * s, 0.004 * s, 0.108 * s, 0.122 * s, map.Head, map.Neck, 1.0, 0.0],
    [0.222 * s, -0.004 * s, 0.106 * s, 0.122 * s, map.Head, map.Neck, 1.0, 0.0],
    [0.258 * s, -0.008 * s, 0.094 * s, 0.110 * s, map.Head, map.Neck, 1.0, 0.0],
    [0.288 * s, -0.010 * s, 0.068 * s, 0.078 * s, map.Head, map.Neck, 1.0, 0.0],
    [0.308 * s, -0.012 * s, 0.028 * s, 0.034 * s, map.Head, map.Neck, 1.0, 0.0],
  ];

  const stations: Station[] = raw.map(([yo, zo, rx, rz, b0, b1, w0, w1]) => ({
    y: baseY + yo,
    z: zo,
    rx,
    rz,
    b0,
    b1,
    w0,
    w1,
  }));

  return buildSculptedSkinnedMesh(stations, 24, mat, skeleton, (th, _u, v) => {
    const absT = Math.abs(th);
    const cosT = Math.cos(th);
    let dx = 0;
    let dz = 0;

    if (cosT > 0.15) {
      // Sculpted nose bridge & nasal tip
      const noseFactor = helmetMode ? 0.45 : 1.0;
      const noseProfile = gauss(v, 0.44, 0.095) * (0.65 + 0.45 * gauss(v, 0.41, 0.045));
      dz += gauss(absT, 0, 0.12) * noseProfile * 0.024 * s * noseFactor;

      // Sunken orbital eye sockets flanking nose bridge, housing subtle eye globe convexity
      const inSocket = gauss(v, 0.54, 0.065) * gauss(absT, 0.42, 0.16);
      const eyeBall = gauss(v, 0.535, 0.028) * gauss(absT, 0.42, 0.09);
      dz -= inSocket * (helmetMode ? 0.006 : 0.014) * s;
      dz += eyeBall * (helmetMode ? 0.004 : 0.008) * s;

      // Supraorbital brow ridge casting natural shadow over sockets
      const brow = gauss(v, 0.62, 0.042) * gauss(absT, 0.25, 0.36);
      dz += brow * 0.012 * s * browProminence;

      // Zygomatic cheekbones
      const cheek = gauss(v, 0.43, 0.07) * gauss(absT, 0.72, 0.22);
      dz += cheek * 0.008 * s;
      dx += Math.sign(Math.sin(th)) * cheek * 0.006 * s;

      // Parted lips & chiseled chin prominence
      const mouth = gauss(v, 0.26, 0.032) * gauss(absT, 0, 0.22);
      const chin = gauss(v, 0.16, 0.055) * gauss(absT, 0, 0.26);
      dz += mouth * 0.007 * s + chin * 0.011 * s;

      // Sun Wukong expressive monkey muzzle projection
      if (monkeyMuzzle > 0) {
        const muz = gauss(v, 0.33, 0.12) * gauss(absT, 0, 0.42);
        dz += muz * 0.024 * s * monkeyMuzzle;
      }
    }

    // Flattened athletic temple planes on sides
    const temple = gauss(v, 0.60, 0.12) * gauss(absT, 1.05, 0.24);
    dx -= Math.sign(Math.sin(th)) * temple * 0.007 * s;

    return { dx, dz };
  });
}

export function buildSculptedEar(
  side: -1 | 1,
  s: number,
  pointed: boolean,
  mat: THREE.Material,
  headBone: number,
  skeleton: THREE.Skeleton,
): THREE.SkinnedMesh {
  const earShape = new THREE.Shape();
  if (pointed) {
    earShape.moveTo(0, -0.022 * s);
    earShape.quadraticCurveTo(0.024 * s, -0.018 * s, 0.036 * s, 0.032 * s);
    earShape.quadraticCurveTo(0.012 * s, 0.028 * s, -0.006 * s, 0.016 * s);
  } else {
    earShape.moveTo(0, -0.02 * s);
    earShape.quadraticCurveTo(0.02 * s, -0.018 * s, 0.02 * s, 0.014 * s);
    earShape.quadraticCurveTo(0.012 * s, 0.024 * s, 0, 0.016 * s);
  }
  earShape.closePath();
  const geo = new THREE.ExtrudeGeometry(earShape, {
    depth: 0.009 * s,
    bevelEnabled: true,
    bevelThickness: 0.003 * s,
    bevelSize: 0.003 * s,
    bevelSegments: 2,
  });
  geo.translate(0, 0, -0.0045 * s);
  if (side < 0) geo.scale(-1, 1, 1);
  return makeBoneBoundPart(
    geo,
    mat,
    headBone,
    skeleton,
    new THREE.Vector3(side * 0.104 * s, 0.132 * s, -0.004 * s),
    new THREE.Euler(0, side * -0.45, 0),
  );
}

/**
 * Builds an anatomical muscular arm + articulated sculpted fist/hand weighted cleanly to lShoulder/lElbow/lHand (or right).
 */
export function buildAnatomicalArmWithHand(
  isLeft: boolean,
  s: number,
  shMul: number,
  mus: number,
  armMat: THREE.Material,
  forearmMat: THREE.Material,
  handMat: THREE.Material,
  map: Record<string, number>,
  skeleton: THREE.Skeleton,
  customHandPart?: THREE.BufferGeometry,
): THREE.SkinnedMesh[] {
  const sx = isLeft ? 1 : -1;
  const xPos = sx * 0.22 * shMul * s;
  const shIdx = isLeft ? map.lShoulder : map.rShoulder;
  const elIdx = isLeft ? map.lElbow : map.rElbow;
  const hIdx = isLeft ? map.lHand : map.rHand;
  const topY = 1.44 * s;
  const elY = 1.18 * s;
  const wrY = 0.94 * s;

  // Upper arm + shoulder deltoid cap (upper arm mesh ends smoothly below elbow -> clean handoff)
  const bulk = 0.92 + mus * 0.14;
  const upperStations: Station[] = [
    { y: topY + 0.038 * s, x: xPos, rx: 0.058 * s * bulk, rz: 0.058 * s * bulk, b0: map.Chest, b1: shIdx, w0: 0.45, w1: 0.55 },
    { y: topY + 0.005 * s, x: xPos, rx: 0.068 * s * bulk, rz: 0.066 * s * bulk, b0: shIdx, b1: elIdx, w0: 0.96, w1: 0.04 },
    { y: topY - 0.06 * s, x: xPos, rx: 0.065 * s * bulk, rz: 0.064 * s * bulk, b0: shIdx, b1: elIdx, w0: 0.92, w1: 0.08 },
    { y: topY - 0.14 * s, x: xPos, rx: 0.059 * s * bulk, rz: 0.063 * s * bulk, b0: shIdx, b1: elIdx, w0: 0.78, w1: 0.22 },
    { y: elY + 0.03 * s, x: xPos, rx: 0.048 * s, rz: 0.049 * s, b0: shIdx, b1: elIdx, w0: 0.48, w1: 0.52 },
    { y: elY - 0.02 * s, x: xPos, rx: 0.050 * s, rz: 0.050 * s, b0: elIdx, b1: hIdx, w0: 0.92, w1: 0.08 },
    { y: elY - 0.09 * s, x: xPos, rx: 0.052 * s * bulk, rz: 0.052 * s * bulk, b0: elIdx, b1: hIdx, w0: 0.85, w1: 0.15 },
    { y: elY - 0.17 * s, x: xPos, rx: 0.042 * s, rz: 0.041 * s, b0: elIdx, b1: hIdx, w0: 0.55, w1: 0.45 },
    { y: wrY + 0.005 * s, x: xPos, rx: 0.035 * s, rz: 0.030 * s, b0: hIdx, b1: elIdx, w0: 0.88, w1: 0.12 },
  ];

  const out: THREE.SkinnedMesh[] = [];
  if (armMat === forearmMat) {
    out.push(buildSculptedSkinnedMesh(upperStations, 12, armMat, skeleton));
  } else {
    // Split sleeve vs bare muscular forearm seamlessly right below elbow
    const upperOnly = upperStations.slice(0, 6);
    const lowerOnly = upperStations.slice(5);
    out.push(buildSculptedSkinnedMesh(upperOnly, 12, armMat, skeleton));
    out.push(buildSculptedSkinnedMesh(lowerOnly, 12, forearmMat, skeleton));
  }

  // Sculpted anatomical fist / hand at hIdx
  if (customHandPart) {
    out.push(makeBoneBoundPart(customHandPart, handMat, hIdx, skeleton, new THREE.Vector3(0, -0.028 * s, 0.01 * s)));
  } else {
    // Palm block + curled finger knuckle block + thumb ridge
    out.push(
      makeBoneBoundPart(
        new THREE.BoxGeometry(0.056 * s, 0.062 * s, 0.048 * s),
        handMat,
        hIdx,
        skeleton,
        new THREE.Vector3(0, -0.022 * s, 0.006 * s),
      ),
    );
    // 4 sculpted curled finger ridges on lower fist front
    for (let f = 0; f < 4; f++) {
      const fy = (-0.052 + (f < 2 ? 0.001 : 0)) * s;
      const fx = (-0.020 + f * 0.0135) * s * sx;
      out.push(
        makeBoneBoundPart(
          new THREE.CapsuleGeometry(0.0085 * s, 0.024 * s, 2, 6),
          handMat,
          hIdx,
          skeleton,
          new THREE.Vector3(fx, fy, 0.014 * s),
          new THREE.Euler(0.65, 0, 0),
        ),
      );
    }
    // Opposing curled thumb on inner side of fist
    out.push(
      makeBoneBoundPart(
        new THREE.CapsuleGeometry(0.0095 * s, 0.026 * s, 2, 6),
        handMat,
        hIdx,
        skeleton,
        new THREE.Vector3(-sx * 0.028 * s, -0.025 * s, 0.025 * s),
        new THREE.Euler(0.4, 0, sx * 0.45),
      ),
    );
  }

  return out;
}

export function buildAnatomicalLegAndBoot(
  isLeft: boolean,
  s: number,
  mus: number,
  pantsMat: THREE.Material,
  bootMat: THREE.Material,
  soleMat: THREE.Material,
  map: Record<string, number>,
  skeleton: THREE.Skeleton,
  upturnedToe = false,
): THREE.SkinnedMesh[] {
  const sx = isLeft ? 1 : -1;
  const xPos = sx * 0.105 * s;
  const thIdx = isLeft ? map.lThigh : map.rThigh;
  const knIdx = isLeft ? map.lKnee : map.rKnee;
  const anIdx = isLeft ? map.lAnkle : map.rAnkle;
  const hipY = 0.88 * s;
  const knY = 0.46 * s;
  const anY = 0.055 * s;

  const bulk = 0.92 + mus * 0.14;
  const legStations: Station[] = [
    { y: hipY, x: xPos, rx: 0.088 * s * bulk, rz: 0.094 * s * bulk, b0: map.Hips, b1: thIdx, w0: 0.42, w1: 0.58 },
    { y: hipY - 0.12 * s, x: xPos, rx: 0.084 * s * bulk, rz: 0.088 * s * bulk, b0: thIdx, b1: knIdx, w0: 0.94, w1: 0.06 },
    { y: hipY - 0.25 * s, x: xPos, rx: 0.074 * s * bulk, rz: 0.078 * s * bulk, b0: thIdx, b1: knIdx, w0: 0.84, w1: 0.16 },
    { y: knY + 0.04 * s, x: xPos, rx: 0.060 * s, rz: 0.064 * s, b0: thIdx, b1: knIdx, w0: 0.52, w1: 0.48 },
    { y: knY - 0.04 * s, x: xPos, rx: 0.058 * s, rz: 0.062 * s, b0: knIdx, b1: anIdx, w0: 0.94, w1: 0.06 },
    { y: knY - 0.14 * s, x: xPos, z: -0.008 * s, rx: 0.064 * s * bulk, rz: 0.072 * s * bulk, b0: knIdx, b1: anIdx, w0: 0.85, w1: 0.15 },
    { y: knY - 0.26 * s, x: xPos, rx: 0.052 * s, rz: 0.056 * s, b0: knIdx, b1: anIdx, w0: 0.65, w1: 0.35 },
    { y: anY + 0.02 * s, x: xPos, rx: 0.042 * s, rz: 0.044 * s, b0: knIdx, b1: anIdx, w0: 0.25, w1: 0.75 },
  ];

  const out: THREE.SkinnedMesh[] = [buildSculptedSkinnedMesh(legStations, 12, pantsMat, skeleton)];

  // Multi-part sculpted Footwear (Heel, Arch, Instep, Toe Box + Sole Welt)
  out.push(
    makeBoneBoundPart(
      new THREE.CylinderGeometry(0.046 * s, 0.048 * s, 0.065 * s, 10),
      bootMat,
      anIdx,
      skeleton,
      new THREE.Vector3(0, 0.015 * s, 0),
    ),
  );
  // Heel block
  out.push(
    makeBoneBoundPart(
      new THREE.BoxGeometry(0.088 * s, 0.046 * s, 0.088 * s),
      soleMat,
      anIdx,
      skeleton,
      new THREE.Vector3(0, -0.028 * s, -0.015 * s),
    ),
  );
  // Sculpted tapered forefoot + toe cap
  out.push(
    makeBoneBoundPart(
      new THREE.CylinderGeometry(0.040 * s, 0.052 * s, 0.135 * s, 10),
      bootMat,
      anIdx,
      skeleton,
      new THREE.Vector3(0, -0.024 * s, 0.062 * s),
      new THREE.Euler(Math.PI / 2 - (upturnedToe ? 0.16 : 0.02), 0, 0),
    ),
  );
  // Outsole platform under forefoot
  out.push(
    makeBoneBoundPart(
      new THREE.BoxGeometry(0.092 * s, 0.018 * s, 0.19 * s),
      soleMat,
      anIdx,
      skeleton,
      new THREE.Vector3(0, -0.046 * s, 0.038 * s),
    ),
  );

  return out;
}

/**
 * Conforming sculpted jawline beard built directly around Lower Head stations (no awkward box!).
 */
export function buildConformingBeard(
  s: number,
  lengthDrop: number,
  pointiness: number,
  mat: THREE.Material,
  headBone: number,
  skeleton: THREE.Skeleton,
): THREE.SkinnedMesh[] {
  const hTotal = (0.088 + lengthDrop) * s;
  const beardGeo = new THREE.CylinderGeometry(0.100 * s, 0.044 * s * (1 - pointiness * 0.35), hTotal, 18, 4, false, -Math.PI * 0.44, Math.PI * 0.88);
  const pos = beardGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const yNorm = clamp01(1 - (y + hTotal * 0.5) / hTotal);
    const frontPinch = gauss(x, 0, 0.042 * s);
    pos.setZ(i, z + frontPinch * yNorm * 0.026 * s);
    pos.setX(i, x * (1 - yNorm * pointiness * 0.38));
  }
  beardGeo.computeVertexNormals();
  beardGeo.normalizeNormals();

  // Tapered mustache curving subtly along upper lip
  const stacheGeo = new THREE.CapsuleGeometry(0.008 * s, 0.056 * s, 4, 10);
  stacheGeo.rotateZ(Math.PI / 2);

  return [
    makeBoneBoundPart(beardGeo, mat, headBone, skeleton, new THREE.Vector3(0, (0.052 - lengthDrop * 0.42) * s, 0.022 * s)),
    makeBoneBoundPart(stacheGeo, mat, headBone, skeleton, new THREE.Vector3(0, 0.086 * s, 0.112 * s), new THREE.Euler(-0.15, 0, 0)),
  ];
}

/**
 * Sculpted swept 3D hair crown + optional trailing locks (e.g., Thor flowing blonde hair, Michael pompadour).
 */
export function buildSculptedHairCrown(
  s: number,
  style: 'pompadour' | 'norse-long',
  mat: THREE.Material,
  headBone: number,
  skeleton: THREE.Skeleton,
): THREE.SkinnedMesh[] {
  const out: THREE.SkinnedMesh[] = [];
  // Top & back hair cap hugging skull cleanly (tapered lower brim so zero lip jut!)
  const capGeo = new THREE.SphereGeometry(0.114 * s, 22, 16, 0, Math.PI * 2, 0, Math.PI * 0.54);
  const capPos = capGeo.attributes.position;
  for (let i = 0; i < capPos.count; i++) {
    let x = capPos.getX(i);
    let y = capPos.getY(i);
    let z = capPos.getZ(i);
    z *= 1.09;
    if (z > 0.02 * s && y > 0.02 * s) {
      y += (style === 'pompadour' ? 0.022 : 0.015) * s * gauss(x, 0, 0.055 * s);
      z += (style === 'pompadour' ? 0.012 : 0.006) * s;
    }
    // Snugly hug lower rim into cranial temple curve
    const rimBlend = clamp01((0.028 * s - y) / (0.032 * s));
    x *= 1 - rimBlend * 0.07;
    z *= 1 - rimBlend * 0.06;
    capPos.setXYZ(i, x, y, z);
  }
  capGeo.computeVertexNormals();
  capGeo.normalizeNormals();
  out.push(makeBoneBoundPart(capGeo, mat, headBone, skeleton, new THREE.Vector3(0, 0.168 * s, -0.008 * s)));

  if (style === 'norse-long') {
    // 7 flowing sculpted locks cascading smoothly down neck onto back & upper collarbones
    for (let k = -3; k <= 3; k++) {
      const ang = k * 0.36;
      const sx = Math.sin(ang) * 0.095 * s;
      const sz = -Math.cos(ang) * 0.098 * s - 0.012 * s;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(sx * 0.85, 0.21 * s, sz * 0.85),
        new THREE.Vector3(sx * 1.15, 0.10 * s, sz * 1.15 - 0.015 * s),
        new THREE.Vector3(sx * 1.32, -0.04 * s, sz * 1.25 - 0.035 * s),
        new THREE.Vector3(sx * 1.42, -0.13 * s, sz * 1.1 - 0.045 * s),
      ]);
      const lockGeo = new THREE.TubeGeometry(curve, 12, (0.024 - Math.abs(k) * 0.002) * s, 8, false);
      lockGeo.normalizeNormals();
      out.push(makeBoneBoundPart(lockGeo, mat, headBone, skeleton, new THREE.Vector3(0, 0, 0)));
    }
  } else {
    // Clean sculpted sideburns for Michael
    for (const sx of [-1, 1]) {
      out.push(
        makeBoneBoundPart(
          new THREE.BoxGeometry(0.016 * s, 0.060 * s, 0.032 * s),
          mat,
          headBone,
          skeleton,
          new THREE.Vector3(sx * 0.099 * s, 0.145 * s, 0.014 * s),
        ),
      );
    }
  }
  return out;
}

/**
 * Draped pleated wave cloak hanging cleanly from CapeTail (Thor, Wukong, Kratos mantle).
 */
export function buildPleatedCape(
  widthTop: number,
  widthBot: number,
  length: number,
  waves: number,
  mat: THREE.Material,
  boneIdx: number,
  skeleton: THREE.Skeleton,
  offset = new THREE.Vector3(0, 0, -0.02),
  rot = new THREE.Euler(0.14, 0, 0),
): THREE.SkinnedMesh {
  const geo = new THREE.PlaneGeometry(1, length, 16, 12);
  geo.translate(0, -length * 0.5, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const ux = pos.getX(i); // -0.5 .. 0.5
    const y = pos.getY(i); // 0 .. -length
    const t = clamp01(-y / length);
    const w = widthTop + (widthBot - widthTop) * t;
    pos.setX(i, ux * w);
    const fold = Math.sin(ux * Math.PI * waves * 2) * (0.016 + 0.038 * t);
    const billow = -Math.sin(t * Math.PI * 0.85) * 0.065;
    pos.setZ(i, fold + billow);
  }
  geo.computeVertexNormals();
  return makeBoneBoundPart(geo, mat, boneIdx, skeleton, offset, rot);
}

/**
 * Builds curved Spider-Man eye lenses or Aviator glasses contoured seamlessly onto front skull curve!
 */
export function buildCurvedVisorOrLens(
  points: [number, number][],
  depth: number,
  curveRadius: number,
  mat: THREE.Material,
  headBone: number,
  skeleton: THREE.Skeleton,
  offset: THREE.Vector3,
  rot = new THREE.Euler(),
): THREE.SkinnedMesh {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    curveSegments: 8,
    bevelEnabled: true,
    bevelThickness: depth * 0.35,
    bevelSize: depth * 0.25,
    bevelSegments: 2,
  });
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    // Curve outer edges gently backward to hug orbital curvature cleanly
    const wrapZ = -(x * x) / (2 * Math.max(0.05, curveRadius));
    pos.setZ(i, pos.getZ(i) + wrapZ);
  }
  geo.computeVertexNormals();
  return makeBoneBoundPart(geo, mat, headBone, skeleton, offset, rot);
}

/**
 * Stepped voxel geometry builder for Final Boss Steve (preserves authentic blocky Minecraft identity!).
 */
export function buildVoxelSwordGeometry(): { bladeGeo: THREE.BufferGeometry; guardGeo: THREE.BufferGeometry; hiltGeo: THREE.BufferGeometry } {
  const mergeBoxes = (boxes: [number, number, number, number, number, number][]): THREE.BufferGeometry => {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    let vOff = 0;
    for (const [cx, cy, cz, sx, sy, sz] of boxes) {
      const b = new THREE.BoxGeometry(sx, sy, sz);
      b.translate(cx, cy, cz);
      const p = b.attributes.position;
      const n = b.attributes.normal;
      const uv = b.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        positions.push(p.getX(i), p.getY(i), p.getZ(i));
        normals.push(n.getX(i), n.getY(i), n.getZ(i));
        uvs.push(uv.getX(i), uv.getY(i));
      }
      const idx = b.index!;
      for (let i = 0; i < idx.count; i++) indices.push(idx.getX(i) + vOff);
      vOff += p.count;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(indices);
    return g;
  };

  // Authentic Minecraft stepped pixel diagonal sword pointing along +Z (and tilted +Y slight hero angle)
  const px = 0.032;
  const hiltBoxes: [number, number, number, number, number, number][] = [
    [0, -0.015, 0.02, px * 1.4, px * 1.4, px * 2.8],
    [0, -0.022, -0.03, px * 1.6, px * 1.6, px * 1.2],
  ];
  const guardBoxes: [number, number, number, number, number, number][] = [
    [0, 0.01, 0.085, px * 1.5, px * 5.2, px * 1.4],
    [0, 0.075, 0.065, px * 1.5, px * 1.4, px * 1.4],
    [0, -0.055, 0.065, px * 1.5, px * 1.4, px * 1.4],
  ];
  // Stepped crisp pixel blade blocks along +Z
  const bladeBoxes: [number, number, number, number, number, number][] = [];
  for (let i = 0; i < 11; i++) {
    const z = 0.125 + i * px * 1.05;
    const widthSteps = i === 10 ? 0.9 : i === 9 ? 1.5 : 2.1;
    bladeBoxes.push([0, 0.01 + i * 0.004, z, px * 0.92, px * widthSteps, px * 1.35]);
  }

  return {
    hiltGeo: mergeBoxes(hiltBoxes),
    guardGeo: mergeBoxes(guardBoxes),
    bladeGeo: mergeBoxes(bladeBoxes),
  };
}

/**
 * Merges single-material SkinnedMesh children by material while preserving every vertex's exact
 * bone skinIndex and skinWeight. Cuts WebGL draw calls ~4-5x without changing silhouette or rigging.
 */
export function optimizeCharacterMeshes(root: THREE.Group, skeleton: THREE.Skeleton): void {
  const byMat = new Map<string, { mat: THREE.Material; meshes: THREE.SkinnedMesh[] }>();
  for (const child of [...root.children]) {
    const sm = child as THREE.SkinnedMesh;
    if (!sm.isSkinnedMesh || Array.isArray(sm.material)) continue;
    const mat = sm.material;
    let bucket = byMat.get(mat.uuid);
    if (!bucket) {
      bucket = { mat, meshes: [] };
      byMat.set(mat.uuid, bucket);
    }
    bucket.meshes.push(sm);
  }

  for (const { mat, meshes } of byMat.values()) {
    if (meshes.length <= 1) continue;
    const geos: THREE.BufferGeometry[] = [];
    for (const sm of meshes) {
      root.remove(sm);
      const raw = sm.geometry;
      // Ensure uniform attributes (position, normal, uv, skinIndex, skinWeight) and indexed/non-indexed match
      const g = raw.index ? raw.toNonIndexed() : raw.clone();
      for (const attr of Object.keys(g.attributes)) {
        if (attr !== 'position' && attr !== 'normal' && attr !== 'uv' && attr !== 'skinIndex' && attr !== 'skinWeight') {
          g.deleteAttribute(attr);
        }
      }
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) {
        const uvArr = new Float32Array(g.attributes.position.count * 2);
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uvArr, 2));
      }
      geos.push(g);
    }
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const combined = new THREE.SkinnedMesh(merged, mat);
    combined.castShadow = true;
    combined.receiveShadow = true;
    combined.bind(skeleton);
    root.add(combined);
  }
}
