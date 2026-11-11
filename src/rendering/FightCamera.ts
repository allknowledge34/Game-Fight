import * as THREE from 'three';
import { clamp } from '../core/prng';

export class FightCamera {
  readonly camera: THREE.PerspectiveCamera;
  private readonly goalPos = new THREE.Vector3(0, 2.0, 7.2);
  private readonly goalLook = new THREE.Vector3(0, 1.15, 0);
  private readonly curLook = new THREE.Vector3(0, 1.15, 0);
  private goalFov = 46;
  private overrideUntil = 0;
  private overrideSpeed = 5;
  private shakeAmp = 0;
  private shakeTime = 0;
  private shakeDur = 0.3;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(46, aspect, 0.1, 220);
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

  setCinema(pos: THREE.Vector3, look: THREE.Vector3, speed = 5, fov = 42, holdSeconds = 0.1): void {
    this.goalPos.copy(pos);
    this.goalLook.copy(look);
    this.goalFov = fov;
    this.overrideSpeed = speed;
    this.overrideUntil = performance.now() * 0.001 + holdSeconds;
  }

  followFighters(x0: number, x1: number, selectMode: boolean): void {
    const now = performance.now() * 0.001;
    if (now < this.overrideUntil) return;

    const midX = (x0 + x1) * 0.5;
    const sep = Math.abs(x1 - x0);
    if (selectMode) {
      this.goalPos.set(midX, 1.75, 5.2);
      this.goalLook.set(midX, 1.12, 0);
      this.goalFov = 42;
      this.overrideSpeed = 4;
    } else {
      const distZ = clamp(4.8 + sep * 0.72, 5.2, 9.8);
      this.goalPos.set(clamp(midX, -3.5, 3.5), 1.85 + (distZ - 5.2) * 0.08, distZ);
      this.goalLook.set(clamp(midX, -3.5, 3.5), 1.08, 0);
      this.goalFov = 46;
      this.overrideSpeed = 6.5;
    }
  }

  update(dt: number): void {
    const k = Math.min(1, dt * this.overrideSpeed);
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
