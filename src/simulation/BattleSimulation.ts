import { clamp, SeededRng } from '../core/prng';
import type {
  BattlePhase,
  CombatEvent,
  FighterId,
  FighterSnapshot,
  HazardSnapshot,
  MatchOptions,
  PlayerInput,
} from '../core/types';
import { BOSS_MULTIPLIERS } from '../characters/roster';
import { resolveMutualCombat, resolvePushboxes } from '../collision/CombatResolver';
import { BASE_MOVES } from '../combat/moves';
import { RoundManager, type RoundOutcome } from '../combat/RoundManager';
import { CpuAi } from '../ai/CpuAi';
import { ARENA_HALF_WIDTH, FighterController, FIXED_DT } from '../physics/FighterController';

export interface ActiveCinematic {
  kind: 'grapple' | 'super' | 'budget';
  casterSide: 0 | 1;
  fighterId: FighterId;
  elapsed: number;
  duration: number;
  damageApplied: boolean;
  damageAmount: number;
}

export interface BattleStateSnapshot {
  tick: number;
  phase: BattlePhase;
  phaseTime: number;
  round: number;
  timer: number;
  wins: [number, number];
  hitStop: number;
  timeScale: number;
  budget: number;
  calm: number;
  excitement: number;
  matchWinner: 0 | 1 | null;
  fighters: [FighterSnapshot, FighterSnapshot];
  hazards: HazardSnapshot;
  cinematic: ActiveCinematic | null;
}

export class BattleSimulation {
  readonly options: MatchOptions;
  readonly fighters: [FighterController, FighterController];
  readonly rounds = new RoundManager();
  readonly events: CombatEvent[] = [];

  private readonly rng: SeededRng;
  private readonly ai: CpuAi | null;
  private prevInputs: [PlayerInput, PlayerInput] = [emptyInput(), emptyInput()];

  tick = 0;
  matchTime = 0;
  phase: BattlePhase = 'intro';
  phaseTime = 0;
  hitStop = 0;
  timeScale = 1;
  slowMoTime = 0;

  budget = 0;
  hasBossMatch = false;
  bossSide: 0 | 1 | null = null;
  calm = 0;
  excitement = 0.2;
  matchWinner: 0 | 1 | null = null;
  lastOutcome: RoundOutcome | null = null;

  cinematic: ActiveCinematic | null = null;

  // Dynamic arena hazards / pickups
  cowActive = false;
  cowX = -8;
  cowDir: 1 | -1 = 1;
  cowHitSides = new Set<0 | 1>();
  nextCowAt = 16;

  mithaiActive = false;
  mithaiX = 0;
  mithaiAge = 0;
  nextMithaiAt = 24;

  bombActive = false;
  bombX = 0;
  bombFuse = 0;
  nextBombAt = 32;

  constructor(options: MatchOptions, fastIntro = false) {
    this.options = options;
    this.rng = new SeededRng(options.seed ?? 202611);
    const p2AsBoss = options.mode === 'cpu' && options.p2 === 'mbapu';
    this.hasBossMatch = p2AsBoss;
    this.bossSide = p2AsBoss ? 1 : null;

    this.fighters = [
      new FighterController(0, options.p1, false),
      new FighterController(1, options.p2, p2AsBoss),
    ];
    this.ai = options.mode === 'cpu' ? new CpuAi(options.difficulty, (options.seed ?? 100) + 77) : null;

    this.phase = fastIntro ? 'fight' : 'intro';
    if (fastIntro) {
      this.fighters[0].resetForRound(true);
      this.fighters[1].resetForRound(true);
    }
  }

  get vsBoss(): boolean {
    return this.hasBossMatch;
  }

