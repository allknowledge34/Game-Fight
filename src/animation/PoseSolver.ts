import { clamp } from '../core/prng';
import type { FighterSnapshot, MoveId } from '../core/types';
import { BASE_MOVES, moveTotalFrames } from '../combat/moves';

export interface FighterPose {
  rootY: number;
  hipsF: number;
  hipsT: number;
  spineF: number;
  spineT: number;
  spineS: number;
  headF: number;
  headT: number;
  lShF: number;
  lShO: number;
  lEl: number;
  rShF: number;
  rShO: number;
  rEl: number;
  lThF: number;
  lThO: number;
  lKn: number;
  lAnk: number;
  rThF: number;
  rThO: number;
  rKn: number;
  rAnk: number;
}

export function basePose(): FighterPose {
  return {
    rootY: 0,
    hipsF: 0,
    hipsT: 0,
    spineF: 0.04,
    spineT: 0.12,
    spineS: 0,
    headF: -0.04,
    headT: -0.1,
    lShF: 0.65,
    lShO: 0.22,
    lEl: 1.45,
    rShF: 0.85,
    rShO: 0.25,
    rEl: 1.55,
    lThF: -0.15,
    lThO: 0.14,
    lKn: 0.26,
    lAnk: 0,
    rThF: 0.18,
    rThO: 0.14,
    rKn: 0.24,
    rAnk: 0,
  };
}

export function blendPose(a: FighterPose, b: Partial<FighterPose>, t: number): FighterPose {
  const k = clamp(t, 0, 1);
  const out = { ...a };
  for (const key of Object.keys(b) as (keyof FighterPose)[]) {
    const bv = b[key];
    if (typeof bv === 'number') {
      out[key] = a[key] + (bv - a[key]) * k;
    }
  }
  return out;
}

