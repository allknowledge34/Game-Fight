import { describe, expect, it } from 'vitest';
import {
  ARENA_HALF_WIDTH,
  CROUCH_HEIGHT_MUL,
  FighterController,
  PUSH_MIN_DIST,
  STANDING_HEIGHT,
} from '../../src/physics/FighterController';
import { resolvePushboxes } from '../../src/collision/CombatResolver';
import { emptyInput } from '../../src/simulation/BattleSimulation';

describe('FighterController physics & boundaries', () => {
  it('handles jump arc, gravity, and landing recovery', () => {
    const f = new FighterController(0, 'kratos');
    f.resetForRound();

    f.update({ ...emptyInput(), up: true, moveX: 1 }, 2);
    expect(f.state).toBe('jump');
    expect(f.grounded).toBe(false);
    expect(f.vy).toBeGreaterThanOrEqual(7);

    let peakY = 0;
    for (let i = 0; i < 60; i++) {
      f.update(emptyInput(), 2);
      peakY = Math.max(peakY, f.y);
    }

    expect(peakY).toBeGreaterThan(1.0);
    expect(f.grounded).toBe(true);
    expect(f.y).toBe(0);
    expect(f.state).toBe('idle');
  });

  it('clamps movement within arena bounds [-6.5, +6.5]', () => {
    const f = new FighterController(0, 'spiderman');
    f.resetForRound();
    f.x = ARENA_HALF_WIDTH - 0.1;

    for (let i = 0; i < 40; i++) {
      f.update({ ...emptyInput(), moveX: 1 }, 10);
    }
    expect(f.x).toBeLessThanOrEqual(ARENA_HALF_WIDTH);

    f.x = -ARENA_HALF_WIDTH + 0.1;
    for (let i = 0; i < 40; i++) {
      f.update({ ...emptyInput(), moveX: -1 }, -10);
    }
    expect(f.x).toBeGreaterThanOrEqual(-ARENA_HALF_WIDTH);
  });

  it('enforces minimum grounded pushbox separation', () => {
    const p1 = new FighterController(0, 'kratos');
    const p2 = new FighterController(1, 'wukong');
    p1.resetForRound();
    p2.resetForRound();

    p1.x = 0;
    p2.x = 0.2;
    resolvePushboxes(p1, p2);
    expect(Math.abs(p2.x - p1.x)).toBeGreaterThanOrEqual(PUSH_MIN_DIST - 0.001);
  });

  it('scales hurtbox height accurately when crouching', () => {
    const f = new FighterController(0, 'michael');
    f.resetForRound();
    expect(f.hurtboxHeight).toBeCloseTo(STANDING_HEIGHT * f.profile.modelHeight, 3);

    f.update({ ...emptyInput(), down: true }, 2);
    expect(f.state).toBe('crouch');
    expect(f.hurtboxHeight).toBeCloseTo(STANDING_HEIGHT * f.profile.modelHeight * CROUCH_HEIGHT_MUL, 3);
  });
});
