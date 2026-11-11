import { clamp } from '../core/prng';
import type { PlayerInput } from '../core/types';

export class InputManager {
  private readonly keys = new Set<string>();
  private readonly touchButtons = new Set<'punch' | 'kick' | 'grab' | 'super' | 'budget'>();
  private stickDx = 0;
  private stickDy = 0;
  private stickPointerId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };

  private stickRoot: HTMLElement | null = null;
  private stickKnob: HTMLElement | null = null;
  private cleanups: (() => void)[] = [];

  onShortcut: ((code: string, e: KeyboardEvent) => void) | null = null;

  constructor(targetWindow: Window = window) {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      this.keys.add(e.code);
      if (
        e.code === 'Space' ||
        e.code === 'ArrowUp' ||
        e.code === 'ArrowDown' ||
        e.code === 'ArrowLeft' ||
        e.code === 'ArrowRight'
      ) {
        e.preventDefault();
      }
      if (!e.repeat) {
        this.onShortcut?.(e.code, e);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      this.keys.delete(e.code);
    };

    const onBlur = () => {
      this.keys.clear();
      this.touchButtons.clear();
      this.stickDx = 0;
      this.stickDy = 0;
    };

    targetWindow.addEventListener('keydown', onKeyDown);
    targetWindow.addEventListener('keyup', onKeyUp);
    targetWindow.addEventListener('blur', onBlur);

    this.cleanups.push(() => {
      targetWindow.removeEventListener('keydown', onKeyDown);
      targetWindow.removeEventListener('keyup', onKeyUp);
      targetWindow.removeEventListener('blur', onBlur);
    });
  }

  bindTouchOverlay(root: HTMLElement): void {
    this.stickRoot = root.querySelector('.stick');
    this.stickKnob = root.querySelector('.stick-knob');

    if (this.stickRoot) {
      const s = this.stickRoot;
      const updateStick = (clientX: number, clientY: number) => {
        const radius = Math.max(32, s.clientWidth * 0.42);
        const rawX = clientX - this.stickOrigin.x;
        const rawY = clientY - this.stickOrigin.y;
        const len = Math.hypot(rawX, rawY);
        const clamped = len > radius ? radius / len : 1;
        const dx = clamp((rawX * clamped) / radius, -1, 1);
        const dy = clamp((rawY * clamped) / radius, -1, 1);
        this.stickDx = dx;
        this.stickDy = dy;
        if (this.stickKnob) {
          this.stickKnob.style.transform = `translate(${dx * radius * 0.72}px, ${dy * radius * 0.72}px)`;
        }
      };

      const down = (e: PointerEvent) => {
        if (this.stickPointerId !== null) return;
        this.stickPointerId = e.pointerId;
        s.setPointerCapture(e.pointerId);
        const rect = s.getBoundingClientRect();
        this.stickOrigin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        updateStick(e.clientX, e.clientY);
      };
      const move = (e: PointerEvent) => {
        if (e.pointerId === this.stickPointerId) updateStick(e.clientX, e.clientY);
      };
      const up = (e: PointerEvent) => {
        if (e.pointerId !== this.stickPointerId) return;
        this.stickPointerId = null;
        this.stickDx = 0;
        this.stickDy = 0;
        if (this.stickKnob) this.stickKnob.style.transform = '';
      };

      s.addEventListener('pointerdown', down);
      s.addEventListener('pointermove', move);
      s.addEventListener('pointerup', up);
      s.addEventListener('pointercancel', up);
      this.cleanups.push(() => {
        s.removeEventListener('pointerdown', down);
        s.removeEventListener('pointermove', move);
        s.removeEventListener('pointerup', up);
        s.removeEventListener('pointercancel', up);
      });
    }

    const bindBtn = (selector: string, btn: 'punch' | 'kick' | 'grab' | 'super' | 'budget') => {
      const el = root.querySelector<HTMLElement>(selector);
      if (!el) return;
      const onDown = (e: PointerEvent) => {
        e.preventDefault();
        el.classList.add('active');
        this.touchButtons.add(btn);
      };
      const onUp = () => {
        el.classList.remove('active');
        this.touchButtons.delete(btn);
      };
      el.addEventListener('pointerdown', onDown);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', onUp);
      el.addEventListener('pointerleave', onUp);
      this.cleanups.push(() => {
        el.removeEventListener('pointerdown', onDown);
        el.removeEventListener('pointerup', onUp);
        el.removeEventListener('pointercancel', onUp);
        el.removeEventListener('pointerleave', onUp);
      });
    };

    bindBtn('[data-btn="punch"]', 'punch');
    bindBtn('[data-btn="kick"]', 'kick');
    bindBtn('[data-btn="grab"]', 'grab');
    bindBtn('[data-btn="super"]', 'super');
    bindBtn('#touch-budget', 'budget');
  }

  sample(): PlayerInput {
    const left = this.keys.has('KeyA') || this.keys.has('ArrowLeft') || this.stickDx < -0.38;
    const right = this.keys.has('KeyD') || this.keys.has('ArrowRight') || this.stickDx > 0.38;
    const up = this.keys.has('KeyW') || this.keys.has('ArrowUp') || this.stickDy < -0.5;
    const down = this.keys.has('KeyS') || this.keys.has('ArrowDown') || this.stickDy > 0.5;

    const punch = this.keys.has('KeyJ') || this.keys.has('KeyZ') || this.touchButtons.has('punch');
    const kick = this.keys.has('KeyK') || this.keys.has('KeyX') || this.touchButtons.has('kick');
    const grab = this.keys.has('KeyI') || this.keys.has('KeyV') || this.touchButtons.has('grab') || (punch && kick);
    const sup = this.keys.has('KeyL') || this.keys.has('Space') || this.keys.has('KeyC') || this.touchButtons.has('super');
    const budget = this.keys.has('KeyB') || this.touchButtons.has('budget');

    return {
      moveX: left && !right ? -1 : right && !left ? 1 : 0,
      up,
      down,
      punch,
      kick,
      grab,
      super: sup,
      budget,
    };
  }

  clearAll(): void {
    this.keys.clear();
    this.touchButtons.clear();
    this.stickDx = 0;
    this.stickDy = 0;
  }

  dispose(): void {
    this.cleanups.forEach((fn) => fn());
    this.cleanups = [];
  }
}
