import type { Difficulty, FighterId, StageId } from '../core/types';
import { FIGHTER_ROSTER, ROSTER_ORDER } from '../characters/roster';
import type { PortraitFactory } from '../rendering/PortraitFactory';

export interface SelectCallbacks {
  onChange?: (p1: FighterId, p2: FighterId, stage: StageId, difficulty: Difficulty) => void;
  onFight?: () => void;
  onOpenOnline?: () => void;
  onLeaveOnline?: () => void;
}

export class SelectController {
  p1: FighterId = 'modi';
  p2: FighterId = 'rahul';
  stage: StageId = 'sansad';
  difficulty: Difficulty = 'normal';
  bapuUnlocked = false;
  onlineRole: 'host' | 'guest' | null = null;
  pickTarget: 1 | 2 = 1;

  private readonly gridEl = document.getElementById('roster-grid')!;
  private readonly p1Card = document.getElementById('card-p1')!;
  private readonly p2Card = document.getElementById('card-p2')!;
  private readonly fightBtn = document.getElementById('fight-btn') as HTMLButtonElement;
  private readonly onlineBtn = document.getElementById('online-btn') as HTMLButtonElement;
  private readonly onlineBar = document.getElementById('online-bar')!;
  private readonly onlineStatus = document.getElementById('online-status')!;
  private readonly onlineLeaveBtn = document.getElementById('online-leave') as HTMLButtonElement;
  private readonly stageBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-stage]'));
  private readonly diffBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-diff]'));
  private readonly callbacks: SelectCallbacks;
  private readonly portraits: PortraitFactory;
  private tiles = new Map<FighterId, HTMLButtonElement>();

  constructor(portraits: PortraitFactory, callbacks: SelectCallbacks) {
    this.portraits = portraits;
    this.callbacks = callbacks;
    this.renderRoster();
    this.bindControls();
    this.refresh();
  }

  private renderRoster(): void {
    this.gridEl.replaceChildren();
    for (const id of ROSTER_ORDER) {
      const f = FIGHTER_ROSTER[id];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `tile${id === 'mbapu' ? ' boss' : ''}`;
      btn.dataset.tile = id;
      btn.style.setProperty('--accent', f.accent);
      btn.innerHTML = `
        ${id === 'mbapu' ? '<span class="boss-tag">BOSS</span>' : ''}
        <img alt="${f.fullName}" />
        <span class="tile-name">${f.name}</span>
        <i class="cur p1">1P</i>
        <i class="cur p2">CPU</i>
      `;
      (btn.querySelector('img') as HTMLImageElement).src = this.portraits.getFighterPortrait(id);
      btn.addEventListener('click', () => this.handleTileClick(id));
      this.tiles.set(id, btn);
      this.gridEl.appendChild(btn);
    }

    const randBtn = document.createElement('button');
    randBtn.type = 'button';
    randBtn.className = 'tile random';
    randBtn.dataset.tile = 'random';
    randBtn.innerHTML = `<span class="tile-q">?</span><span class="tile-name">RANDOM</span>`;
    randBtn.addEventListener('click', () => this.pickRandom());
    this.gridEl.appendChild(randBtn);
  }

  private bindControls(): void {
    for (const btn of this.stageBtns) {
      btn.addEventListener('click', () => {
        if (this.onlineRole === 'guest') return;
        this.stage = btn.dataset.stage as StageId;
        this.refresh();
        this.emitChange();
      });
    }
    for (const btn of this.diffBtns) {
      btn.addEventListener('click', () => {
        if (this.onlineRole === 'guest') return;
        this.difficulty = btn.dataset.diff as Difficulty;
        this.refresh();
        this.emitChange();
      });
    }
    this.fightBtn.addEventListener('click', () => this.callbacks.onFight?.());
    this.onlineBtn.addEventListener('click', () => this.callbacks.onOpenOnline?.());
    this.onlineLeaveBtn.addEventListener('click', () => this.callbacks.onLeaveOnline?.());
  }

  private handleTileClick(id: FighterId): void {
    if (this.onlineRole === 'host') {
      this.p1 = id;
    } else if (this.onlineRole === 'guest') {
      this.p2 = id;
    } else {
      if (this.pickTarget === 1) {
        if (id === 'mbapu' && !this.bapuUnlocked) {
          this.p2 = 'mbapu'; // Allow picking Mbapu as Boss opponent even before unlock
        } else {
          this.p1 = id;
          this.pickTarget = 2;
        }
      } else {
        this.p2 = id;
        this.pickTarget = 1;
      }
    }
    this.refresh();
    this.emitChange();
  }

  pickRandom(): void {
    const pool = ROSTER_ORDER.filter((id) => id !== 'mbapu' || this.bapuUnlocked);
    if (this.onlineRole !== 'guest') {
      this.p1 = pool[Math.floor(Math.random() * pool.length)];
    }
    if (this.onlineRole !== 'host') {
      const oppPool = ROSTER_ORDER.filter((id) => id !== this.p1);
      this.p2 = oppPool[Math.floor(Math.random() * oppPool.length)];
    }
    this.refresh();
    this.emitChange();
  }

  stepP1(delta: number): void {
    if (this.onlineRole === 'guest') return;
    const pool = ROSTER_ORDER.filter((id) => id !== 'mbapu' || this.bapuUnlocked);
    const idx = Math.max(0, pool.indexOf(this.p1));
    this.p1 = pool[(idx + delta + pool.length) % pool.length];
    this.refresh();
    this.emitChange();
  }

  stepP2(delta: number): void {
    if (this.onlineRole === 'host') return;
    const idx = Math.max(0, ROSTER_ORDER.indexOf(this.p2));
    this.p2 = ROSTER_ORDER[(idx + delta + ROSTER_ORDER.length) % ROSTER_ORDER.length];
    this.refresh();
    this.emitChange();
  }

  cycleStage(): void {
    if (this.onlineRole === 'guest') return;
    const order: StageId[] = ['sansad', 'jantar', 'road'];
    this.stage = order[(order.indexOf(this.stage) + 1) % order.length];
    this.refresh();
    this.emitChange();
  }

  setDifficulty(diff: Difficulty): void {
    if (this.onlineRole === 'guest') return;
    this.difficulty = diff;
    this.refresh();
    this.emitChange();
  }

  setOnlineMode(role: 'host' | 'guest' | null, statusText = ''): void {
    this.onlineRole = role;
    this.onlineBtn.classList.toggle('hidden', role !== null);
    this.onlineBar.classList.toggle('hidden', role === null);
    this.onlineStatus.textContent = statusText;
    this.fightBtn.disabled = role === 'guest';
    this.fightBtn.textContent = role === 'guest' ? 'WAITING FOR HOST…' : 'FIGHT!';
    this.refresh();
  }

  refresh(): void {
    for (const [id, btn] of this.tiles) {
      btn.classList.toggle('p1', this.p1 === id);
      btn.classList.toggle('p2', this.p2 === id);
      btn.classList.toggle('locked', id === 'mbapu' && !this.bapuUnlocked);
      const p2Tag = btn.querySelector('.cur.p2') as HTMLElement;
      p2Tag.textContent = this.onlineRole ? 'P2' : id === 'mbapu' ? 'BOSS' : 'CPU';
    }

    const f1 = FIGHTER_ROSTER[this.p1];
    const f2 = FIGHTER_ROSTER[this.p2];
    (this.p1Card.querySelector('.card-role') as HTMLElement).textContent = this.onlineRole === 'guest' ? 'P1 · HOST' : '1P · YOU';
    (this.p1Card.querySelector('.card-name') as HTMLElement).textContent = f1.name;
    (this.p1Card.querySelector('.card-party') as HTMLElement).textContent = f1.party;
    (this.p1Card.querySelector('.card-super') as HTMLElement).textContent = `SUPER · ${f1.superName}`;
    (this.p1Card.querySelector('.card-desc') as HTMLElement).textContent = f1.superDesc;

    (this.p2Card.querySelector('.card-role') as HTMLElement).textContent =
      this.onlineRole === 'guest' ? 'P2 · YOU' : this.onlineRole === 'host' ? 'P2 · FRIEND' : this.p2 === 'mbapu' ? 'FINAL BOSS' : 'CPU';
    (this.p2Card.querySelector('.card-name') as HTMLElement).textContent = f2.name;
    (this.p2Card.querySelector('.card-party') as HTMLElement).textContent = f2.party;
    (this.p2Card.querySelector('.card-super') as HTMLElement).textContent = `SUPER · ${f2.superName}`;
    (this.p2Card.querySelector('.card-desc') as HTMLElement).textContent = f2.superDesc;

    for (const btn of this.stageBtns) {
      btn.classList.toggle('active', btn.dataset.stage === this.stage);
    }
    for (const btn of this.diffBtns) {
      btn.classList.toggle('active', btn.dataset.diff === this.difficulty);
    }
  }

  private emitChange(): void {
    this.callbacks.onChange?.(this.p1, this.p2, this.stage, this.difficulty);
  }
}
