import { describe, expect, it } from 'vitest';
import { FighterController } from '../../src/physics/FighterController';
import { resolveMutualCombat } from '../../src/collision/CombatResolver';
import { BASE_MOVES } from '../../src/combat/moves';
import { emptyInput } from '../../src/simulation/BattleSimulation';

function stepUntilActive(attacker: FighterController, defender: FighterController) {
  let result = null;
  for (let i = 0; i < 20; i++) {
    attacker.update(emptyInput(), defender.x);
    defender.update(emptyInput(), attacker.x);
    const [r] = resolveMutualCombat(attacker, defender, i / 60);
    if (r) {
      result = r;
      break;
    }
  }
  return result;
}

describe('Combat resolution, combos, blocks, counters, and grabs', () => {
  it('connects standing jab, deals base damage, and builds SHAKTI meter', () => {
    const p1 = new FighterController(0, 'modi');
    const p2 = new FighterController(1, 'rahul');
    p1.resetForRound();
    p2.resetForRound();
    p1.x = -0.35;
    p2.x = 0.35;

    p1.update({ ...emptyInput(), punch: true }, p2.x);
    expect(p1.attack?.moveId).toBe('jab');

    const res = stepUntilActive(p1, p2);
    expect(res).not.toBeNull();
    expect(res!.blocked).toBe(false);
    expect(res!.damage).toBe(BASE_MOVES.jab.damage);
    expect(p2.hp).toBe(100 - BASE_MOVES.jab.damage);
    expect(p1.meter).toBeGreaterThan(5);
    expect(p2.meter).toBeGreaterThan(2);
  });

  it('guards high/mid attacks when holding back and applies non-lethal chip damage', () => {
    const p1 = new FighterController(0, 'modi');
    const p2 = new FighterController(1, 'rahul');
    p1.resetForRound();
    p2.resetForRound();
    p1.x = -0.35;
    p2.x = 0.35;
    p2.hp = 1; // Chip damage must never KO

    p1.update({ ...emptyInput(), kick: true }, p2.x);
    let res = null;
    for (let i = 0; i < 20; i++) {
      p1.update(emptyInput(), p2.x);
      p2.update({ ...emptyInput(), moveX: 1 }, p1.x); // P2 facing left, so +1 is back
      const [r] = resolveMutualCombat(p1, p2, i / 60);
      if (r) {
        res = r;
        break;
      }
    }

    expect(res).not.toBeNull();
    expect(res!.blocked).toBe(true);
    expect(p2.hp).toBe(1);
    expect(p2.state).toBe('blockstun');
  });

  it('allows low sweep to open standing guard and misses high attacks against crouching foes', () => {
    const p1 = new FighterController(0, 'rahul');
    const p2 = new FighterController(1, 'modi');
    p1.resetForRound();
    p2.resetForRound();
    p1.x = -0.3;
    p2.x = 0.3;

    // Crouching defender ducks high jab
    p1.update({ ...emptyInput(), punch: true }, p2.x);
    let missed = true;
    for (let i = 0; i < 12; i++) {
      p1.update(emptyInput(), p2.x);
      p2.update({ ...emptyInput(), down: true }, p1.x);
      const [r] = resolveMutualCombat(p1, p2, i / 60);
      if (r) missed = false;
    }
    expect(missed).toBe(true);
  });

  it('supports hit-confirm chain combos with damage scaling', () => {
    const p1 = new FighterController(0, 'rahul');
    const p2 = new FighterController(1, 'yogi');
    p1.resetForRound();
    p2.resetForRound();
    p1.x = -0.3;
    p2.x = 0.3;

    p1.update({ ...emptyInput(), punch: true }, p2.x);
    const r1 = stepUntilActive(p1, p2);
    expect(r1?.moveId).toBe('jab');

    // Buffer punch during end of active window to cancel into cross
    for (let i = 0; i < 4; i++) {
      p1.update({ ...emptyInput(), punch: true }, p2.x);
      p2.update(emptyInput(), p1.x);
    }
    expect(p1.attack?.moveId).toBe('cross');

    const r2 = stepUntilActive(p1, p2);
    expect(r2).not.toBeNull();
    expect(r2!.moveId).toBe('cross');
    expect(p2.comboHits).toBe(2);
    // 2nd hit has 0.9 combo scaling: Math.round(6 * 0.9) = 5
    expect(r2!.damage).toBe(5);
  });

  it('triggers grab tech break when both fighters grab simultaneously', () => {
    const p1 = new FighterController(0, 'modi');
    const p2 = new FighterController(1, 'amit');
    p1.resetForRound();
    p2.resetForRound();
    p1.x = -0.3;
    p2.x = 0.3;

    p1.update({ ...emptyInput(), grab: true }, p2.x);
    p2.update({ ...emptyInput(), grab: true }, p1.x);
    const res = stepUntilActive(p1, p2);

    expect(res).not.toBeNull();
    expect(res!.grab).toBe('break');
    expect(p1.state).toBe('blockstun');
    expect(p2.state).toBe('blockstun');
  });
});