  resetMatch(fastIntro = false): void {
    this.rounds.resetMatch();
    this.tick = 0;
    this.matchTime = 0;
    this.hitStop = 0;
    this.timeScale = 1;
    this.slowMoTime = 0;
    this.budget = 0;
    this.calm = 0;
    this.excitement = 0.25;
    this.matchWinner = null;
    this.lastOutcome = null;
    this.cinematic = null;
    this.clearHazards();
    this.events.length = 0;
    this.fighters[0].resetForRound(true);
    this.fighters[1].resetForRound(true);
    if (!fastIntro) {
      this.fighters[0].forceState('intro');
      this.fighters[1].forceState('intro');
      this.phase = 'intro';
    } else {
      this.phase = 'fight';
    }
    this.phaseTime = 0;
  }

  private clearHazards(): void {
    this.cowActive = false;
    this.mithaiActive = false;
    this.bombActive = false;
    this.cowHitSides.clear();
  }

  stepFrame(p1Input: PlayerInput, p2Input?: PlayerInput): CombatEvent[] {
    this.events.length = 0;
    this.tick += 1;

    const p2Resolved = p2Input ?? this.computeCpuInput();

    if (this.hitStop > 0) {
      this.hitStop -= 1;
      this.prevInputs = [{ ...p1Input }, { ...p2Resolved }];
      return [...this.events];
    }

    if (this.slowMoTime > 0) {
      this.slowMoTime = Math.max(0, this.slowMoTime - FIXED_DT);
      if (this.slowMoTime <= 0) this.timeScale = 1;
    }

    const scaledDt = FIXED_DT * this.timeScale;
    this.phaseTime += scaledDt;
    this.matchTime += scaledDt;
    this.excitement = Math.max(0, this.excitement - FIXED_DT * 0.25);

    switch (this.phase) {
      case 'intro':
        this.fighters[0].stateFrames += 1;
        this.fighters[1].stateFrames += 1;
        if (this.phaseTime >= 1.5) {
          this.beginRoundCall();
        }
        break;
      case 'roundCall':
        if (this.phaseTime >= 1.0) {
          this.phase = 'fight';
          this.phaseTime = 0;
          this.events.push({ kind: 'roundStart', text: `ROUND ${this.rounds.round}` });
        }
        break;
      case 'fight':
        this.stepFight(p1Input, p2Resolved);
        break;
      case 'grapple':
      case 'super':
        this.stepCinematic(FIXED_DT);
        break;
      case 'ko':
        this.fighters[0].integrate();
        this.fighters[1].integrate();
        if (this.phaseTime >= 2.1) {
          if (this.rounds.finished) {
            this.phase = 'matchEnd';
            this.phaseTime = 0;
            this.matchWinner = this.lastOutcome?.matchWinner ?? 0;
            this.fighters[this.matchWinner].forceState('victory');
            this.events.push({
              kind: 'matchEnd',
              side: this.matchWinner,
              text: this.fighters[this.matchWinner].profile.winLine,
            });
          } else {
            this.rounds.startNextRound();
            this.fighters[0].resetForRound(true);
            this.fighters[1].resetForRound(true);
            this.clearHazards();
            this.beginRoundCall();
          }
        }
        break;
      case 'matchEnd':
        this.fighters[0].stateFrames += 1;
        this.fighters[1].stateFrames += 1;
        break;
    }

    this.prevInputs = [{ ...p1Input }, { ...p2Resolved }];
    return [...this.events];
  }

  private computeCpuInput(): PlayerInput {
    if (!this.ai) return emptyInput();
    const cowNear = this.cowActive && Math.abs(this.cowX - this.fighters[1].x) < 2.2;
    return this.ai.step(this.fighters[1], this.fighters[0], cowNear);
  }

  private beginRoundCall(): void {
    this.phase = 'roundCall';
    this.phaseTime = 0;
    this.fighters[0].enter('idle');
    this.fighters[1].enter('idle');
  }

  private edgesFor(side: 0 | 1, input: PlayerInput) {
    const prev = this.prevInputs[side];
    return {
      punch: input.punch && !prev.punch,
      kick: input.kick && !prev.kick,
      grab: input.grab && !prev.grab,
      super: input.super && !prev.super,
      budget: !!input.budget && !prev.budget,
    };
  }

