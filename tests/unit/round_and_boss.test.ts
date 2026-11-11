import { describe, expect, it } from 'vitest';
import { RoundManager } from '../../src/combat/RoundManager';
import { BattleSimulation, emptyInput } from '../../src/simulation/BattleSimulation';
import { defaultBapuProgress, loadBapuProgress, recordMatchWinForBapu } from '../../src/core/storage';

function makeMemoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (idx) => Array.from(data.keys())[idx] ?? null,
    removeItem: (k) => {
      data.delete(k);
    },
    setItem: (k, v) => {
      data.set(k, v);
    },
  };
}

describe('RoundManager, Boss Mbapu, Nirmala Budget & progression', () => {
  it('tracks FT2 wins, handles draws and timeover percentages', () => {
    const rm = new RoundManager();
    const d = rm.resolveRound(50, 100, 50, 100, true);
    expect(d.winner).toBe('draw');
    expect(rm.wins).toEqual([0, 0]);

    const r1 = rm.resolveRound(80, 100, 0, 100, false);
    expect(r1.winner).toBe(0);
    expect(r1.matchWinner).toBeNull();

    rm.startNextRound();
    expect(rm.round).toBe(2);
    expect(rm.timer).toBe(60);

    const r2 = rm.resolveRound(40, 100, 60, 200, true); // 40% > 30%
    expect(r2.winner).toBe(0);
    expect(r2.matchWinner).toBe(0);
    expect(rm.finished).toBe(true);
  });

  it('applies Boss Mbapu 2x HP, passive regen, and Nirmala Budget Assist 25% slam', () => {
    const sim = new BattleSimulation(
      { p1: 'modi', p2: 'mbapu', stage: 'sansad', difficulty: 'normal', mode: 'cpu' },
      true,
    );

    const boss = sim.fighters[1];
    expect(boss.isBoss).toBe(true);
    expect(boss.maxHp).toBe(200);
    expect(sim.vsBoss).toBe(true);

    // Damage boss & simulate idle regen after 3s delay
    boss.hp = 150;
    boss.lastDamageAt = sim.matchTime - 4;
    sim.stepFrame(emptyInput(), emptyInput());
    expect(boss.hp).toBeGreaterThan(150);

    // Charge Nirmala Budget over 15s (900 frames)
    for (let i = 0; i < 910; i++) {
      sim.stepFrame(emptyInput(), emptyInput());
    }
    expect(sim.budget).toBe(1);

    const hpBeforeBudget = boss.hp;
    sim.stepFrame({ ...emptyInput(), budget: true }, emptyInput());
    expect(sim.phase).toBe('super');
    expect(sim.cinematic?.kind).toBe('budget');

    // Run until budget impact finishes (~4s)
    for (let i = 0; i < 240; i++) {
      sim.stepFrame(emptyInput(), emptyInput());
    }
    expect(boss.hp).toBeCloseTo(hpBeforeBudget - 50, 0);
  });

  it('unlocks Boss Mbapu after 3 CPU wins or beating Boss directly', () => {
    const store = makeMemoryStorage();
    expect(loadBapuProgress(store)).toEqual(defaultBapuProgress());

    expect(recordMatchWinForBapu(true, false, store)).toBe(false);
    expect(recordMatchWinForBapu(true, false, store)).toBe(false);
    expect(recordMatchWinForBapu(true, false, store)).toBe(true);
    expect(loadBapuProgress(store).unlocked).toBe(true);

    const store2 = makeMemoryStorage();
    expect(recordMatchWinForBapu(true, true, store2)).toBe(true);
  });
});
