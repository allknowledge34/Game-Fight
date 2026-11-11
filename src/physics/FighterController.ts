import { clamp } from '../core/prng';
import type {
  AttackInstance,
  FighterId,
  FighterProfile,
  FighterSnapshot,
  FighterState,
  MoveDefinition,
  MoveId,
  PlayerInput,
} from '../core/types';
import { FIGHTER_ROSTER, BOSS_MULTIPLIERS } from '../characters/roster';
import { BASE_MOVES, getMoveReach, moveTotalFrames, resolveNextChainMove, selectGroundedAttack } from '../combat/moves';

export const FIXED_DT = 1 / 60;
export const ARENA_HALF_WIDTH = 6.5;
export const START_GAP = 2.6;
export const PUSH_MIN_DIST = 0.72;
export const STANDING_HEIGHT = 1.85;
export const CROUCH_HEIGHT_MUL = 0.62;
export const GRAVITY = 24;
export const CHIP_MUL = 0.15;
export const COUNTER_MUL = 1.2;

const INPUT_BUFFER_FRAMES = 9;
const SUPER_BUFFER_FRAMES = 30;
const LOCKED_STATES = new Set<FighterState>(['super', 'frozen', 'victory', 'intro']);
const INVULNERABLE_STATES = new Set<FighterState>(['knockdown', 'getup', 'ko', 'super', 'frozen', 'victory', 'intro']);

export class FighterController {
  readonly side: 0 | 1;
  readonly profile: FighterProfile;
  readonly isBoss: boolean;
  readonly power: number;
  readonly meterGainMul: number;
  readonly maxHp: number;

  x: number;
  y = 0;
  vx = 0;
  vy = 0;
  facing: 1 | -1;
  grounded = true;
  hp: number;
  meter = 0;
  state: FighterState = 'intro';
  stateFrames = 0;

  stun = 0;
  downFrames = 0;
  comboHits = 0;
  lastHitHeight: 'high' | 'mid' | 'low' = 'mid';
  crouching = false;
  holdingBack = false;
  moveRel = 0;
  airAttackUsed = false;
  wantsSuper = false;
  walkDistance = 0;

  attack: AttackInstance | null = null;
  buffer: { button: 'punch' | 'kick' | 'grab'; frames: number } | null = null;
  superBuffer = 0;
  invincibleFrames = 0;
  lastDamageAt = -99;

  constructor(side: 0 | 1, fighterId: FighterId, asBoss = false) {
    this.side = side;
    this.profile = FIGHTER_ROSTER[fighterId];
    this.isBoss = asBoss;
    this.power = asBoss ? BOSS_MULTIPLIERS.powerScale : 1;
    this.meterGainMul = asBoss ? BOSS_MULTIPLIERS.meterGainScale : 1;
    this.maxHp = Math.round(100 * (asBoss ? BOSS_MULTIPLIERS.hpScale : 1));
    this.hp = this.maxHp;
    this.facing = side === 0 ? 1 : -1;
    this.x = side === 0 ? -START_GAP / 2 : START_GAP / 2;
  }

  resetForRound(fullResetHp = true): void {
    this.x = this.side === 0 ? -START_GAP / 2 : START_GAP / 2;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.facing = this.side === 0 ? 1 : -1;
    this.grounded = true;
    if (fullResetHp) this.hp = this.maxHp;
    this.state = 'idle';
    this.stateFrames = 0;
    this.stun = 0;
    this.downFrames = 0;
    this.comboHits = 0;
    this.crouching = false;
    this.holdingBack = false;
    this.moveRel = 0;
    this.airAttackUsed = false;
    this.wantsSuper = false;
    this.attack = null;
    this.buffer = null;
    this.superBuffer = 0;
    this.invincibleFrames = 0;
    this.lastDamageAt = -99;
  }

  get airborne(): boolean {
    return !this.grounded || this.y > 0.001;
  }

  get invulnerable(): boolean {
    return this.invincibleFrames > 0 || INVULNERABLE_STATES.has(this.state);
  }

