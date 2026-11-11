import { describe, expect, it } from 'vitest';
import { packPlayerInput, unpackPlayerInput } from '../../src/input/inputEncoding';
import { CpuAi } from '../../src/ai/CpuAi';
import { FighterController } from '../../src/physics/FighterController';

describe('Binary Input Packing & CPU AI', () => {
  it('roundtrips all movement and combat flags deterministically', () => {
    const cases = [
      { moveX: 0, up: false, down: false, punch: false, kick: false, grab: false, super: false, budget: false },
      { moveX: -1, up: true, down: false, punch: true, kick: false, grab: false, super: true, budget: false },
      { moveX: 1, up: false, down: true, punch: false, kick: true, grab: true, super: false, budget: true },
    ];
    for (const c of cases) {
      const packed = packPlayerInput(c);
      expect(unpackPlayerInput(packed)).toEqual(c);
    }
  });

  it('CPU AI approaches distant foes, jumps cow hazards, and activates super when meter full', () => {
    const aiCtrl = new CpuAi('hard', 123);
    const ai = new FighterController(1, 'rahul');
    const opp = new FighterController(0, 'modi');
    ai.resetForRound();
    opp.resetForRound();
    opp.x = -3;
    ai.x = 3;

    const farMove = aiCtrl.step(ai, opp, false);
    expect(farMove.moveX).toBe(-1);

    const cowJump = aiCtrl.step(ai, opp, true);
    expect(cowJump.up).toBe(true);

    opp.x = -0.8;
    ai.x = 0.8;
    ai.meter = 100;
    let firedSuper = false;
    for (let i = 0; i < 30; i++) {
      if (aiCtrl.step(ai, opp, false).super) firedSuper = true;
    }
    expect(firedSuper).toBe(true);
  });
});
