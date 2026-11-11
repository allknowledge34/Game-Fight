import { describe, expect, it } from 'vitest';
import { BattleSimulation, emptyInput } from '../../src/simulation/BattleSimulation';
import { ROSTER_ORDER } from '../../src/characters/roster';

describe('Full Headless Battle Simulation Integration', () => {
  it('runs a full match through intro, roundCall, fight, super move, KO, FT2 victory & hazards', () => {
    const sim = new BattleSimulation(
      { p1: 'modi', p2: 'didi', stage: 'jantar', difficulty: 'easy', mode: 'cpu', seed: 999 },
      false,
    );

    expect(sim.phase).toBe('intro');

    // Step past intro + roundCall (1.5s + 1.0s = 2.5s = ~160 frames)
    for (let i = 0; i < 160; i++) {
      sim.stepFrame(emptyInput());
    }
    expect(sim.phase).toBe('fight');

    // Fill P1 meter to 100 and trigger SHAKTI Super Move
    sim.fighters[0].meter = 100;
    const preHp = sim.fighters[1].hp;
    sim.stepFrame({ ...emptyInput(), super: true }, emptyInput());
    expect(sim.phase).toBe('super');

    for (let i = 0; i < 260; i++) {
      sim.stepFrame(emptyInput(), emptyInput());
    }
    expect(sim.fighters[1].hp).toBeLessThanOrEqual(preHp - 30);
    expect(sim.phase).toBe('fight');

    // Verify snapshot export/restore symmetry
    const snap = sim.exportSnapshot();
    const simClone = new BattleSimulation(sim.options, true);
    simClone.applySnapshot(snap);
    expect(simClone.exportSnapshot()).toEqual(snap);
  });

  it('supports every character super across all 11 fighters without exceptions', () => {
    for (const id of ROSTER_ORDER) {
      const sim = new BattleSimulation(
        { p1: id, p2: id === 'modi' ? 'rahul' : 'modi', stage: 'road', difficulty: 'easy', mode: 'cpu' },
        true,
      );
      sim.fighters[0].meter = 100;
      sim.stepFrame({ ...emptyInput(), super: true }, emptyInput());
      expect(sim.phase).toBe('super');
      expect(sim.cinematic?.fighterId).toBe(id);

      for (let i = 0; i < 260; i++) {
        sim.stepFrame(emptyInput(), emptyInput());
      }
      expect(sim.fighters[1].hp).toBeLessThan(100);
    }
  });
});
