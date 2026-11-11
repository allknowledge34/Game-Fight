export const ROUND_TIME_SECONDS = 60;
export const ROUNDS_TO_WIN = 2;

export type RoundEndReason = 'ko' | 'timeover' | 'draw';

export interface RoundOutcome {
  winner: 0 | 1 | 'draw';
  reason: RoundEndReason;
  matchWinner: 0 | 1 | null;
}

export class RoundManager {
  round = 1;
  timer = ROUND_TIME_SECONDS;
  wins: [number, number] = [0, 0];
  finished = false;

  resetMatch(): void {
    this.round = 1;
    this.timer = ROUND_TIME_SECONDS;
    this.wins = [0, 0];
    this.finished = false;
  }

  startNextRound(): void {
    this.round += 1;
    this.timer = ROUND_TIME_SECONDS;
  }

  tickTimer(dt: number): boolean {
    if (this.finished) return false;
    this.timer = Math.max(0, this.timer - dt);
    return this.timer <= 0;
  }

  resolveRound(hp0: number, maxHp0: number, hp1: number, maxHp1: number, timeOver = false): RoundOutcome {
    const pct0 = maxHp0 > 0 ? hp0 / maxHp0 : 0;
    const pct1 = maxHp1 > 0 ? hp1 / maxHp1 : 0;

    let winner: 0 | 1 | 'draw' = 'draw';
    let reason: RoundEndReason = timeOver ? 'timeover' : 'ko';

    if (hp0 <= 0 && hp1 <= 0) {
      winner = 'draw';
      reason = 'draw';
    } else if (hp1 <= 0) {
      winner = 0;
    } else if (hp0 <= 0) {
      winner = 1;
    } else if (Math.abs(pct0 - pct1) < 0.0001) {
      winner = 'draw';
      reason = 'draw';
    } else {
      winner = pct0 > pct1 ? 0 : 1;
      reason = 'timeover';
    }

    if (winner !== 'draw') {
      this.wins[winner] += 1;
    }

    const matchWinner: 0 | 1 | null =
      this.wins[0] >= ROUNDS_TO_WIN ? 0 : this.wins[1] >= ROUNDS_TO_WIN ? 1 : null;
    if (matchWinner !== null) {
      this.finished = true;
    }

    return { winner, reason, matchWinner };
  }
}