export function solveFighterPose(f: FighterSnapshot, clock: number): FighterPose {
  const t = clock;
  const st = basePose();
  const breath = Math.sin(t * 4.2);

  switch (f.state) {
    case 'intro': {
      const wave = Math.sin(t * 5);
      if (f.id === 'wukong') {
        return blendPose(st, {
          rootY: Math.abs(Math.sin(t * 6)) * 0.05,
          hipsT: wave * 0.28,
          spineS: wave * 0.15,
          lShF: 1.1 + wave * 0.35,
          rShF: 1.1 - wave * 0.35,
          lEl: 1.1,
          rEl: 1.1,
        }, 1);
      }
      if (f.id === 'kratos' || f.id === 'thor') {
        return blendPose(st, {
          rootY: breath * 0.015,
          lShF: 0.95 + wave * 0.08,
          lShO: 0.55,
          lEl: 0.65,
          rShF: 1.15 - wave * 0.08,
          rShO: 0.55,
          rEl: 0.55,
          headF: -0.06,
        }, 1);
      }
      if (f.id === 'steve') {
        return blendPose(st, {
          rootY: Math.abs(Math.sin(t * 4)) * 0.03,
          rShF: 1.2 + Math.sin(t * 3) * 0.15,
          rEl: 0.45,
          lShF: 0.85,
          lEl: 0.5,
          spineT: Math.sin(t * 2) * 0.1,
        }, 1);
      }
      return blendPose(st, {
        rootY: breath * 0.015,
        rShF: 0.85 + wave * 0.08,
        rShO: 0.25,
        rEl: 1.45,
        lShF: 0.75 - wave * 0.06,
        lShO: 0.22,
        lEl: 1.4,
        headF: -0.05,
      }, 1);
    }

    case 'idle': {
      return blendPose(st, {
        rootY: breath * 0.02,
        spineF: 0.05 + breath * 0.02,
        lShF: f.isBlocking ? 1.45 : 0.68 + breath * 0.06,
        rShF: f.isBlocking ? 1.55 : 0.88 - breath * 0.06,
        lEl: f.isBlocking ? 1.9 : 1.45,
        rEl: f.isBlocking ? 1.9 : 1.55,
      }, 1);
    }

    case 'walkFwd':
    case 'walkBack': {
      const dir = f.state === 'walkFwd' ? 1 : -1;
      const ph = t * 9 * dir;
      const s = Math.sin(ph);
      const c = Math.cos(ph);
      return blendPose(st, {
        rootY: Math.abs(c) * 0.045 - 0.02,
        spineF: 0.1 * dir,
        lThF: s * 0.52,
        lKn: Math.max(0.15, -c * 0.65 + 0.35),
        rThF: -s * 0.52,
        rKn: Math.max(0.15, c * 0.65 + 0.35),
        lShF: 0.7 - s * 0.35,
        rShF: 0.75 + s * 0.35,
        lEl: f.isBlocking ? 1.85 : 1.35,
        rEl: f.isBlocking ? 1.85 : 1.35,
      }, 1);
    }

    case 'crouch': {
      return blendPose(st, {
        rootY: -0.42,
        hipsF: 0.4,
        spineF: 0.22,
        headF: -0.25,
        lThF: -0.95,
        lKn: 1.75,
        lAnk: -0.5,
        rThF: -0.75,
        rKn: 1.55,
        rAnk: -0.45,
        lShF: f.isBlocking ? 1.35 : 0.65,
        rShF: f.isBlocking ? 1.45 : 0.75,
        lEl: 1.75,
        rEl: 1.75,
      }, 1);
    }

    case 'jump': {
      if (f.attack) {
        return solveAttackPose(st, f.attack.moveId, f.attack.frame);
      }
      return blendPose(st, {
        rootY: 0.08,
        spineF: 0.16,
        lThF: -0.65,
        lKn: 1.15,
        rThF: -0.35,
        rKn: 0.85,
        lShF: 1.25,
        lShO: 0.5,
        rShF: 1.45,
        rShO: 0.45,
        lEl: 1.1,
        rEl: 1.1,
      }, 1);
    }

    case 'attack': {
      if (!f.attack) return st;
      return solveAttackPose(st, f.attack.moveId, f.attack.frame);
    }

    case 'blockstun': {
      return blendPose(st, {
        rootY: f.y <= 0 && f.isBlocking ? -0.08 : 0,
        spineF: -0.18,
        headF: 0.18,
        lShF: 1.55,
        lShO: -0.1,
        lEl: 1.95,
        rShF: 1.65,
        rShO: -0.1,
        rEl: 1.95,
      }, 1);
    }

    case 'hitstun': {
      return blendPose(st, {
        rootY: -0.06,
        spineF: -0.38,
        spineT: -0.22,
        headF: -0.45,
        lShF: 0.35,
        lShO: 0.65,
        lEl: 0.7,
        rShF: 0.45,
        rShO: 0.65,
        rEl: 0.7,
        lKn: 0.4,
        rKn: 0.4,
      }, 1);
    }

    case 'knockdown':
    case 'ko': {
      const k = clamp(f.stateFrames / 16, 0, 1);
      return blendPose(st, {
        rootY: -0.78 * k,
        hipsF: -1.48 * k,
        spineF: -0.1 * k,
        headF: 0.25 * k,
        lShF: 0.2 * k,
        lShO: 0.75 * k,
        lEl: 0.35,
        rShF: 0.2 * k,
        rShO: 0.75 * k,
        rEl: 0.35,
        lThF: 0.08,
        rThF: -0.05,
        lKn: 0.15,
        rKn: 0.12,
      }, k);
    }

    case 'getup': {
      const k = clamp(f.stateFrames / 24, 0, 1);
      return blendPose(
        {
          ...st,
          rootY: -0.72,
          hipsF: -1.35,
          lShO: 0.7,
          rShO: 0.7,
        },
        st,
        k,
      );
    }

    case 'victory': {
      const bounce = Math.abs(Math.sin(t * 7)) * 0.08;
      return blendPose(st, {
        rootY: bounce,
        spineS: Math.sin(t * 3.5) * 0.12,
        hipsT: Math.sin(t * 3.5) * 0.25,
        lShF: 2.3 + Math.sin(t * 7) * 0.35,
        lShO: 0.55,
        lEl: 0.4,
        rShF: 2.3 - Math.sin(t * 7) * 0.35,
        rShO: 0.55,
        rEl: 0.4,
      }, 1);
    }

    case 'super': {
      return blendPose(st, {
        rootY: 0.05,
        spineF: -0.15,
        headF: -0.25,
        lShF: 1.9 + Math.sin(t * 14) * 0.25,
        lShO: 0.6,
        rShF: 1.9 - Math.sin(t * 14) * 0.25,
        rShO: 0.6,
        lEl: 0.4,
        rEl: 0.4,
      }, 1);
    }

    case 'frozen': {
      return blendPose(st, {
        spineF: -0.18,
        headF: -0.35,
        lShF: 1.1 + Math.sin(t * 28) * 0.14,
        lShO: 0.55,
        rShF: 1.1 - Math.sin(t * 28) * 0.14,
        rShO: 0.55,
      }, 1);
    }
  }
}

