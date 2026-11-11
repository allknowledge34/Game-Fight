import type { CombatEvent, PlayerInput } from '../core/types';
import {
  isLegalAccepted,
  loadBapuProgress,
  recordMatchWinForBapu,
  setLegalAccepted,
} from '../core/storage';
import { FIGHTER_ROSTER } from '../characters/roster';
import { AudioEngine } from '../audio/AudioEngine';
import { InputManager } from '../input/InputManager';
import { PortraitFactory } from '../rendering/PortraitFactory';
import { ThreeScene } from '../rendering/ThreeScene';
import { BattleSimulation, emptyInput } from '../simulation/BattleSimulation';
import { FIXED_DT } from '../physics/FighterController';
import { HudController } from '../ui/HudController';
import { SelectController } from '../ui/SelectController';
import { buildNewspaperResult } from '../ui/NewsdeskData';
import { NetClient } from '../multiplayer/NetClient';

type ScreenName = 'loading' | 'title' | 'select' | 'online' | 'fight' | 'pause' | 'result';

export class GameApp {
  private readonly audio = new AudioEngine();
  private readonly input = new InputManager();
  private readonly portraits = new PortraitFactory();
  private readonly scene: ThreeScene;
  private readonly hud: HudController;
  private readonly select: SelectController;
  private readonly net: NetClient;

  private sim: BattleSimulation;
  private screen: ScreenName = 'loading';
  private paused = false;
  private clock = 0;
  private acc = 0;
  private lastRaf = 0;
  private rafId = 0;
  private lastRoundSeen = 1;
  private remoteInputs = new Map<number, PlayerInput>();
  private lastRemoteInput: PlayerInput = emptyInput();
  private matchSnapshotUrl = '';
  private bapuUnlockedThisMatch = false;

  // Screen elements
  private readonly screens: Record<ScreenName, HTMLElement> = {
    loading: document.getElementById('loading')!,
    title: document.getElementById('title')!,
    select: document.getElementById('select')!,
    online: document.getElementById('online')!,
    fight: document.getElementById('hud')!,
    pause: document.getElementById('pause')!,
    result: document.getElementById('result')!,
  };

  private readonly legalEl = document.getElementById('legal')!;
  private readonly touchEl = document.getElementById('touch')!;
  private readonly rotateEl = document.getElementById('rotate')!;
  private readonly netAwayEl = document.getElementById('net-away')!;
  private readonly netAwayMsg = document.getElementById('net-away-msg')!;
  private readonly soundBtn = document.getElementById('sound-btn') as HTMLButtonElement;
  private readonly pauseSoundBtn = document.getElementById('pause-sound-btn') as HTMLButtonElement;
  private readonly loadFill = document.getElementById('load-fill') as HTMLElement;

