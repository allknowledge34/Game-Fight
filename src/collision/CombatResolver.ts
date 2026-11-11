import { BASE_MOVES, getMoveReach } from '../combat/moves';
import type { MoveDefinition, MoveId } from '../core/types';
import { ARENA_HALF_WIDTH, CHIP_MUL, COUNTER_MUL, FighterController, PUSH_MIN_DIST } from '../physics/FighterController';

const HURTBOX_RADII = { legs: 0.2, torso: 0.26, head: 0.16 } as const;
const COMBO_SCALING = [1, 0.9, 0.78, 0.66, 0.54, 0.44] as const;
const COMBO_SCALING_FLOOR = 0.35;

export interface StrikeResolution {
  attacker: FighterController;
  defender: FighterController;
  moveId: MoveId;
  blocked: boolean;
  grab?: 'connect' | 'break';
  damage: number;
  knockdown: boolean;
  ko: boolean;
  counter?: boolean;
  x: number;
  y: number;
}

export function getComboScale(comboHits: number): number {
  return COMBO_SCALING[comboHits] ?? COMBO_SCALING_FLOOR;
}

function getHurtboxRadiusAtHeight(defender: FighterController, relHeight: number): number | null {
  const totalH = defender.hurtboxHeight;
  if (relHeight < -0.1 || relHeight > totalH + 0.1) return null;
  const ratio = relHeight / totalH;
  if (ratio < 0.48) return HURTBOX_RADII.legs;
  if (ratio < 0.8) return HURTBOX_RADII.torso;
  return HURTBOX_RADII.head;
}

export function checkStrikeOverlap(
  attacker: FighterController,
  defender: FighterController,
): { x: number; y: number } | null {
  const atk = attacker.attack;
  if (!atk) return null;
  const def = BASE_MOVES[atk.moveId];
  const dx = (defender.x - attacker.x) * attacker.facing;
  if (dx < -0.15) return null;

  if (atk.moveId === 'grab') {
    return dx <= 1.05 ? { x: defender.x - attacker.facing * HURTBOX_RADII.torso, y: 1.2 } : null;
  }

  const totalH = defender.hurtboxHeight;
  const relY = def.airborne
    ? attacker.y + def.hitY - defender.y
    : defender.y > 0.25
      ? def.hitY - defender.y
      : Math.min(def.hitY, totalH * 0.6);

  const r = getHurtboxRadiusAtHeight(defender, relY);
  if (r === null) return null;

  const reach = getMoveReach(attacker.profile.id, def.id);
  if (dx - r > reach + 0.1) return null;

  return {
    x: defender.x - attacker.facing * Math.max(0, r - 0.05),
    y: defender.y + Math.min(Math.max(relY, 0.2), totalH - 0.1),
  };
}

export function canDeliverStrike(attacker: FighterController, defender: FighterController): boolean {
  const atk = attacker.attack;
  if (!atk || atk.hasHit || !attacker.isAttackActive || defender.invulnerable) return false;
  if (atk.moveId === 'grab' && (defender.state === 'hitstun' || defender.airborne || defender.y > 0.01)) {
    return false;
  }
  const def = BASE_MOVES[atk.moveId];
  if ((defender.y > 0.25 && def.guardHeight === 'low') || (defender.isLow && def.guardHeight === 'high')) {
    return false;
  }
  return checkStrikeOverlap(attacker, defender) !== null;
}

export function isAttackBlocked(defender: FighterController, def: MoveDefinition): boolean {
  if (!defender.canBlock || !defender.holdingBack || defender.airborne) return false;
  if (defender.crouching) return def.guardHeight === 'low';
  return def.guardHeight === 'high' || def.guardHeight === 'mid';
}

export function computeScaledDamage(attacker: FighterController, defender: FighterController, baseDamage: number): number {
  const bossDefenseMul = defender.isBoss ? 0.8 : 1;
  return Math.max(
    1,
    Math.round(baseDamage * attacker.profile.damageMul * attacker.power * getComboScale(defender.comboHits) * bossDefenseMul),
  );
}

function applyCornerPushback(attacker: FighterController, defender: FighterController, push: number): void {
  if (Math.abs(defender.x) >= ARENA_HALF_WIDTH - 0.05) {
    attacker.vx = -attacker.facing * push;
  }
}

