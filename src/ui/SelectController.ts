import type { Difficulty, FighterId, StageId } from '../core/types';
import { BOSS_ID, FIGHTER_ROSTER, ROSTER_ORDER } from '../characters/roster';
import { UI_LABELS_CONFIG } from '../characters/characterConfigs';
import type { PortraitFactory } from '../rendering/PortraitFactory';

export interface SelectCallbacks {
  onChange?: (p1: FighterId, p2: FighterId, stage: StageId, difficulty: Difficulty) => void;
  onFight?: () => void;
  onOpenOnline?: () => void;
  onLeaveOnline?: () => void;
}

export class SelectController {
  p1: FighterId = 'kratos';
  p2: FighterId = 'wukong';
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
      const isBossTile = id === BOSS_ID;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `tile${isBossTile ? ' boss' : ''}`;
      btn.dataset.tile = id;
      btn.style.setProperty('--accent', f.accent);
      btn.innerHTML = `
        ${isBossTile ? `<span class="boss-tag">${UI_LABELS_CONFIG.bossBadge}</span>` : ''}
        <img alt="${f.fullName}" />
        <span class="tile-name">${f.name}</span>
        <i class="cur p1">1P</i>
        <i class="cur p2">CPU</i>
      `;
      this.portraits.bindPortraitImage(btn.querySelector('img') as HTMLImageElement, id);
      btn.addEventListener('click', () => this.handleTileClick(id));
      this.tiles.set(id, btn);
      this.gridEl.appendChild(btn);
    }

    const randBtn = document.createElement('button');
    randBtn.type = 'button';
    randBtn.className = 'tile random';
    randBtn.dataset.tile = 'random';
    randBtn.style.setProperty('--accent', '#ffe3a0');
    randBtn.innerHTML = `<span class="tile-q">?</span><span class="tile-name">${UI_LABELS_CONFIG.randomLabel}</span>`;
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
        if (id === BOSS_ID && !this.bapuUnlocked) {
          this.p2 = BOSS_ID; // Allow picking Boss as opponent even before unlock
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
    const pool = ROSTER_ORDER.filter((id) => id !== BOSS_ID || this.bapuUnlocked);
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
    const pool = ROSTER_ORDER.filter((id) => id !== BOSS_ID || this.bapuUnlocked);
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
      btn.classList.toggle('locked', id === BOSS_ID && !this.bapuUnlocked);
      const p2Tag = btn.querySelector('.cur.p2') as HTMLElement;
      p2Tag.textContent = this.onlineRole ? 'P2' : id === BOSS_ID ? UI_LABELS_CONFIG.bossBadge : 'CPU';
    }

    const f1 = FIGHTER_ROSTER[this.p1];
    const f2 = FIGHTER_ROSTER[this.p2];
    this.p1Card.style.setProperty('--accent', f1.accent);
    this.p2Card.style.setProperty('--accent', f2.accent);
    (this.p1Card.querySelector('.card-role') as HTMLElement).textContent = this.onlineRole === 'guest' ? 'P1 · HOST' : '1P · YOU';
    (this.p1Card.querySelector('.card-name') as HTMLElement).textContent = f1.name;
    (this.p1Card.querySelector('.card-party') as HTMLElement).textContent = f1.party;
    (this.p1Card.querySelector('.card-super') as HTMLElement).textContent = `SUPER · ${f1.superName}`;
    (this.p1Card.querySelector('.card-desc') as HTMLElement).textContent = f1.superDesc;

    (this.p2Card.querySelector('.card-role') as HTMLElement).textContent =
      this.onlineRole === 'guest'
        ? 'P2 · YOU'
        : this.onlineRole === 'host'
          ? 'P2 · FRIEND'
          : this.p2 === BOSS_ID
            ? 'FINAL BOSS'
            : 'CPU';
    (this.p2Card.querySelector('.card-name') as HTMLElement).textContent = f2.name;
    (this.p2Card.querySelector('.card-party') as HTMLElement).textContent = f2.party;
    (this.p2Card.querySelector('.card-super') as HTMLElement).textContent = `SUPER · ${f2.superName}`;
    (this.p2Card.querySelector('.card-desc') as HTMLElement).textContent = f2.superDesc;

    const prompt = document.getElementById('pick-prompt');
    if (prompt) {
      prompt.textContent = this.pickTarget === 2 ? UI_LABELS_CONFIG.pickPromptP2 : UI_LABELS_CONFIG.pickPromptP1;
      prompt.classList.toggle('p2', this.pickTarget === 2);
    }

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