  private stepFight(in0: PlayerInput, in1: PlayerInput): void {
    const f0 = this.fighters[0];
    const f1 = this.fighters[1];

    const e0 = this.edgesFor(0, in0);
    const e1 = this.edgesFor(1, in1);

    const wasGround0 = f0.grounded;
    const wasGround1 = f1.grounded;

    f0.update(in0, f1.x, e0);
    f1.update(in1, f0.x, e1);

    if (!wasGround0 && f0.grounded) this.events.push({ kind: 'land', side: 0, x: f0.x, y: 0 });
    if (!wasGround1 && f1.grounded) this.events.push({ kind: 'land', side: 1, x: f1.x, y: 0 });

    // Boss passive HP regen if unharmed for >= regenDelaySeconds
    if (this.hasBossMatch && this.bossSide !== null) {
      const boss = this.fighters[this.bossSide];
      if (
        boss.hp > 0 &&
        boss.hp < boss.maxHp &&
        this.matchTime - boss.lastDamageAt >= BOSS_MULTIPLIERS.regenDelaySeconds
      ) {
        boss.hp = Math.min(boss.maxHp, boss.hp + BOSS_MULTIPLIERS.regenPerSecond * FIXED_DT);
      }

      // Charge Nirmala Budget bar
      this.budget = clamp(this.budget + FIXED_DT / BOSS_MULTIPLIERS.budgetCooldownSeconds, 0, 1);

      const userSide: 0 | 1 = this.bossSide === 1 ? 0 : 1;
      const userEdges = userSide === 0 ? e0 : e1;
      const userFighter = this.fighters[userSide];
      if (
        this.budget >= 1 &&
        userEdges.budget &&
        !userFighter.invulnerable &&
        userFighter.grounded &&
        boss.hp > 0
      ) {
        this.budget = 0;
        this.startCinematic('budget', userSide);
        return;
      }
    }

    // Super triggers
    if (f0.wantsSuper && f0.meter >= 100) {
      this.startCinematic('super', 0);
      return;
    }
    if (f1.wantsSuper && f1.meter >= 100) {
      this.startCinematic('super', 1);
      return;
    }

    resolvePushboxes(f0, f1);

    const [res0, res1] = resolveMutualCombat(f0, f1, this.matchTime);
    let anyContact = false;

    for (const res of [res0, res1]) {
      if (!res) continue;
      anyContact = true;
      const atkSide = res.attacker.side;
      const defSide = res.defender.side;

      if (res.grab === 'break') {
        this.hitStop = 4;
        this.events.push({
          kind: 'grappleBreak',
          side: atkSide,
          targetSide: defSide,
          x: res.x,
          y: res.y,
          text: 'TECH BREAK!',
          color: '#ffd75f',
        });
        continue;
      }

      if (res.grab === 'connect') {
        this.startCinematic('grapple', atkSide);
        return;
      }

      if (res.blocked) {
        this.hitStop = 3;
        this.excitement = Math.min(1.5, this.excitement + 0.15);
        this.events.push({
          kind: 'block',
          side: atkSide,
          targetSide: defSide,
          moveId: res.moveId,
          damage: res.damage,
          x: res.x,
          y: res.y,
          text: 'BLOCKED',
          color: '#9fb8ff',
        });
      } else {
        this.hitStop = res.knockdown || res.counter ? 5 : 3;
        this.calm = 0;
        this.excitement = Math.min(1.5, this.excitement + (res.knockdown ? 0.5 : 0.25));
        const customName = res.attacker.profile.moveNames[res.moveId];
        this.events.push({
          kind: 'hit',
          side: atkSide,
          targetSide: defSide,
          moveId: res.moveId,
          damage: res.damage,
          combo: res.defender.comboHits,
          counter: res.counter,
          x: res.x,
          y: res.y,
          text: customName ?? BASE_MOVES[res.moveId].id.toUpperCase(),
          color: res.counter ? '#ffd23f' : res.attacker.profile.accent,
        });
      }
    }

    if (!anyContact) {
      this.calm += FIXED_DT;
    }

    // Hazards (cow, mithai heal box, Diwali bomb)
    this.stepHazards(f0, f1);

    // KO or Time Over evaluation
    if (f0.hp <= 0 || f1.hp <= 0) {
      this.enterKo(false);
      return;
    }

    if (this.rounds.tickTimer(FIXED_DT)) {
      this.enterKo(true);
    }
  }

