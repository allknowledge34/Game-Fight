import type { FighterId } from '../core/types';
import type { BattleStateSnapshot } from '../simulation/BattleSimulation';
import { FIGHTER_ROSTER } from '../characters/roster';
import type { PortraitFactory } from '../rendering/PortraitFactory';
import { ANCHORS, FILLER_TICKER, buildNewsReaction } from './NewsdeskData';

export class HudController {
  private readonly hud = document.getElementById('hud')!;
  private readonly announce = document.getElementById('announce')!;
  private readonly flashEl = document.getElementById('flash')!;
  private readonly popups = document.getElementById('popups')!;
  private readonly banner = document.getElementById('super-banner')!;
  private readonly budgetBtn = document.getElementById('budget-meter') as HTMLButtonElement;
  private readonly budgetFill = this.budgetBtn.querySelector('.track i') as HTMLElement;
  private readonly touchBudget = document.getElementById('touch-budget') as HTMLButtonElement | null;
  private readonly timerEl = document.getElementById('timer')!;

  private readonly p1Name = document.getElementById('p1-name')!;
  private readonly p2Name = document.getElementById('p2-name')!;
  private readonly p1Port = document.getElementById('p1-port') as HTMLImageElement;
  private readonly p2Port = document.getElementById('p2-port') as HTMLImageElement;
  private readonly p1Hp = document.getElementById('p1-hp') as HTMLElement;
  private readonly p2Hp = document.getElementById('p2-hp') as HTMLElement;
  private readonly p1Meter = document.getElementById('p1-meter') as HTMLElement;
  private readonly p2Meter = document.getElementById('p2-meter') as HTMLElement;
  private readonly p1Rounds = document.getElementById('p1-rounds')!;
  private readonly p2Rounds = document.getElementById('p2-rounds')!;

  private readonly tickerTrack = document.querySelector('#hud .ticker-track') as HTMLElement;
  private readonly godiRoot = document.querySelector('#newsdesk .anchor.godi') as HTMLElement;
  private readonly trollRoot = document.querySelector('#newsdesk .anchor.troll') as HTMLElement;
  private readonly godiLine = this.godiRoot.querySelector('.line') as HTMLElement;
  private readonly trollLine = this.trollRoot.querySelector('.line') as HTMLElement;

  private tickerX = 900;
  private fillerIdx = 0;
  private lastNewsAt = -10;
  private clearAnchorAt = { godi: 0, troll: 0 };
  private time = 0;
  private portraits: PortraitFactory;

  constructor(portraits: PortraitFactory) {
    this.portraits = portraits;

    (this.godiRoot.querySelector('img') as HTMLImageElement).src = portraits.getAnchorPortrait('godi');
    (this.trollRoot.querySelector('img') as HTMLImageElement).src = portraits.getAnchorPortrait('troll');
    (this.godiRoot.querySelector('.channel') as HTMLElement).textContent = ANCHORS.godi.channel;
    (this.godiRoot.querySelector('.who') as HTMLElement).textContent = ANCHORS.godi.name;
    (this.trollRoot.querySelector('.channel') as HTMLElement).textContent = ANCHORS.troll.channel;
    (this.trollRoot.querySelector('.who') as HTMLElement).textContent = ANCHORS.troll.name;
  }

  setVisible(visible: boolean): void {
    this.hud.classList.toggle('hidden', !visible);
    if (!visible) {
      this.budgetBtn.classList.remove('show', 'ready');
      if (this.touchBudget) this.touchBudget.hidden = true;
      this.announce.className = '';
      this.banner.className = '';
      this.popups.replaceChildren();
    }
  }

  initMatch(p1: FighterId, p2: FighterId, modeTag: 'CPU' | 'P2' | 'GUEST'): void {
    const f1 = FIGHTER_ROSTER[p1];
    const f2 = FIGHTER_ROSTER[p2];

    this.p1Name.textContent = modeTag === 'GUEST' ? `${f1.name} (HOST)` : `${f1.name} (YOU)`;
    this.p2Name.textContent = modeTag === 'GUEST' ? `${f2.name} (YOU)` : `${f2.name} (${modeTag})`;
    this.portraits.bindPortraitImage(this.p1Port, p1);
    this.portraits.bindPortraitImage(this.p2Port, p2);
    this.p1Port.style.borderColor = f1.accent;
    this.p2Port.style.borderColor = f2.accent;

    this.godiLine.textContent = `Round 1! ${f1.fullName} is READY!`;
    this.trollLine.textContent = `Round 1! ${f2.fullName} locked in!`;
    this.tickerTrack.replaceChildren();
    this.tickerX = window.innerWidth * 0.7;
    this.pushTicker(FILLER_TICKER[0], true);
  }