  get isLow(): boolean {
    if (this.state === 'crouch' || (this.state === 'blockstun' && this.crouching)) return true;
    return !!(this.attack && BASE_MOVES[this.attack.moveId].crouching);
  }

  get currentMove(): MoveDefinition | null {
    return this.attack ? BASE_MOVES[this.attack.moveId] : null;
  }

  get isAttackActive(): boolean {
    if (!this.attack) return false;
    const def = BASE_MOVES[this.attack.moveId];
    return this.attack.frame > def.startup && this.attack.frame <= def.startup + def.active;
  }

  get attackPhase(): 'startup' | 'active' | 'recovery' | null {
    if (!this.attack) return null;
    const def = BASE_MOVES[this.attack.moveId];
    if (this.attack.frame <= def.startup) return 'startup';
    if (this.attack.frame <= def.startup + def.active) return 'active';
    return 'recovery';
  }

  get canBlock(): boolean {
    return (
      this.state === 'idle' ||
      this.state === 'walkFwd' ||
      this.state === 'walkBack' ||
      this.state === 'crouch' ||
      this.state === 'blockstun'
    );
  }

  get hurtboxHeight(): number {
    return STANDING_HEIGHT * this.profile.modelHeight * (this.crouching ? CROUCH_HEIGHT_MUL : 1);
  }

  enter(next: FighterState): void {
    if (this.state !== next) {
      this.state = next;
      this.stateFrames = 0;
    }
  }

  forceState(next: FighterState): void {
    this.state = next;
    this.stateFrames = 0;
  }

  addMeter(delta: number): void {
    const scaled = delta > 0 ? delta * this.meterGainMul : delta;
    this.meter = clamp(this.meter + scaled, 0, 100);
  }

  consumeBuffer(): 'punch' | 'kick' | 'grab' | null {
    if (!this.buffer) return null;
    const btn = this.buffer.button;
    this.buffer = null;
    return btn;
  }

  startAttack(moveId: MoveId): void {
    this.attack = { moveId, frame: 0, hasHit: false };
    this.crouching = BASE_MOVES[moveId].crouching;
    this.enter('attack');
    this.stateFrames = 0;
  }

  startJump(relMove: number): void {
    this.vy = this.profile.jumpV;
    this.vx = relMove * this.profile.jumpVx * this.facing;
    this.crouching = false;
    this.airAttackUsed = false;
    this.attack = null;
    this.grounded = false;
    this.enter('jump');
  }