  private startCinematic(kind: 'grapple' | 'super' | 'budget', casterSide: 0 | 1): void {
    const caster = this.fighters[casterSide];
    const targetSide: 0 | 1 = casterSide === 0 ? 1 : 0;
    const target = this.fighters[targetSide];

    caster.attack = null;
    caster.vx = 0;
    target.attack = null;
    target.vx = 0;
    target.vy = 0;
    target.forceState('frozen');
    caster.forceState('super');

    let duration = 2.0;
    let damageAmount = 14;
    if (kind === 'super') {
      caster.meter = 0;
      duration = 4.0;
      const bossCaster = caster.isBoss;
      damageAmount = bossCaster ? 40 : 30;
    } else if (kind === 'budget') {
      duration = 3.8;
      damageAmount = Math.min(Math.round(target.maxHp * BOSS_MULTIPLIERS.budgetShare), Math.max(1, target.hp - 1));
    } else {
      duration = 1.9;
      damageAmount = Math.round(14 * caster.profile.damageMul * caster.power);
    }

    this.cinematic = {
      kind,
      casterSide,
      fighterId: caster.profile.id,
      elapsed: 0,
      duration,
      damageApplied: false,
      damageAmount,
    };

    this.phase = kind === 'grapple' ? 'grapple' : 'super';
    this.phaseTime = 0;
    this.calm = 0;

    this.events.push({
      kind: kind === 'grapple' ? 'grappleStart' : kind === 'budget' ? 'budgetStart' : 'superStart',
      side: casterSide,
      targetSide,
      text:
        kind === 'budget'
          ? 'NIRMALA BUDGET!'
          : kind === 'super'
            ? caster.profile.superName
            : caster.profile.moveNames.grab ?? 'GRAB!',
      x: (caster.x + target.x) / 2,
      y: 1.8,
      color: caster.profile.accent,
    });
  }

  private stepCinematic(dt: number): void {
    const cin = this.cinematic;
    if (!cin) {
      this.phase = 'fight';
      return;
    }
    cin.elapsed += dt;
    const caster = this.fighters[cin.casterSide];
    const targetSide: 0 | 1 = cin.casterSide === 0 ? 1 : 0;
    const target = this.fighters[targetSide];

    const impactTime = cin.duration * 0.72;
    if (!cin.damageApplied && cin.elapsed >= impactTime) {
      cin.damageApplied = true;
      const dir = caster.facing;
      target.hp = Math.max(0, target.hp - cin.damageAmount);
      target.lastDamageAt = this.matchTime;
      if (cin.kind === 'grapple') {
        caster.addMeter(cin.damageAmount * 0.9 + 2);
        target.addMeter(cin.damageAmount * 0.6);
      }

      if (target.hp <= 0) {
        target.knockOut(dir, 4.2, 7.5);
      } else {
        target.attack = null;
        target.forceState('knockdown');
        target.vx = dir * 4.5;
        target.vy = 6.5;
        target.grounded = false;
        target.downFrames = 0;
      }

      this.excitement = 1.5;
      this.events.push({
        kind: 'hit',
        side: cin.casterSide,
        targetSide,
        damage: cin.damageAmount,
        x: target.x,
        y: 1.4,
        text: `-${cin.damageAmount} HP!`,
        color: '#ffd23f',
      });
    }

    if (cin.damageApplied) {
      target.integrate();
    }

    if (cin.elapsed >= cin.duration) {
      this.cinematic = null;
      caster.y = 0;
      caster.forceState('idle');
      if (target.state === 'frozen') target.forceState('idle');
      if (target.hp <= 0 || caster.hp <= 0) {
        this.enterKo(false);
      } else {
        this.phase = 'fight';
        this.phaseTime = 0;
      }
    }
  }

