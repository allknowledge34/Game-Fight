import * as THREE from 'three';
import type { FighterId, FighterSnapshot, MoveId } from '../src/core/types';
import { BASE_MOVES, moveTotalFrames } from '../src/combat/moves';
import { solveFighterPose, type FighterPose } from '../src/animation/PoseSolver';

interface BoneClipTarget {
  bone: string;
  readEuler: (pose: FighterPose, tNorm: number, id: FighterId) => [number, number, number];
}

const BONE_EULERS: BoneClipTarget[] = [
  { bone: 'Hips', readEuler: (p) => [p.hipsF, p.hipsT, 0] },
  { bone: 'Spine', readEuler: (p) => [p.spineF * 0.45, p.spineT * 0.45, p.spineS * 0.45] },
  { bone: 'Chest', readEuler: (p) => [p.spineF * 0.55, p.spineT * 0.55, p.spineS * 0.55] },
  { bone: 'Neck', readEuler: (p) => [p.headF * 0.35, p.headT * 0.35, 0] },
  { bone: 'Head', readEuler: (p) => [p.headF * 0.65, p.headT * 0.65, 0] },
  { bone: 'lShoulder', readEuler: (p) => [-p.lShF, 0, p.lShO] },
  { bone: 'lElbow', readEuler: (p) => [-p.lEl, 0, 0] },
  { bone: 'rShoulder', readEuler: (p) => [-p.rShF, 0, -p.rShO] },
  { bone: 'rElbow', readEuler: (p) => [-p.rEl, 0, 0] },
  { bone: 'lThigh', readEuler: (p) => [p.lThF, 0, p.lThO] },
  { bone: 'lKnee', readEuler: (p) => [p.lKn, 0, 0] },
  { bone: 'lAnkle', readEuler: (p) => [p.lAnk, 0, 0] },
  { bone: 'rThigh', readEuler: (p) => [p.rThF, 0, -p.rThO] },
  { bone: 'rKnee', readEuler: (p) => [p.rKn, 0, 0] },
  { bone: 'rAnkle', readEuler: (p) => [p.rAnk, 0, 0] },
  {
    bone: 'CapeTail',
    readEuler: (p, tNorm, id) => {
      const sway = Math.sin(tNorm * Math.PI * 2) * (id === 'thor' || id === 'wukong' ? 0.16 : 0.08);
      return [0.14 + Math.max(0, p.spineF * 0.35) + sway * 0.5, 0, sway];
    },
  },
];

function applyCharacterStanceTint(id: FighterId, clipName: string, p: FighterPose): FighterPose {
  if (clipName === 'idle') {
    if (id === 'spiderman') {
      return { ...p, rootY: p.rootY - 0.14, lKn: 0.68, rKn: 0.68, lThF: -0.45, rThF: 0.42, spineF: 0.24, rShF: 1.05, lShF: 0.75 };
    }
    if (id === 'wukong') {
      return { ...p, rootY: p.rootY - 0.04, spineT: 0.24, rShF: 1.05, rEl: 1.25, lShF: 0.55, lEl: 1.6 };
    }
    if (id === 'kratos') {
      return { ...p, rootY: p.rootY - 0.05, lShO: 0.36, rShO: 0.34, lThO: 0.24, rThO: 0.24, spineF: 0.12 };
    }
    if (id === 'ironman') {
      return { ...p, rootY: p.rootY + 0.08, lKn: 0.14, rKn: 0.18, rShF: 1.02, rEl: 1.35 };
    }
    if (id === 'thor') {
      return { ...p, rShF: 0.92, rShO: 0.42, rEl: 1.25, lShF: 0.6 };
    }
    if (id === 'steve') {
      return { ...p, lShO: 0.14, rShO: 0.18, rShF: 0.95, rEl: 0.65, lKn: 0.18, rKn: 0.18 };
    }
  }
  return p;
}