export function resolveSingleStrike(
  attacker: FighterController,
  defender: FighterController,
  matchTime: number,
): StrikeResolution | null {
  if (!canDeliverStrike(attacker, defender)) return null;
  const atk = attacker.attack!;
  const def = BASE_MOVES[atk.moveId];
  atk.hasHit = true;

  const hitPt = checkStrikeOverlap(attacker, defender)!;
  const dir = attacker.facing;

  if (atk.moveId === 'grab') {
    const mutualGrab = !!(defender.attack?.moveId === 'grab' && defender.attackPhase !== 'recovery');
    if (defender.buffer?.button === 'grab' || mutualGrab) {
      for (const [f, recoilDir] of [
        [attacker, -dir] as const,
        [defender, dir] as const,
      ]) {
        f.attack = null;
        f.buffer = null;
        f.forceState('blockstun');
        f.stun = 14;
        f.vx = recoilDir * 2.6;
      }
      return {
        attacker,
        defender,
        moveId: 'grab',
        blocked: true,
        grab: 'break',
        damage: 0,
        knockdown: false,
        ko: false,
        x: (attacker.x + defender.x) / 2,
        y: 1.2,
      };
    }

    return {
      attacker,
      defender,
      moveId: 'grab',
      blocked: false,
      grab: 'connect',
      damage: 0,
      knockdown: false,
      ko: false,
      x: hitPt.x,
      y: 1.2,
    };
  }

  if (isAttackBlocked(defender, def)) {
    const chip = Math.min(
      Math.round(def.damage * attacker.profile.damageMul * CHIP_MUL),
      Math.max(0, Math.ceil(defender.hp) - 1),
    );
    if (chip > 0) defender.hp -= chip;
    defender.applyBlock(def, dir);
    attacker.addMeter(2);
    defender.addMeter(3);
    applyCornerPushback(attacker, defender, def.pushback * 0.6);

    return {
      attacker,
      defender,
      moveId: def.id,
      blocked: true,
      damage: Math.max(0, chip),
      knockdown: false,
      ko: false,
      x: hitPt.x,
      y: hitPt.y,
    };
  }

  const counter = defender.attackPhase === 'startup';
  const damage = computeScaledDamage(attacker, defender, def.damage * (counter ? COUNTER_MUL : 1));
  defender.applyHit(def, damage, dir, matchTime);
  attacker.addMeter(damage * 0.9 + 2);
  defender.addMeter(damage * 0.6);
  applyCornerPushback(attacker, defender, def.pushback * 0.8);

  return {
    attacker,
    defender,
    moveId: def.id,
    blocked: false,
    damage,
    knockdown: defender.state === 'knockdown',
    ko: defender.state === 'ko',
    counter,
    x: hitPt.x,
    y: hitPt.y,
  };
}

export function resolveMutualCombat(
  f0: FighterController,
  f1: FighterController,
  matchTime: number,
): [StrikeResolution | null, StrikeResolution | null] {
  const can0 = canDeliverStrike(f0, f1);
  const can1 = canDeliverStrike(f1, f0);
  if (!can0 || !can1) {
    return [resolveSingleStrike(f0, f1, matchTime), resolveSingleStrike(f1, f0, matchTime)];
  }

  const g0 = f0.attack?.moveId === 'grab';
  const g1 = f1.attack?.moveId === 'grab';
  if (g0 !== g1) {
    // Non-grab strike cleanly stuffs opposing grab attempt on simultaneous frame
    return g0
      ? [null, resolveSingleStrike(f1, f0, matchTime)]
      : [resolveSingleStrike(f0, f1, matchTime), null];
  }
  if (g0 && g1) {
    return [resolveSingleStrike(f0, f1, matchTime), null];
  }

  const savedAtk1 = f1.attack;
  const r0 = resolveSingleStrike(f0, f1, matchTime);
  f1.attack = savedAtk1;
  const r1 = resolveSingleStrike(f1, f0, matchTime);
  if (r0 && !r0.blocked && f1.state !== 'attack') {
    f1.attack = null;
  }
  return [r0, r1];
}

export function resolvePushboxes(f0: FighterController, f1: FighterController): void {
  if (f0.y > 1 || f1.y > 1) return;
  const dx = f1.x - f0.x;
  const dist = Math.abs(dx);
  if (dist >= PUSH_MIN_DIST) return;
  const dir = dx === 0 ? f0.facing : Math.sign(dx);
  const overlap = (PUSH_MIN_DIST - dist) / 2;
  f0.x -= dir * overlap;
  f1.x += dir * overlap;

  const clampWall = (a: FighterController, b: FighterController) => {
    if (a.x < -ARENA_HALF_WIDTH) {
      b.x += -ARENA_HALF_WIDTH - a.x;
      a.x = -ARENA_HALF_WIDTH;
    } else if (a.x > ARENA_HALF_WIDTH) {
      b.x -= a.x - ARENA_HALF_WIDTH;
      a.x = ARENA_HALF_WIDTH;
    }
  };
  clampWall(f0, f1);
  clampWall(f1, f0);
}
