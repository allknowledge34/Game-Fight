import { SeededRng } from '../core/prng';
import type { Difficulty, PlayerInput } from '../core/types';
import { FighterController, FIXED_DT } from '../physics/FighterController';

interface AiProfile {
  reaction: number;
  bossReaction?: number;
  blockChance: number;
  punishChance: number;
  aggression: number;
  superChance: number;
  breakChance: number;
  bossRead: number;
}

export const AI_DIFFICULTY_PROFILES: Record<Difficulty, AiProfile> = {
  easy: {
    reaction: 0.42,
    blockChance: 0.18,
    punishChance: 0.2,
    aggression: 0.45,
    superChance: 0.35,
    breakChance: 0.08,
    bossRead: 0.2,
  },
  normal: {
    reaction: 0.26,
    blockChance: 0.45,
    punishChance: 0.5,
    aggression: 0.65,
    superChance: 0.7,
    breakChance: 0.3,
    bossRead: 0.35,
  },
  hard: {
    reaction: 0.14,
    bossReaction: 0.06,
    blockChance: 0.75,
    punishChance: 0.85,
    aggression: 0.8,
    superChance: 1.0,
    breakChance: 0.6,
    bossRead: 0.8,
  },
};

export class CpuAi {
  private readonly tier: AiProfile;
  private readonly rng: SeededRng;
  private cooldown = 0;
  private holdMoveX = 0;
  private holdDown = false;
  private holdUp = false;
  private holdTimer = 0;
  private pendingGrab = false;
  private pendingPunch = false;
  private pendingKick = false;
  private pendingSuper = false;

  constructor(difficulty: Difficulty, seed = 4242) {
    this.tier = AI_DIFFICULTY_PROFILES[difficulty];
    this.rng = new SeededRng(seed);
  }

  step(
    ai: FighterController,
    opp: FighterController,
    hazardCowNear = false,
  ): PlayerInput {
    this.cooldown = Math.max(0, this.cooldown - FIXED_DT);
    this.holdTimer = Math.max(0, this.holdTimer - FIXED_DT);

    const out: PlayerInput = {
      moveX: this.holdTimer > 0 ? this.holdMoveX : 0,
      up: false,
      down: this.holdTimer > 0 ? this.holdDown : false,
      punch: false,
      kick: false,
      grab: false,
      super: false,
    };

    if (this.holdTimer > 0 && this.holdUp) {
      out.up = true;
      this.holdUp = false;
    }

    // Immediate jump over incoming cow stampede hazard
    if (hazardCowNear && ai.grounded && ai.state !== 'hitstun' && ai.state !== 'knockdown') {
      out.up = true;
      out.moveX = ai.facing;
      return out;
    }

    if (this.pendingSuper) {
      this.pendingSuper = false;
      out.super = true;
      return out;
    }
    if (this.pendingGrab) {
      this.pendingGrab = false;
      out.grab = true;
      return out;
    }
    if (this.pendingPunch) {
      this.pendingPunch = false;
      out.punch = true;
    }
    if (this.pendingKick) {
      this.pendingKick = false;
      out.kick = true;
    }

    if (this.cooldown > 0) {
      return out;
    }

    const rx = ai.isBoss ? (this.tier.bossReaction ?? this.tier.reaction * 0.7) : this.tier.reaction;
    this.cooldown = rx * (0.85 + this.rng.next() * 0.35);

    const dist = Math.abs(opp.x - ai.x);
    const oppDir: 1 | -1 = opp.x >= ai.x ? 1 : -1;

    // 1. Tech enemy grab
    if (opp.attack?.moveId === 'grab' && dist < 1.15 && this.rng.next() < this.tier.breakChance) {
      this.pendingGrab = true;
      return out;
    }

    // 2. React defensively to enemy attack
    if (opp.state === 'attack' && dist < 1.65) {
      const readChance = ai.isBoss ? Math.max(this.tier.blockChance, this.tier.bossRead) : this.tier.blockChance;
      if (this.rng.next() < readChance) {
        this.holdMoveX = -oppDir;
        this.holdDown = opp.currentMove?.guardHeight === 'low';
        this.holdTimer = 0.28;
        out.moveX = this.holdMoveX;
        out.down = this.holdDown;
        return out;
      }
    }

    // 3. Fire SHAKTI super when full
    if (ai.meter >= 100 && dist < 2.3 && this.rng.next() < this.tier.superChance) {
      this.pendingSuper = true;
      return out;
    }

    // 4. Punish recovering / whiffing opponent
    if ((opp.attackPhase === 'recovery' || opp.state === 'blockstun') && dist < 1.35) {
      if (this.rng.next() < this.tier.punishChance) {
        this.holdMoveX = oppDir;
        this.holdTimer = 0.16;
        if (this.rng.next() < 0.55) {
          this.pendingPunch = true;
        } else {
          this.pendingKick = true;
        }
        return out;
      }
    }

    // 5. Close range offensive mixup / grab / sweep / chain
    if (dist <= 0.95) {
      const roll = this.rng.next();
      if (opp.isLow && opp.state === 'crouch' && roll < 0.35) {
        this.pendingKick = true; // mid hits crouch blockers
      } else if (roll < 0.18) {
        this.pendingGrab = true;
      } else if (roll < 0.42) {
        this.holdDown = true;
        this.holdTimer = 0.2;
        this.pendingKick = true; // low sweep mixup
      } else if (roll < 0.72) {
        this.pendingPunch = true;
      } else {
        this.pendingKick = true;
      }
      return out;
    }

    // 6. Mid-range poke / approach / jump-in
    if (dist <= 1.85) {
      if (this.rng.next() < this.tier.aggression) {
        this.holdMoveX = oppDir;
        this.holdTimer = 0.24;
        out.moveX = oppDir;
        if (this.rng.next() < 0.45) {
          out.kick = true; // special2 forward lunge
        } else if (this.rng.next() < 0.2) {
          this.holdUp = true; // jump-in
        }
      } else {
        this.holdMoveX = -oppDir;
        this.holdTimer = 0.22;
      }
      return out;
    }

    // 7. Far range closing distance
    this.holdMoveX = oppDir;
    this.holdTimer = 0.3;
    out.moveX = oppDir;
    return out;
  }
}