  update(input: PlayerInput, opponentX: number, edges?: { punch: boolean; kick: boolean; grab: boolean; super: boolean }): void {
    this.wantsSuper = false;
    this.stateFrames++;
    if (this.invincibleFrames > 0) this.invincibleFrames--;

    const punchEdge = edges ? edges.punch : input.punch;
    const kickEdge = edges ? edges.kick : input.kick;
    const grabEdge = edges ? edges.grab : input.grab;
    const superEdge = edges ? edges.super : input.super;

    if (grabEdge || (punchEdge && kickEdge)) {
      this.buffer = { button: 'grab', frames: INPUT_BUFFER_FRAMES };
    } else if (kickEdge) {
      this.buffer = { button: 'kick', frames: INPUT_BUFFER_FRAMES };
    } else if (punchEdge) {
      this.buffer = { button: 'punch', frames: INPUT_BUFFER_FRAMES };
    } else if (this.buffer) {
      this.buffer.frames--;
      if (this.buffer.frames <= 0) this.buffer = null;
    }

    if (superEdge) {
      this.superBuffer = SUPER_BUFFER_FRAMES;
    } else if (this.superBuffer > 0) {
      this.superBuffer--;
    }

    if (LOCKED_STATES.has(this.state)) {
      return;
    }

    const oppDir: 1 | -1 = opponentX >= this.x ? 1 : -1;

    switch (this.state) {
      case 'idle':
      case 'walkFwd':
      case 'walkBack':
      case 'crouch':
        this.comboHits = 0;
        this.updateActionable(input, oppDir);
        break;
      case 'attack':
        if (this.isBoss && this.attackPhase === 'recovery' && input.moveX * this.facing < 0) {
          this.attack = null;
          this.enter('idle');
          break;
        }
        this.updateAttack();
        break;
      case 'jump':
        if (!this.airAttackUsed && this.buffer && this.buffer.button !== 'grab') {
          const btn = this.consumeBuffer();
          if (btn) {
            this.attack = { moveId: btn === 'kick' ? 'airKick' : 'airPunch', frame: 0, hasHit: false };
            this.airAttackUsed = true;
          }
        }
        if (this.attack) {
          this.attack.frame++;
        }
        break;
      case 'hitstun':
        this.stun--;
        this.vx *= 0.86;
        if (this.stun <= 0) this.enter('idle');
        break;
      case 'blockstun':
        this.holdingBack = input.moveX * this.facing < 0;
        this.crouching = input.down;
        this.stun--;
        this.vx *= 0.82;
        if (this.stun <= 0) this.enter(this.crouching ? 'crouch' : 'idle');
        break;
      case 'knockdown':
        if (this.grounded) {
          this.vx *= 0.8;
          this.downFrames++;
          if (this.downFrames >= 48) {
            this.enter('getup');
            this.invincibleFrames = 24;
          }
        }
        break;
      case 'getup':
        this.vx = 0;
        if (this.stateFrames >= 24) {
          this.facing = oppDir;
          this.invincibleFrames = 6;
          this.enter('idle');
        }
        break;
      case 'ko':
        if (this.grounded) {
          this.vx *= 0.85;
          this.downFrames++;
        }
        break;
    }

    this.integrate();
  }

  private updateActionable(input: PlayerInput, oppDir: 1 | -1): void {
    this.facing = oppDir;
    const rel = input.moveX * this.facing;
    this.moveRel = rel;
    this.holdingBack = rel < 0;

    if (this.superBuffer > 0 && this.meter >= 100) {
      this.superBuffer = 0;
      this.wantsSuper = true;
      this.vx = 0;
      return;
    }

    if (input.up && !input.down) {
      this.startJump(rel);
      return;
    }

    this.crouching = input.down;
    const btn = this.consumeBuffer();
    if (btn) {
      this.startAttack(selectGroundedAttack(btn, this.crouching, rel > 0));
      return;
    }

    if (this.crouching) {
      this.enter('crouch');
      this.vx = 0;
    } else if (rel === 0) {
      this.enter('idle');
      this.vx = 0;
    } else if (rel > 0) {
      this.enter('walkFwd');
      this.vx = this.profile.walkFwd * this.facing;
    } else {
      this.enter('walkBack');
      this.vx = -this.profile.walkBack * this.facing;
    }
  }

  private updateAttack(): void {
    const atk = this.attack;
    if (!atk) {
      this.enter('idle');
      return;
    }
    atk.frame++;
    const def = BASE_MOVES[atk.moveId];

    if (atk.frame <= def.startup + def.active) {
      const targetReach = getMoveReach(this.profile.id, def.id);
      const bonus = atk.frame <= def.startup + 1 ? Math.max(0, (def.reach - targetReach) * 0.4) : 0;
      this.vx = (def.lungeX + bonus) * this.facing;
    } else {
      this.vx *= 0.75;
    }

    if (def.chains && atk.hasHit && this.buffer && atk.frame >= def.startup + def.active) {
      const nextMove = resolveNextChainMove(this.profile.id, def, this.buffer.button);
      if (nextMove) {
        this.buffer = null;
        this.startAttack(nextMove);
        return;
      }
    }

    if (atk.frame >= moveTotalFrames(def)) {
      this.attack = null;
      this.crouching = def.crouching;
      this.enter(def.crouching ? 'crouch' : 'idle');
    }
  }