  private stepHazards(f0: FighterController, f1: FighterController): void {
    // Stray cow hazard
    if (!this.cowActive && this.phaseTime >= this.nextCowAt) {
      this.cowActive = true;
      this.cowDir = this.rng.next() < 0.5 ? 1 : -1;
      this.cowX = -this.cowDir * (ARENA_HALF_WIDTH + 1.4);
      this.cowHitSides.clear();
      this.nextCowAt = this.phaseTime + 22 + this.rng.next() * 10;
      this.events.push({ kind: 'cowSpawn', x: this.cowX, text: 'COW INCOMING!' });
    }
    if (this.cowActive) {
      this.cowX += this.cowDir * 4.6 * FIXED_DT;
      for (const f of [f0, f1]) {
        if (!this.cowHitSides.has(f.side) && Math.abs(f.x - this.cowX) < 0.65) {
          this.cowHitSides.add(f.side);
          if (f.y < 0.55 && !f.invulnerable) {
            f.applyHit({ ...BASE_MOVES.kick, knockdown: true, launchY: 4.4, pushback: 2.2 }, 8, this.cowDir, this.matchTime);
            this.events.push({ kind: 'cowHit', side: f.side, damage: 8, x: f.x, y: 1.0, text: 'MOO HIT! -8' });
          } else {
            this.events.push({ kind: 'cowDodged', side: f.side, x: f.x, y: f.y + 1.6, text: 'GAU RAKSHA DODGE!' });
          }
        }
      }
      if (Math.abs(this.cowX) > ARENA_HALF_WIDTH + 2.2) {
        this.cowActive = false;
      }
    }

    // Mithai heal box
    if (!this.mithaiActive && this.phaseTime >= this.nextMithaiAt) {
      this.mithaiActive = true;
      this.mithaiX = clamp((f0.x + f1.x) * 0.5 + this.rng.range(-1.8, 1.8), -5.0, 5.0);
      this.mithaiAge = 0;
      this.nextMithaiAt = this.phaseTime + 26 + this.rng.next() * 10;
      this.events.push({ kind: 'mithaiSpawn', x: this.mithaiX, text: 'SOAN PAPDI!' });
    }
    if (this.mithaiActive) {
      this.mithaiAge += FIXED_DT;
      for (const f of [f0, f1]) {
        if (f.hp > 0 && f.hp < f.maxHp && f.y < 0.4 && Math.abs(f.x - this.mithaiX) < 0.6) {
          f.hp = Math.min(f.maxHp, f.hp + 18);
          this.mithaiActive = false;
          this.events.push({ kind: 'mithaiPickup', side: f.side, x: f.x, y: 1.5, text: '+18 HP MITHAI!' });
          break;
        }
      }
      if (this.mithaiAge > 10) {
        this.mithaiActive = false;
      }
    }

    // Sutli Bomb hazard
    if (!this.bombActive && this.phaseTime >= this.nextBombAt) {
      this.bombActive = true;
      this.bombX = clamp((f0.x + f1.x) * 0.5 + this.rng.range(-1.4, 1.4), -4.8, 4.8);
      this.bombFuse = 2.4;
      this.nextBombAt = this.phaseTime + 28 + this.rng.next() * 12;
      this.events.push({ kind: 'bombSpawn', x: this.bombX, text: 'SUTLI BOMB!' });
    }
    if (this.bombActive) {
      this.bombFuse -= FIXED_DT;
      if (this.bombFuse <= 0) {
        this.bombActive = false;
        this.events.push({ kind: 'bombExplode', x: this.bombX, y: 0.4, text: 'BOOM!' });
        for (const f of [f0, f1]) {
          if (Math.abs(f.x - this.bombX) < 1.45 && f.y < 0.85 && !f.invulnerable) {
            const pushDir: 1 | -1 = f.x >= this.bombX ? 1 : -1;
            f.applyHit({ ...BASE_MOVES.uppercut, launchY: 6.0, pushback: 3.0 }, 10, pushDir, this.matchTime);
          }
        }
      }
    }
  }

