import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { StageId } from '../core/types';
import type { BattleStateSnapshot } from '../simulation/BattleSimulation';
import { FIGHTER_ROSTER } from '../characters/roster';
import { FightCamera, type CameraMode } from './FightCamera';
import { FighterRig } from './FighterRig';
import { ParticleSystem } from './ParticleSystem';
import { SuperDirector } from './SuperDirector';
import { ArenaStage } from '../stages/ArenaStage';

export class ThreeScene {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly cameraCtrl: FightCamera;
  readonly arena = new ArenaStage();
  readonly particles = new ParticleSystem();
  readonly superDirector = new SuperDirector();

  private composer: EffectComposer | null = null;
  private rigs: [FighterRig | null, FighterRig | null] = [null, null];
  private rigKeys: [string, string] = ['', ''];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const width = Math.max(320, window.innerWidth || 1280);
    const height = Math.max(200, window.innerHeight || 720);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    const isSoftwareWebGL = this.detectSoftwareRenderer();
    this.renderer.setPixelRatio(isSoftwareWebGL ? 0.8 : Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(width, height, false);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = !isSoftwareWebGL;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.cameraCtrl = new FightCamera(width / height);

    this.scene.add(this.arena.group);
    this.scene.add(this.particles.group);
    this.scene.add(this.superDirector.group);
    if (this.arena.fog) this.scene.fog = this.arena.fog;

    if (!isSoftwareWebGL) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.cameraCtrl.camera));
      const bloom = new UnrealBloomPass(new THREE.Vector2(width * 0.5, height * 0.5), 0.4, 0.4, 1.12);
      this.composer.addPass(bloom);
    }
  }

  private detectSoftwareRenderer(): boolean {
    try {
      const gl = this.renderer.getContext();
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const rendererName = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
      return /swiftshader|llvmpipe|software/i.test(rendererName);
    } catch {
      return false;
    }
  }

  resize(): void {
    const w = Math.max(320, window.innerWidth || 1280);
    const h = Math.max(200, window.innerHeight || 720);
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.cameraCtrl.setAspect(w / h);
  }

  setStage(stage: StageId): void {
    this.arena.setStage(stage);
    this.scene.fog = this.arena.fog;
  }

  syncFighters(snap: BattleStateSnapshot, clock: number, dt: number, mode: CameraMode | boolean): void {
    for (const side of [0, 1] as const) {
      const f = snap.fighters[side];
      if (this.rigKeys[side] !== f.id) {
        if (this.rigs[side]) {
          this.rigs[side]!.dispose();
          this.scene.remove(this.rigs[side]!.root);
        }
        const rig = new FighterRig(FIGHTER_ROSTER[f.id]);
        this.rigs[side] = rig;
        this.rigKeys[side] = f.id;
        this.scene.add(rig.root);
      }
      this.rigs[side]!.update(f, clock, dt);
    }

    this.arena.setCrowdEnergy(snap.excitement, Math.min(1, snap.calm / 8));
    this.arena.update(clock, snap.hazards);
    this.superDirector.update(snap, this.cameraCtrl, this.particles, this.arena, dt);
    this.cameraCtrl.followFighters(
      snap.fighters[0].x,
      snap.fighters[1].x,
      mode,
      snap.fighters[0].y,
      snap.fighters[1].y,
      clock,
    );
    this.cameraCtrl.update(dt);
    this.particles.update(dt);
  }

  get loadedModelsSummary(): Record<number, { id: string; loaded: boolean; clips: number }> {
    return {
      0: { id: this.rigKeys[0], loaded: !!this.rigs[0]?.hasLoadedModel, clips: this.rigs[0]?.loadedClipCount ?? 0 },
      1: { id: this.rigKeys[1], loaded: !!this.rigs[1]?.hasLoadedModel, clips: this.rigs[1]?.loadedClipCount ?? 0 },
    };
  }

  projectToScreen(worldX: number, worldY: number): { x: number; y: number } {
    const v = new THREE.Vector3(worldX, worldY, 0).project(this.cameraCtrl.camera);
    const w = window.innerWidth || 1280;
    const h = window.innerHeight || 720;
    return {
      x: (v.x * 0.5 + 0.5) * w,
      y: (-v.y * 0.5 + 0.5) * h,
    };
  }

  render(): void {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.cameraCtrl.camera);
  }

  captureSnapshotDataUrl(): string {
    try {
      this.render();
      return this.canvas.toDataURL('image/png');
    } catch {
      return '';
    }
  }

  dispose(): void {
    this.rigs[0]?.dispose();
    this.rigs[1]?.dispose();
    this.particles.dispose();
    this.superDirector.clear();
    this.composer?.dispose();
    this.renderer.dispose();
  }
}