  integrate(): void {
    const wasAir = this.y > 0 || this.vy !== 0;
    if (wasAir) {
      this.vy -= GRAVITY * FIXED_DT;
    }
    this.x += this.vx * FIXED_DT;
    this.y += this.vy * FIXED_DT;
    if (this.state === 'walkFwd' || this.state === 'walkBack') {
      this.walkDistance += Math.abs(this.vx) * FIXED_DT;
    }
    this.x = clamp(this.x, -ARENA_HALF_WIDTH, ARENA_HALF_WIDTH);
    if (this.y <= 0 && wasAir && this.vy <= 0) {
      this.y = 0;
      this.vy = 0;
      this.onLand();
    }
  }

  private onLand(): void {
    this.grounded = true;
    if (this.state === 'jump') {
      const airAtk = this.attack;
      this.attack = null;
      this.vx = 0;
      if (airAtk && !airAtk.hasHit) {
        this.startAttack('landing');
      } else {
        this.enter('idle');
      }
    } else if (this.state === 'hitstun') {
      this.vx *= 0.5;
    }
  }

  applyBlock(def: MoveDefinition, dir: 1 | -1): void {
    this.attack = null;
    this.forceState('blockstun');
    this.stun = def.blockstun;
    this.vx = dir * def.pushback * 0.75;
  }

  applyHit(def: MoveDefinition, damage: number, dir: 1 | -1, matchTime: number): void {
    this.hp = Math.max(0, this.hp - damage);
    this.lastDamageAt = matchTime;
    this.attack = null;
    this.comboHits++;
    this.lastHitHeight = def.guardHeight;
    this.crouching = false;

    if (this.hp <= 0) {
      this.knockOut(dir, 3.4, 6.5);
    } else if (def.knockdown || this.airborne) {
      this.forceState('knockdown');
      this.vx = dir * (def.pushback + 0.8);
      this.vy = Math.max(def.launchY, 4.2);
      this.downFrames = 0;
      this.grounded = false;
    } else {
      this.forceState('hitstun');
      this.stun = this.isBoss ? Math.max(2, Math.round(def.hitstun * 0.6)) : def.hitstun;
      this.vx = dir * def.pushback * (this.isBoss ? 0.7 : 1);
    }
  }

  knockOut(dir: 1 | -1, pushVx: number, launchVy: number): void {
    this.hp = 0;
    this.attack = null;
    this.forceState('ko');
    this.vx = dir * pushVx;
    this.vy = launchVy;
    this.grounded = false;
    this.downFrames = 0;
  }

  toSnapshot(): FighterSnapshot {
    return {
      side: this.side,
      id: this.profile.id,
      x: this.x,
      y: this.y,
      vx: this.vx,
      vy: this.vy,
      facing: this.facing,
      grounded: this.grounded,
      hp: this.hp,
      maxHp: this.maxHp,
      meter: this.meter,
      state: this.state,
      stateFrames: this.stateFrames,
      hitstunFrames: this.state === 'hitstun' ? this.stun : 0,
      blockstunFrames: this.state === 'blockstun' ? this.stun : 0,
      downFrames: this.downFrames,
      comboCount: this.comboHits,
      isBlocking: this.state === 'blockstun' || (this.canBlock && this.holdingBack && !this.airborne),
      invincibleFrames: this.invincibleFrames,
      isBoss: this.isBoss,
      attack: this.attack ? { ...this.attack } : null,
    };
  }

  applySnapshot(snap: FighterSnapshot): void {
    this.x = snap.x;
    this.y = snap.y;
    this.vx = snap.vx;
    this.vy = snap.vy;
    this.facing = snap.facing;
    this.grounded = snap.grounded;
    this.hp = snap.hp;
    this.meter = snap.meter;
    this.state = snap.state;
    this.stateFrames = snap.stateFrames;
    this.downFrames = snap.downFrames;
    this.comboHits = snap.comboCount;
    this.invincibleFrames = snap.invincibleFrames;
    this.attack = snap.attack ? { ...snap.attack } : null;
  }
}