  constructor(canvas: HTMLCanvasElement) {
    this.portraits.warmAll();
    this.scene = new ThreeScene(canvas);
    this.hud = new HudController(this.portraits);

    this.select = new SelectController(this.portraits, {
      onChange: (p1, p2, stage, diff) => {
        this.audio.uiTap();
        this.syncPreviewSimulation();
        if (this.net.role) {
          this.net.sendLobby({ p1, p2, stage, difficulty: diff });
        }
      },
      onFight: () => this.startMatchFromSelect(),
      onOpenOnline: () => {
        this.audio.uiTap();
        this.openOnlineModal();
      },
      onLeaveOnline: () => this.leaveOnlineRoom(),
    });
    this.select.bapuUnlocked = loadBapuProgress().unlocked;
    this.select.refresh();

    this.net = new NetClient({
      onPeerJoined: () => {
        this.select.setOnlineMode('host', `ROOM ${this.net.code} · FRIEND JOINED!`);
        this.net.sendLobby({
          p1: this.select.p1,
          p2: this.select.p2,
          stage: this.select.stage,
          difficulty: this.select.difficulty,
        });
        if (this.screen === 'online') {
          this.setScreen('select');
        }
      },
      onLobby: (lobby) => {
        if (lobby.p1) this.select.p1 = lobby.p1;
        if (lobby.p2) this.select.p2 = lobby.p2;
        if (lobby.stage) this.select.stage = lobby.stage;
        if (lobby.difficulty) this.select.difficulty = lobby.difficulty;
        this.select.refresh();
        this.syncPreviewSimulation();
      },
      onStart: (lobby, seed) => {
        this.select.p1 = lobby.p1;
        this.select.p2 = lobby.p2;
        this.select.stage = lobby.stage;
        this.select.difficulty = lobby.difficulty;
        this.select.refresh();
        this.launchFight(true, seed);
      },
      onRemoteInput: (tick, remoteIn) => {
        this.remoteInputs.set(tick, remoteIn);
        this.lastRemoteInput = remoteIn;
      },
      onSnapshot: (snap) => {
        if (this.net.role === 'guest' && this.screen === 'fight') {
          const prevPhase = this.sim.phase;
          const prevHp0 = this.sim.fighters[0].hp;
          const prevHp1 = this.sim.fighters[1].hp;
          this.sim.applySnapshot(snap);
          if (snap.fighters[0].hp < prevHp0 || snap.fighters[1].hp < prevHp1) {
            this.scene.cameraCtrl.shake(0.18, 0.25);
            this.audio.hit(0.9);
          }
          if (prevPhase !== 'ko' && snap.phase === 'ko') {
            this.audio.ko();
            this.hud.flash('rgba(255,255,255,0.6)', 240);
            this.hud.say('K.O.!', 'ko', 1600);
            if (!this.matchSnapshotUrl) {
              this.matchSnapshotUrl = this.scene.captureSnapshotDataUrl();
            }
          }
          if (prevPhase !== 'matchEnd' && snap.phase === 'matchEnd') {
            this.showResultScreen();
          }
        }
      },
      onRematch: () => {
        if (this.screen === 'result') {
          this.launchFight(false, Math.floor(Math.random() * 100000));
        }
      },
      onEnd: (reason) => {
        if (this.select.onlineRole) {
          this.netAwayMsg.textContent = reason;
          this.netAwayEl.classList.remove('hidden');
        }
      },
    });

    this.sim = new BattleSimulation({
      p1: this.select.p1,
      p2: this.select.p2,
      stage: this.select.stage,
      difficulty: this.select.difficulty,
      mode: 'cpu',
    });

    this.bindUiHandlers();
    this.input.bindTouchOverlay(this.touchEl);
    this.updateSoundLabel();
    this.updateViewport();
    this.startLoop();
  }