  private enterKo(timeOver: boolean): void {
    this.clearHazards();
    const f0 = this.fighters[0];
    const f1 = this.fighters[1];
    this.lastOutcome = this.rounds.resolveRound(f0.hp, f0.maxHp, f1.hp, f1.maxHp, timeOver);
    this.phase = 'ko';
    this.phaseTime = 0;
    this.timeScale = timeOver ? 0.6 : 0.25;
    this.slowMoTime = timeOver ? 0.8 : 1.4;

    const label =
      this.lastOutcome.reason === 'draw'
        ? 'DRAW!'
        : this.lastOutcome.reason === 'timeover'
          ? 'TIME OVER!'
          : 'K.O.!';

    this.events.push({
      kind: 'ko',
      side: this.lastOutcome.winner === 'draw' ? undefined : this.lastOutcome.winner,
      text: label,
    });
  }

  exportSnapshot(): BattleStateSnapshot {
    return {
      tick: this.tick,
      phase: this.phase,
      phaseTime: this.phaseTime,
      round: this.rounds.round,
      timer: this.rounds.timer,
      wins: [...this.rounds.wins],
      hitStop: this.hitStop,
      timeScale: this.timeScale,
      budget: this.budget,
      calm: this.calm,
      excitement: this.excitement,
      matchWinner: this.matchWinner,
      fighters: [this.fighters[0].toSnapshot(), this.fighters[1].toSnapshot()],
      hazards: {
        cowActive: this.cowActive,
        cowX: this.cowX,
        cowDir: this.cowDir,
        mithaiActive: this.mithaiActive,
        mithaiX: this.mithaiX,
        bombActive: this.bombActive,
        bombX: this.bombX,
        bombFuse: this.bombFuse,
      },
      cinematic: this.cinematic ? { ...this.cinematic } : null,
    };
  }

  applySnapshot(snap: BattleStateSnapshot): void {
    this.tick = snap.tick;
    this.phase = snap.phase;
    this.phaseTime = snap.phaseTime;
    this.rounds.round = snap.round;
    this.rounds.timer = snap.timer;
    this.rounds.wins = [...snap.wins];
    this.hitStop = snap.hitStop;
    this.timeScale = snap.timeScale;
    this.budget = snap.budget;
    this.calm = snap.calm;
    this.excitement = snap.excitement;
    this.matchWinner = snap.matchWinner;
    this.fighters[0].applySnapshot(snap.fighters[0]);
    this.fighters[1].applySnapshot(snap.fighters[1]);
    this.cowActive = snap.hazards.cowActive;
    this.cowX = snap.hazards.cowX;
    this.cowDir = snap.hazards.cowDir;
    this.mithaiActive = snap.hazards.mithaiActive;
    this.mithaiX = snap.hazards.mithaiX;
    this.bombActive = snap.hazards.bombActive;
    this.bombX = snap.hazards.bombX;
    this.bombFuse = snap.hazards.bombFuse;
    this.cinematic = snap.cinematic ? { ...snap.cinematic } : null;
  }
}

export function emptyInput(): PlayerInput {
  return {
    moveX: 0,
    up: false,
    down: false,
    punch: false,
    kick: false,
    grab: false,
    super: false,
    budget: false,
  };
}
