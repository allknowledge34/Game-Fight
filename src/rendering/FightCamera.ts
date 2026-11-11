import * as THREE from 'three';
import { clamp } from '../core/prng';

export type CameraMode = 'title' | 'select' | 'fight';

export class FightCamera {
  readonly camera: THREE.PerspectiveCamera;
  private readonly goalPos = new THREE.Vector3(0, 1.48, 4.4);
  private readonly goalLook = new THREE.Vector3(0, 1.12, 0);
  private readonly curLook = new THREE.Vector3(0, 1.12, 0);
  private goalFov = 42;
  private overrideUntil = 0;
  private overrideSpeed = 6;
  private shakeAmp = 0;
  private shakeTime = 0;
  private shakeDur = 0.3;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(42, aspect, 0.05, 400);
    this.camera.position.copy(this.goalPos);
    this.camera.lookAt(this.curLook);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  shake(amplitude: number, duration = 0.3): void {
    if (amplitude >= this.shakeAmp || this.shakeTime <= 0) {
      this.shakeAmp = amplitude;
      this.shakeTime = duration;
      this.shakeDur = duration;
    }
  }

  setCinema(pos: THREE.Vector3, look: THREE.Vector3, speed = 5.5, fov = 38, holdSeconds = 0.12): void {
    this.goalPos.copy(pos);
    this.goalLook.copy(look);
    this.goalFov = fov;
    this.overrideSpeed = speed;
    this.overrideUntil = performance.now() * 0.001 + holdSeconds;
  }

  followFighters(
    x0: number,
    x1: number,
    modeOrSelect: CameraMode | boolean,
    y0 = 0,
    y1 = 0,
    clock = 0,
  ): void {
    const now = performance.now() * 0.001;
    if (now < this.overrideUntil) return;

    const mode: CameraMode =
      typeof modeOrSelect === 'boolean' ? (modeOrSelect ? 'select' : 'fight') : modeOrSelect;

    const aspectComp = Math.max(0, (1.55 - this.camera.aspect) * 1.4);

    if (mode === 'title') {
      const orbitDist = 4.15 * Math.max(1, 1.48 / Math.max(0.5, this.camera.aspect));
      const ang = Math.sin(clock * 0.25) * 0.32;
      this.goalPos.set(Math.sin(ang) * orbitDist, 1.45, Math.cos(ang) * orbitDist);
      this.goalLook.set(0, 1.12, 0);
      this.goalFov = 40;
      this.overrideSpeed = 3.5;
      return;
    }

    if (mode === 'select') {
      const midX = (x0 + x1) * 0.5;
      const selDist = 3.95 + aspectComp * 0.7;
      this.goalPos.set(midX, 1.38, selDist);
      this.goalLook.set(midX, 0.98, 0);
      this.goalFov = 40;
      this.overrideSpeed = 5;
      return;
    }

    // Active combat tracking matching FightKaro's tighter close-up framing
    const midX = (x0 + x1) * 0.5;
    const sep = Math.abs(x1 - x0);
    const maxY = Math.max(y0, y1);
    const distZ = clamp(3.4 + sep * 0.85, 4.4, 8.5) + aspectComp;
    this.goalPos.set(
      clamp(midX, -3.8, 3.8),
      1.55 + sep * 0.06 + maxY * 0.35,
      distZ,
    );
    this.goalLook.set(clamp(midX, -3.8, 3.8), 1.0 + maxY * 0.28, 0);
    this.goalFov = 42;
    this.overrideSpeed = 6.8;
  }

  update(dt: number): void {
    const k = 1 - Math.exp(-this.overrideSpeed * dt);
    this.camera.position.lerp(this.goalPos, k);
    this.curLook.lerp(this.goalLook, k);

    if (Math.abs(this.camera.fov - this.goalFov) > 0.05) {
      this.camera.fov += (this.goalFov - this.camera.fov) * k;
      this.camera.updateProjectionMatrix();
    }

    if (this.shakeTime > 0) {
      this.shakeTime = Math.max(0, this.shakeTime - dt);
      const decay = this.shakeTime / Math.max(0.01, this.shakeDur);
      const a = this.shakeAmp * decay;
      this.camera.position.x += (Math.random() - 0.5) * 2 * a;
      this.camera.position.y += (Math.random() - 0.5) * 2 * a;
    }

    this.camera.lookAt(this.curLook);
  }
}