  private bindUiHandlers(): void {
    // Legal notice
    const legalBtn = document.getElementById('legal-ok') as HTMLButtonElement;
    if (isLegalAccepted()) {
      this.legalEl.classList.add('hidden');
      this.beginLoadingSequence();
    } else {
      for (const el of Object.values(this.screens)) {
        el.setAttribute('inert', '');
      }
      legalBtn.focus();
      legalBtn.addEventListener('click', () => {
        setLegalAccepted(true);
        for (const el of Object.values(this.screens)) {
          el.removeAttribute('inert');
        }
        this.audio.unlock();
        this.audio.uiConfirm();
        this.legalEl.classList.add('hidden');
        this.beginLoadingSequence();
      });
    }

    // Title
    const enterTitle = () => {
      if (this.screen !== 'title') return;
      this.audio.unlock();
      this.audio.uiConfirm();
      this.audio.setTrack('background');
      this.setScreen('select');
    };
    document.getElementById('title-start-btn')!.addEventListener('click', enterTitle);
    this.screens.title.addEventListener('click', enterTitle);

    // Sound buttons
    const toggleMute = () => {
      this.audio.unlock();
      this.audio.toggleMute();
      this.updateSoundLabel();
    };
    this.soundBtn.addEventListener('click', toggleMute);
    this.pauseSoundBtn.addEventListener('click', toggleMute);

    // Pause / Resume / Quit
    document.getElementById('pause-btn')!.addEventListener('click', () => this.togglePause());
    document.getElementById('resume-btn')!.addEventListener('click', () => this.setPaused(false));
    document.getElementById('quit-btn')!.addEventListener('click', () => {
      this.setPaused(false);
      this.audio.setTrack('background');
      this.setScreen('select');
      this.syncPreviewSimulation();
    });

    // Budget button click triggers budget edge on next step
    document.getElementById('budget-meter')!.addEventListener('click', () => {
      if (this.screen === 'fight' && this.sim.vsBoss && this.sim.budget >= 1) {
        const cur = this.input.sample();
        cur.budget = true;
        this.sim.stepFrame(cur);
      }
    });

    // Result actions
    document.getElementById('rematch-btn')!.addEventListener('click', () => {
      this.audio.uiConfirm();
      if (this.net.role) {
        this.net.sendRematch();
      }
      this.launchFight(false);
    });
    document.getElementById('select-btn')!.addEventListener('click', () => {
      this.audio.uiBack();
      this.audio.setTrack('background');
      this.setScreen('select');
      this.syncPreviewSimulation();
    });

    // Online Modal controls
    const onHome = document.getElementById('on-home')!;
    const onHosting = document.getElementById('on-hosting')!;
    const onError = document.getElementById('on-error')!;
    const onCodeDisplay = document.getElementById('on-room-code')!;
    const onCodeInput = document.getElementById('on-code') as HTMLInputElement;
    const onErrText = document.getElementById('on-error-text')!;

    document.getElementById('on-host')!.addEventListener('click', async () => {
      this.audio.uiConfirm();
      try {
        const code = await this.net.hostRoom();
        onCodeDisplay.textContent = code;
        onHome.classList.add('hidden');
        onError.classList.add('hidden');
        onHosting.classList.remove('hidden');
        this.select.setOnlineMode('host', `ROOM ${code} · WAITING FOR FRIEND`);
      } catch (err) {
        onHome.classList.add('hidden');
        onHosting.classList.add('hidden');
        onError.classList.remove('hidden');
        onErrText.textContent = err instanceof Error ? err.message : 'Unable to host room.';
      }
    });

    document.getElementById('on-copy')!.addEventListener('click', async () => {
      const link = `${window.location.origin}/?room=${this.net.code}`;
      try {
        await navigator.clipboard.writeText(link);
        (document.getElementById('on-copy') as HTMLButtonElement).textContent = 'Link Copied!';
      } catch {
        (document.getElementById('on-copy') as HTMLButtonElement).textContent = link;
      }
    });

    document.getElementById('on-join-form')!.addEventListener('submit', async (e) => {
      e.preventDefault();
      this.audio.uiConfirm();
      try {
        const { code, lobby } = await this.net.joinRoom(onCodeInput.value);
        this.select.p1 = lobby.p1;
        this.select.p2 = lobby.p2;
        this.select.stage = lobby.stage;
        this.select.difficulty = lobby.difficulty;
        this.select.setOnlineMode('guest', `ROOM ${code} · CONNECTED AS P2`);
        this.setScreen('select');
        this.syncPreviewSimulation();
      } catch (err) {
        onHome.classList.add('hidden');
        onHosting.classList.add('hidden');
        onError.classList.remove('hidden');
        onErrText.textContent = err instanceof Error ? err.message : 'Could not join room.';
      }
    });

    document.getElementById('on-retry')!.addEventListener('click', () => {
      onError.classList.add('hidden');
      onHosting.classList.add('hidden');
      onHome.classList.remove('hidden');
    });

    document.getElementById('on-back')!.addEventListener('click', () => {
      this.audio.uiBack();
      if (!this.net.peerConnected && this.net.role === 'host') {
        this.leaveOnlineRoom();
      }
      this.setScreen('select');
    });

    document.getElementById('net-away-leave')!.addEventListener('click', () => {
      this.netAwayEl.classList.add('hidden');
      this.leaveOnlineRoom();
      this.setScreen('select');
    });

    // Global keyboard shortcuts
    this.input.onShortcut = (code) => {
      this.audio.unlock();
      if (this.screen === 'title' && (code === 'Enter' || code === 'Space')) {
        enterTitle();
      } else if (this.screen === 'select') {
        if (code === 'ArrowLeft') this.select.stepP1(-1);
        else if (code === 'ArrowRight') this.select.stepP1(1);
        else if (code === 'ArrowUp') this.select.stepP2(-1);
        else if (code === 'ArrowDown') this.select.stepP2(1);
        else if (code === 'KeyT') this.select.cycleStage();
        else if (code === 'Digit1') this.select.setDifficulty('easy');
        else if (code === 'Digit2') this.select.setDifficulty('normal');
        else if (code === 'Digit3') this.select.setDifficulty('hard');
        else if (code === 'Enter') this.startMatchFromSelect();
      } else if (this.screen === 'fight' && code === 'Escape') {
        this.togglePause();
      } else if (this.screen === 'pause' && code === 'Escape') {
        this.setPaused(false);
      } else if (code === 'KeyN') {
        toggleMute();
      } else if (code === 'KeyM') {
        this.audio.toggleMusic();
      }
    };

    window.addEventListener('resize', () => this.updateViewport());
  }