function makeDummySnapshot(id: FighterId, clipName: string, tNorm: number): FighterSnapshot {
  const base: FighterSnapshot = {
    side: 0,
    id,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    facing: 1,
    grounded: clipName !== 'jump' && clipName !== 'airPunch' && clipName !== 'airKick',
    hp: 100,
    maxHp: 100,
    meter: 0,
    state: 'idle',
    stateFrames: Math.floor(tNorm * 30),
    hitstunFrames: 0,
    blockstunFrames: 0,
    downFrames: 0,
    comboCount: 0,
    isBlocking: false,
    invincibleFrames: 0,
    isBoss: id === 'steve',
    attack: null,
  };

  if (clipName in BASE_MOVES && clipName !== 'landing') {
    const moveId = clipName as MoveId;
    const total = Math.max(1, moveTotalFrames(BASE_MOVES[moveId]));
    base.state = 'attack';
    base.attack = { moveId, frame: Math.floor(tNorm * total), hasHit: false };
    return base;
  }

  switch (clipName) {
    case 'walkFwd':
      base.state = 'walkFwd';
      base.stateFrames = Math.floor(tNorm * 24);
      break;
    case 'walkBack':
      base.state = 'walkBack';
      base.stateFrames = Math.floor(tNorm * 24);
      break;
    case 'crouch':
      base.state = 'crouch';
      break;
    case 'jump':
      base.state = 'jump';
      base.vy = 5 - tNorm * 10;
      break;
    case 'intro':
      base.state = 'intro';
      break;
    case 'victory':
      base.state = 'victory';
      break;
    case 'hitstun':
      base.state = 'hitstun';
      base.hitstunFrames = 14;
      break;
    case 'blockstun':
      base.state = 'blockstun';
      base.isBlocking = true;
      break;
    case 'knockdown':
      base.state = 'knockdown';
      base.downFrames = Math.floor(tNorm * 40);
      break;
    case 'getup':
      base.state = 'getup';
      base.stateFrames = Math.floor(tNorm * 18);
      break;
    case 'ko':
      base.state = 'ko';
      break;
    case 'super':
      base.state = 'super';
      base.stateFrames = Math.floor(tNorm * 90);
      break;
    case 'frozen':
      base.state = 'frozen';
      break;
    default:
      base.state = 'idle';
  }
  return base;
}

const CLIP_LIST: { name: string; duration: number; samples: number }[] = [
  { name: 'idle', duration: 1.5, samples: 16 },
  { name: 'intro', duration: 1.5, samples: 16 },
  { name: 'walkFwd', duration: 0.68, samples: 14 },
  { name: 'walkBack', duration: 0.68, samples: 14 },
  { name: 'crouch', duration: 0.4, samples: 6 },
  { name: 'jump', duration: 0.7, samples: 12 },
  { name: 'landing', duration: 0.25, samples: 6 },
  { name: 'hitstun', duration: 0.35, samples: 8 },
  { name: 'blockstun', duration: 0.3, samples: 6 },
  { name: 'knockdown', duration: 0.7, samples: 10 },
  { name: 'getup', duration: 0.35, samples: 8 },
  { name: 'ko', duration: 0.9, samples: 10 },
  { name: 'victory', duration: 1.6, samples: 16 },
  { name: 'frozen', duration: 0.5, samples: 6 },
  { name: 'super', duration: 2.0, samples: 24 },
  ...(['jab', 'cross', 'kick', 'uppercut', 'roundhouse', 'finisher', 'lowJab', 'sweep', 'special1', 'special2', 'airPunch', 'airKick', 'grab'] as MoveId[]).map((m) => ({
    name: m,
    duration: Math.max(0.25, moveTotalFrames(BASE_MOVES[m]) / 60),
    samples: 14,
  })),
];

export function buildCharacterAnimationClips(id: FighterId, baseHipsY: number): THREE.AnimationClip[] {
  const euler = new THREE.Euler(0, 0, 0, 'XYZ');
  const quat = new THREE.Quaternion();

  return CLIP_LIST.map(({ name, duration, samples }) => {
    const times: number[] = [];
    const hipsPos: number[] = [];
    const rotMaps = new Map<string, number[]>();
    for (const target of BONE_EULERS) rotMaps.set(target.bone, []);

    for (let i = 0; i <= samples; i++) {
      const tNorm = i / samples;
      times.push(Number((tNorm * duration).toFixed(4)));
      const snap = makeDummySnapshot(id, name, tNorm);
      let pose = solveFighterPose(snap, tNorm * duration);
      pose = applyCharacterStanceTint(id, name, pose);
      hipsPos.push(0, baseHipsY + pose.rootY, 0);

      for (const target of BONE_EULERS) {
        const [rx, ry, rz] = target.readEuler(pose, tNorm, id);
        euler.set(rx, ry, rz, 'XYZ');
        quat.setFromEuler(euler);
        const arr = rotMaps.get(target.bone)!;
        arr.push(
          Number(quat.x.toFixed(5)),
          Number(quat.y.toFixed(5)),
          Number(quat.z.toFixed(5)),
          Number(quat.w.toFixed(5)),
        );
      }
    }

    const tracks: THREE.KeyframeTrack[] = [
      new THREE.VectorKeyframeTrack('Hips.position', times, hipsPos),
      ...BONE_EULERS.map(
        (target) => new THREE.QuaternionKeyframeTrack(`${target.bone}.quaternion`, times, rotMaps.get(target.bone)!),
      ),
    ];
    return new THREE.AnimationClip(name, duration, tracks);
  });
}