function solveAttackPose(st: FighterPose, moveId: MoveId, frame: number): FighterPose {
  const def = BASE_MOVES[moveId];
  const total = Math.max(1, moveTotalFrames(def));
  const hitPhase =
    frame < def.startup
      ? clamp(frame / Math.max(1, def.startup), 0, 1) * 0.5
      : frame <= def.startup + def.active
        ? 1.0
        : clamp(1 - (frame - def.startup - def.active) / Math.max(1, total - def.startup - def.active), 0, 1);

  switch (moveId) {
    case 'jab':
      return blendPose(st, { spineT: 0.42, rShF: 1.58, rEl: 0.1, lShF: 0.7, lEl: 1.7 }, hitPhase);
    case 'cross':
    case 'special1':
      return blendPose(st, {
        rootY: -0.05,
        spineT: -0.45,
        spineF: 0.2,
        lShF: 1.65,
        lEl: 0.08,
        rShF: 0.45,
        rEl: 1.75,
        lThF: -0.3,
        lKn: 0.55,
      }, hitPhase);
    case 'uppercut':
      return blendPose(st, {
        rootY: 0.05,
        spineF: -0.15,
        spineT: 0.48,
        rShF: 2.65,
        rEl: 0.2,
        lThF: -0.35,
        lKn: 0.55,
      }, hitPhase);
    case 'kick':
    case 'special2':
      return blendPose(st, {
        spineF: -0.22,
        hipsT: -0.35,
        rThF: -1.45,
        rKn: 0.12,
        lKn: 0.2,
        lShF: 0.9,
        rShF: 0.35,
      }, hitPhase);
    case 'roundhouse':
    case 'finisher':
      return blendPose(st, {
        spineF: -0.28,
        hipsT: 0.75,
        spineT: 0.55,
        rThF: -1.65,
        rThO: 0.65,
        rKn: 0.1,
        lShO: 0.85,
        rShO: 0.85,
      }, hitPhase);
    case 'lowJab':
      return blendPose(st, {
        rootY: -0.42,
        hipsF: 0.42,
        spineF: 0.3,
        spineT: 0.38,
        rShF: 1.48,
        rEl: 0.1,
        lThF: -0.95,
        lKn: 1.7,
        rThF: -0.75,
        rKn: 1.55,
      }, hitPhase);
    case 'sweep':
      return blendPose(st, {
        rootY: -0.52,
        hipsF: 0.35,
        hipsT: 0.62,
        spineF: -0.2,
        rThF: -1.35,
        rKn: 0.08,
        lThF: -0.95,
        lKn: 1.78,
      }, hitPhase);
    case 'airPunch':
      return blendPose(st, { spineT: 0.45, rShF: 1.65, rEl: 0.1, lThF: -0.6, lKn: 1.2 }, hitPhase);
    case 'airKick':
      return blendPose(st, { spineF: -0.28, rThF: -1.42, rKn: 0.1, lThF: -0.55, lKn: 1.15 }, hitPhase);
    case 'grab':
      return blendPose(st, {
        rootY: -0.06,
        spineF: 0.25,
        lShF: 1.35,
        lShO: 0.12,
        lEl: 0.35,
        rShF: 1.35,
        rShO: 0.12,
        rEl: 0.35,
      }, hitPhase);
    case 'landing':
      return blendPose(st, {
        rootY: -0.28,
        hipsF: 0.35,
        spineF: 0.22,
        lThF: -0.65,
        lKn: 1.25,
        rThF: -0.55,
        rKn: 1.15,
      }, 0.7);
  }
}