  private beginLoadingSequence(): void {
    this.setScreen('loading');
    this.loadFill.style.transform = 'scaleX(0.35)';
    window.setTimeout(() => {
      this.loadFill.style.transform = 'scaleX(0.85)';
      this.syncPreviewSimulation();
    }, 120);
    window.setTimeout(() => {
      this.loadFill.style.transform = 'scaleX(1)';
      this.setScreen('title');
      this.audio.setTrack('intro');
    }, 320);
  }

  private openOnlineModal(): void {
    document.getElementById('on-home')!.classList.remove('hidden');
    document.getElementById('on-hosting')!.classList.add('hidden');
    document.getElementById('on-error')!.classList.add('hidden');
    this.setScreen('online');
  }

  private leaveOnlineRoom(): void {
    this.net.close(true);
    this.select.setOnlineMode(null);
    this.remoteInputs.clear();
  }

  private startMatchFromSelect(): void {
    this.audio.unlock();
    this.audio.uiConfirm();
    const seed = Math.floor(Math.random() * 1_000_000) + 1;
    if (this.net.role === 'host') {
      if (!this.net.peerConnected) return;
      this.net.sendStart(
        {
          p1: this.select.p1,
          p2: this.select.p2,
          stage: this.select.stage,
          difficulty: this.select.difficulty,
        },
        seed,
      );
      this.launchFight(true, seed);
    } else if (this.net.role === 'guest') {
      return;
    } else {
      this.launchFight(false, seed);
    }
  }

  private launchFight(online: boolean, seed = 202611): void {
    this.setPaused(false);
    this.remoteInputs.clear();
    this.lastRemoteInput = emptyInput();
    this.bapuUnlockedThisMatch = false;
    this.matchSnapshotUrl = '';

    this.sim = new BattleSimulation({
      p1: this.select.p1,
      p2: this.select.p2,
      stage: this.select.stage,
      difficulty: this.select.difficulty,
      mode: online ? 'online' : 'cpu',
      isHost: this.net.role === 'host',
      seed,
    });
    this.scene.setStage(this.select.stage);
    this.lastRoundSeen = 1;
    const modeTag = !online ? 'CPU' : this.net.role === 'guest' ? 'GUEST' : 'P2';
    this.hud.initMatch(this.select.p1, this.select.p2, modeTag);
    this.hud.say('ROUND 1', 'round', 1100);
    this.audio.setTrack('battle');
    this.setScreen('fight');
  }

  private syncPreviewSimulation(): void {
    this.scene.setStage(this.select.stage);
    this.sim = new BattleSimulation(
      {
        p1: this.select.p1,
        p2: this.select.p2,
        stage: this.select.stage,
        difficulty: this.select.difficulty,
        mode: 'cpu',
      },
      false,
    );
    this.sim.fighters[0].forceState('intro');
    this.sim.fighters[1].forceState('intro');
  }

  private setScreen(next: ScreenName): void {
    this.screen = next;
    const isModal = next === 'online' || next === 'pause';
    for (const [key, el] of Object.entries(this.screens) as [ScreenName, HTMLElement][]) {
      const hidden = key !== next;
      el.classList.toggle('hidden', hidden);
      if (isModal && key !== next) {
        el.setAttribute('inert', '');
      } else {
        el.removeAttribute('inert');
      }
    }
    this.hud.setVisible(next === 'fight' || next === 'pause');
    this.updateViewport();
    if (next === 'title') {
      (document.getElementById('title-start-btn') as HTMLButtonElement).focus();
    } else if (next === 'online') {
      (document.getElementById('on-host') as HTMLButtonElement).focus();
    } else if (next === 'pause') {
      (document.getElementById('resume-btn') as HTMLButtonElement).focus();
    } else if (next === 'result') {
      (document.getElementById('rematch-btn') as HTMLButtonElement).focus();
    }
  }

  private togglePause(): void {
    if (this.screen === 'fight') this.setPaused(true);
    else if (this.screen === 'pause') this.setPaused(false);
  }