  update(snap: BattleStateSnapshot, vsBoss: boolean, dt: number): void {
    this.time += dt;
    const f0 = snap.fighters[0];
    const f1 = snap.fighters[1];

    const pct0 = Math.max(0, Math.min(1, f0.hp / Math.max(1, f0.maxHp)));
    const pct1 = Math.max(0, Math.min(1, f1.hp / Math.max(1, f1.maxHp)));
    this.p1Hp.style.transform = `scaleX(${pct0})`;
    this.p2Hp.style.transform = `scaleX(${pct1})`;

    this.p1Meter.style.transform = `scaleX(${Math.max(0, Math.min(1, f0.meter / 100))})`;
    this.p2Meter.style.transform = `scaleX(${Math.max(0, Math.min(1, f1.meter / 100))})`;
    this.p1Meter.parentElement?.parentElement?.classList.toggle('ready', f0.meter >= 100);
    this.p2Meter.parentElement?.parentElement?.classList.toggle('ready', f1.meter >= 100);

    this.timerEl.textContent = String(Math.ceil(snap.timer));
    this.timerEl.classList.toggle('low', snap.timer <= 10);

    const dots0 = this.p1Rounds.querySelectorAll('span');
    const dots1 = this.p2Rounds.querySelectorAll('span');
    dots0.forEach((el, idx) => el.classList.toggle('won', idx < snap.wins[0]));
    dots1.forEach((el, idx) => el.classList.toggle('won', idx < snap.wins[1]));

    // Boss Nirmala Budget meter
    const showBudget = vsBoss && snap.phase === 'fight';
    this.budgetBtn.classList.toggle('show', showBudget);
    this.budgetBtn.classList.toggle('ready', showBudget && snap.budget >= 1);
    this.budgetFill.style.transform = `scaleX(${Math.min(1, snap.budget)})`;
    if (this.touchBudget) {
      this.touchBudget.hidden = !vsBoss;
      this.touchBudget.classList.toggle('ready', showBudget && snap.budget >= 1);
    }

    // Newsdesk ticker motion
    if (this.time > this.clearAnchorAt.godi) this.godiRoot.classList.remove('talking');
    if (this.time > this.clearAnchorAt.troll) this.trollRoot.classList.remove('talking');

    this.tickerX -= dt * 95;
    const first = this.tickerTrack.firstElementChild as HTMLElement | null;
    if (first && this.tickerX + first.offsetWidth < 0) {
      this.tickerX += first.offsetWidth;
      first.remove();
    }
    if (this.tickerX + this.tickerTrack.scrollWidth < window.innerWidth + 180) {
      this.fillerIdx = (this.fillerIdx + 1) % FILLER_TICKER.length;
      this.pushTicker(FILLER_TICKER[this.fillerIdx], false);
    }
    this.tickerTrack.style.transform = `translateX(${this.tickerX.toFixed(1)}px)`;
  }

  triggerNewsReaction(attackerId: FighterId, defenderId: FighterId, moveLabel: string, force = false): void {
    if (!force && this.time - this.lastNewsAt < 2.1) return;
    this.lastNewsAt = this.time;
    const msg = buildNewsReaction(attackerId, defenderId, moveLabel);
    this.godiLine.textContent = msg.godi;
    this.trollLine.textContent = msg.troll;
    this.godiRoot.classList.add('talking');
    this.trollRoot.classList.add('talking');
    this.clearAnchorAt.godi = this.time + 2.4;
    this.clearAnchorAt.troll = this.time + 2.4;
    this.pushTicker(msg.ticker, true);
  }

  private pushTicker(text: string, breaking: boolean): void {
    const span = document.createElement('span');
    span.className = breaking ? 'item breaking' : 'item';
    span.textContent = text;
    this.tickerTrack.appendChild(span);
  }

  say(text: string, kind: 'round' | 'fight' | 'ko' = 'fight', ms = 900): void {
    this.announce.textContent = text;
    this.announce.className = `show ${kind}`;
    window.setTimeout(() => {
      if (this.announce.textContent === text) this.announce.className = '';
    }, ms);
  }

  showSuperBanner(id: FighterId, side: 0 | 1, titleOverride?: string): void {
    const f = FIGHTER_ROSTER[id];
    const port = this.portraits.getFighterPortrait(id);
    this.banner.innerHTML = `<img src="${port}" alt=""><div><small>${f.name}</small><span>${titleOverride ?? `${f.superName}!`}</span></div>`;
    this.banner.style.setProperty('--accent', f.accent);
    this.banner.className = `show ${side === 0 ? 'from-left' : 'from-right'}`;
    window.setTimeout(() => {
      this.banner.className = '';
    }, 1700);
  }

  flash(rgba: string, ms = 180): void {
    this.flashEl.style.transition = 'none';
    this.flashEl.style.background = rgba;
    this.flashEl.style.opacity = '1';
    void this.flashEl.offsetWidth;
    this.flashEl.style.transition = `opacity ${ms}ms ease-out`;
    this.flashEl.style.opacity = '0';
  }

  spawnPopup(text: string, screenX: number, screenY: number, color = '#ffd23f'): void {
    const el = document.createElement('div');
    el.className = 'popup';
    el.textContent = text;
    el.style.color = color;
    el.style.left = `${Math.max(60, Math.min(window.innerWidth - 60, screenX))}px`;
    el.style.top = `${Math.max(80, Math.min(window.innerHeight - 100, screenY))}px`;
    this.popups.appendChild(el);
    window.setTimeout(() => el.remove(), 1000);
  }
}