  private setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    this.audio.setPaused(paused);
    if (paused) {
      this.input.clearAll();
      this.setScreen('pause');
    } else if (this.screen === 'pause') {
      this.setScreen('fight');
    }
  }

  private updateSoundLabel(): void {
    this.soundBtn.textContent = this.audio.muted ? '🔇' : '🔊';
    this.pauseSoundBtn.textContent = `SOUND: ${this.audio.muted ? 'OFF' : 'ON'}`;
  }

  private updateViewport(): void {
    this.scene.resize();
    const touchCapable = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    const isPortrait = window.innerHeight > window.innerWidth;
    const inFight = this.screen === 'fight';
    this.touchEl.classList.toggle('hidden', !(touchCapable && inFight && !isPortrait));
    this.rotateEl.classList.toggle('hidden', !(touchCapable && isPortrait));
  }

  private processSimulationEvents(events: CombatEvent[]): void {
    for (const ev of events) {
      if (ev.kind === 'roundStart') {
        if (this.sim.rounds.round !== this.lastRoundSeen) {
          this.lastRoundSeen = this.sim.rounds.round;
          this.hud.say(`ROUND ${this.lastRoundSeen}`, 'round', 900);
        }
        window.setTimeout(() => {
          if (this.screen === 'fight' && this.sim.phase === 'fight') {
            this.hud.say('FIGHT!', 'fight', 750);
          }
        }, 120);
      } else if (ev.kind === 'hit') {
        const atkSide = ev.side ?? 0;
        const atkId = this.sim.fighters[atkSide].profile.id;
        const defId = this.sim.fighters[ev.targetSide ?? 1].profile.id;
        const pos = this.scene.projectToScreen(ev.x ?? 0, ev.y ?? 1.2);
        this.scene.particles.hitSpark(ev.x ?? 0, ev.y ?? 1.2, (ev.damage ?? 0) >= 11, this.sim.fighters[atkSide].facing);
        this.scene.cameraCtrl.shake((ev.damage ?? 5) >= 11 ? 0.22 : 0.08, 0.22);
        this.audio.hit((ev.damage ?? 5) / 10);
        this.hud.spawnPopup(
          ev.combo && ev.combo >= 2 ? `${ev.combo} HIT! -${ev.damage}` : `${ev.text} -${ev.damage}`,
          pos.x,
          pos.y,
          ev.color,
        );
        this.hud.triggerNewsReaction(atkId, defId, ev.text ?? 'STRIKE');
      } else if (ev.kind === 'block') {
        this.scene.particles.blockSpark(ev.x ?? 0, ev.y ?? 1.1);
        this.audio.block();
        const pos = this.scene.projectToScreen(ev.x ?? 0, (ev.y ?? 1) + 0.35);
        this.hud.spawnPopup('BLOCKED', pos.x, pos.y, '#93c5fd');
      } else if (ev.kind === 'grappleBreak') {
        this.audio.block();
        const pos = this.scene.projectToScreen(ev.x ?? 0, 1.5);
        this.hud.spawnPopup('TECH BREAK!', pos.x, pos.y, '#fde047');
      } else if (ev.kind === 'superStart' || ev.kind === 'budgetStart') {
        const side = ev.side ?? 0;
        const id = this.sim.fighters[side].profile.id;
        this.audio.superSting();
        this.hud.flash('rgba(255, 210, 100, 0.45)', 220);
        this.hud.showSuperBanner(id, side, ev.kind === 'budgetStart' ? 'NIRMALA BUDGET!' : undefined);
        this.hud.triggerNewsReaction(
          id,
          this.sim.fighters[side === 0 ? 1 : 0].profile.id,
          ev.text ?? 'SUPER',
          true,
        );
      } else if (ev.kind === 'cowHit' || ev.kind === 'bombExplode') {
        this.audio.boom();
        this.scene.cameraCtrl.shake(0.32, 0.35);
        const pos = this.scene.projectToScreen(ev.x ?? 0, 1.5);
        this.hud.spawnPopup(ev.text ?? 'BOOM!', pos.x, pos.y, '#ff5a36');
      } else if (ev.kind === 'mithaiPickup') {
        this.audio.uiConfirm();
        const pos = this.scene.projectToScreen(ev.x ?? 0, 1.5);
        this.hud.spawnPopup('+18 HP!', pos.x, pos.y, '#4ade80');
      } else if (ev.kind === 'ko') {
        this.audio.ko();
        this.hud.flash('rgba(255,255,255,0.6)', 240);
        this.hud.say(ev.text ?? 'K.O.!', 'ko', 1600);
        if (this.sim.rounds.finished && !this.matchSnapshotUrl) {
          this.matchSnapshotUrl = this.scene.captureSnapshotDataUrl();
        }
      } else if (ev.kind === 'matchEnd') {
        const wSide = ev.side ?? 0;
        const localSide = this.net.role === 'guest' ? 1 : 0;
        this.audio.winJingle(wSide === localSide);
        if (this.sim.options.mode === 'cpu') {
          this.bapuUnlockedThisMatch = recordMatchWinForBapu(wSide === 0, wSide === 0 && this.sim.fighters[1].isBoss);
          this.select.bapuUnlocked = loadBapuProgress().unlocked;
          this.select.refresh();
        }
        window.setTimeout(() => {
          if (this.screen === 'fight' && this.sim.phase === 'matchEnd') {
            this.showResultScreen();
          }
        }, 900);
      }
    }
  }

  private showResultScreen(): void {
    const snap = this.sim.exportSnapshot();
    const wSide: 0 | 1 = snap.matchWinner ?? (snap.wins[0] >= snap.wins[1] ? 0 : 1);
    const lSide: 0 | 1 = wSide === 0 ? 1 : 0;
    const wId = snap.fighters[wSide].id;
    const lId = snap.fighters[lSide].id;
    const draw = snap.wins[0] === snap.wins[1] && snap.matchWinner === null;

    const news = buildNewspaperResult(wId, lId, snap.wins, draw);
    document.getElementById('paper-masthead')!.textContent = news.masthead;
    document.getElementById('paper-headline')!.textContent = news.headline;
    document.getElementById('paper-sub')!.textContent = news.sub;
    document.getElementById('paper-excuse')!.textContent = news.excuse;
    document.getElementById('paper-caption')!.textContent = news.caption;

    const photo = document.getElementById('paper-photo') as HTMLImageElement;
    photo.src = this.matchSnapshotUrl || this.scene.captureSnapshotDataUrl() || this.portraits.getFighterPortrait(wId);

    const localSide = this.net.role === 'guest' ? 1 : 0;
    document.getElementById('result-title')!.textContent = draw
      ? 'DRAW!'
      : wSide === localSide
        ? 'YOU WIN!'
        : `${FIGHTER_ROSTER[wId].name} WINS!`;

    const statsEl = document.getElementById('bapu-stats')!;
    if (this.bapuUnlockedThisMatch) {
      statsEl.classList.remove('hidden');
      statsEl.textContent = 'MBAPU UNLOCKED! Available now in Character Select.';
    } else {
      statsEl.classList.add('hidden');
    }

    this.setScreen('result');
  }

  private startLoop(): void {
    this.lastRaf = performance.now();
    const tickFrame = (now: number) => {
      this.rafId = window.requestAnimationFrame(tickFrame);
      const dt = Math.min(0.05, Math.max(0.001, (now - this.lastRaf) / 1000));
      this.lastRaf = now;

      if (!this.paused) {
        this.clock += dt;
        if (this.screen === 'fight') {
          this.acc += dt;
          while (this.acc >= FIXED_DT) {
            this.acc -= FIXED_DT;
            const localInput = this.input.sample();
            if (this.net.role === 'host') {
              const p2In = this.remoteInputs.get(this.sim.tick) ?? this.lastRemoteInput;
              const events = this.sim.stepFrame(localInput, p2In);
              this.processSimulationEvents(events);
              if (this.sim.tick % 2 === 0) {
                this.net.sendSnapshot(this.sim.exportSnapshot());
              }
            } else if (this.net.role === 'guest') {
              this.net.sendInput(this.sim.tick, localInput);
              // Gentle predictive local timer smoothing while host remains authoritative
              this.sim.phaseTime += FIXED_DT;
            } else {
              const events = this.sim.stepFrame(localInput);
              this.processSimulationEvents(events);
            }
          }
        }
      }

      const snap = this.sim.exportSnapshot();
      const preview = this.screen !== 'fight' && this.screen !== 'pause';
      this.scene.syncFighters(snap, this.clock, dt, preview);
      if (this.screen === 'fight' || this.screen === 'pause') {
        this.hud.update(snap, this.sim.vsBoss, dt);
      }
      this.scene.render();
    };
    this.rafId = window.requestAnimationFrame(tickFrame);
  }

  dispose(): void {
    window.cancelAnimationFrame(this.rafId);
    this.net.close();
    this.input.dispose();
    this.audio.dispose();
    this.scene.dispose();
  }
}
