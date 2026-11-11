import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { FighterId } from '../core/types';
import { FIGHTER_ROSTER, ROSTER_ORDER } from '../characters/roster';
import { getCachedFighterAsset } from './FighterRig';

function hexColor(num: number): string {
  return `#${num.toString(16).padStart(6, '0')}`;
}

export class PortraitFactory {
  private readonly cache = new Map<string, string>();
  private readonly boundImgs = new Map<FighterId, Set<HTMLImageElement>>();

  bindPortraitImage(img: HTMLImageElement, id: FighterId): void {
    let set = this.boundImgs.get(id);
    if (!set) {
      set = new Set();
      this.boundImgs.set(id, set);
    }
    set.add(img);
    img.src = this.getFighterPortrait(id);
  }

  private notifyUpdated(id: FighterId, url: string): void {
    const imgs = this.boundImgs.get(id);
    if (!imgs) return;
    for (const img of imgs) {
      if (img.isConnected) img.src = url;
    }
  }

  /**
   * Renders studio-lit 3D bust portraits directly from the loaded `.glb` models,
   * matching FightKaro's offscreen GLTF bust renderer so select tiles & HUD match in-game fighters 1:1.
   */
  warmFromLoadedModels(sourceRenderer: THREE.WebGLRenderer): void {
    if (typeof document === 'undefined') return;
    const size = 256;
    const target = new THREE.WebGLRenderTarget(size, size, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
    });
    const studioScene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
    cam.position.set(0.32, 1.54, 1.48);
    cam.lookAt(0, 1.46, 0);

    const key = new THREE.DirectionalLight(0xfff4e6, 2.8);
    key.position.set(1.4, 2.5, 2.5);
    const fill = new THREE.PointLight(0xffffff, 2.2, 8);
    fill.position.set(0.15, 1.7, 1.4);
    const rim = new THREE.DirectionalLight(0xffaa55, 1.9);
    rim.position.set(-1.8, 2.1, -1.5);
    const hemi = new THREE.HemisphereLight(0xfff0d8, 0x261a32, 1.4);
    studioScene.add(key, fill, rim, hemi);

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const pixels = new Uint8Array(size * size * 4);
    const prevTarget = sourceRenderer.getRenderTarget();
    const prevClearAlpha = sourceRenderer.getClearAlpha();

    for (const id of ROSTER_ORDER) {
      const asset = getCachedFighterAsset(id);
      if (!asset) continue;
      const p = FIGHTER_ROSTER[id];
      const model = SkeletonUtils.clone(asset.scene);
      model.rotation.y = 0.26;
      studioScene.add(model);

      rim.color.set(p.accent);
      const yFocus = 1.64 * (p.modelHeight || 1);
      fill.position.set(0.15, yFocus, 1.35);
      cam.position.set(0.32, yFocus + 0.04, 1.15);
      cam.lookAt(0, yFocus - 0.08, 0);

      sourceRenderer.setRenderTarget(target);
      sourceRenderer.setClearColor(0x000000, 0);
      sourceRenderer.clear(true, true, true);
      sourceRenderer.render(studioScene, cam);
      sourceRenderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);

      // Composite dramatic gradient background + read back flipped Y WebGL bust
      ctx.clearRect(0, 0, size, size);
      const bg = ctx.createRadialGradient(size * 0.5, size * 0.42, 10, size * 0.5, size * 0.5, size * 0.68);
      bg.addColorStop(0, p.accent);
      bg.addColorStop(0.58, '#281610');
      bg.addColorStop(1, '#100a08');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, size, size);

      const fgCanvas = document.createElement('canvas');
      fgCanvas.width = size;
      fgCanvas.height = size;
      const fgCtx = fgCanvas.getContext('2d')!;
      const imgData = fgCtx.createImageData(size, size);
      for (let y = 0; y < size; y++) {
        const srcRow = (size - 1 - y) * size * 4;
        const dstRow = y * size * 4;
        for (let x = 0; x < size * 4; x++) {
          imgData.data[dstRow + x] = pixels[srcRow + x];
        }
      }
      fgCtx.putImageData(imgData, 0, 0);
      ctx.drawImage(fgCanvas, 0, 0);

      const url = canvas.toDataURL('image/png');
      this.cache.set(id, url);
      this.notifyUpdated(id, url);
      studioScene.remove(model);
    }

    sourceRenderer.setRenderTarget(prevTarget);
    sourceRenderer.setClearAlpha(prevClearAlpha);
    target.dispose();
  }

  getFighterPortrait(id: FighterId): string {
    const cached = this.cache.get(id);
    if (cached) return cached;
    if (typeof document === 'undefined') return '';

    const p = FIGHTER_ROSTER[id];
    const canvas = document.createElement('canvas');
    canvas.width = 192;
    canvas.height = 192;
    const ctx = canvas.getContext('2d')!;

    const bg = ctx.createRadialGradient(96, 86, 12, 96, 96, 120);
    bg.addColorStop(0, p.accent);
    bg.addColorStop(0.65, '#241410');
    bg.addColorStop(1, '#120b09');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 192, 192);

    ctx.save();
    ctx.translate(96, 96);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 12; i++) {
      ctx.rotate((Math.PI * 2) / 12);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-10, -130);
      ctx.lineTo(10, -130);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    if (id === 'steve') {
      this.drawVoxelStevePortrait(ctx);
    } else {
      this.drawStylizedFighterPortrait(ctx, id);
    }

    const url = canvas.toDataURL('image/png');
    this.cache.set(id, url);
    return url;
  }

  private drawVoxelStevePortrait(ctx: CanvasRenderingContext2D): void {
    // Pixel-crisp Steve shoulder + square head
    ctx.fillStyle = '#06b6d4';
    ctx.fillRect(30, 134, 132, 60);
    ctx.fillStyle = '#0e7490';
    ctx.fillRect(30, 134, 24, 60);
    ctx.fillRect(138, 134, 24, 60);
    // Square Head
    ctx.fillStyle = '#b68663';
    ctx.fillRect(50, 38, 92, 96);
    // Voxel hair
    ctx.fillStyle = '#3a2415';
    ctx.fillRect(50, 38, 92, 24);
    ctx.fillRect(50, 62, 12, 12);
    ctx.fillRect(130, 62, 12, 12);
    // Eyes
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(62, 76, 12, 10);
    ctx.fillRect(118, 76, 12, 10);
    ctx.fillStyle = '#5240d9';
    ctx.fillRect(74, 76, 12, 10);
    ctx.fillRect(106, 76, 12, 10);
    // Nose + beard
    ctx.fillStyle = '#8d5b3e';
    ctx.fillRect(86, 88, 20, 12);
    ctx.fillStyle = '#3b2416';
    ctx.fillRect(72, 102, 48, 24);
    ctx.fillStyle = '#e4c7b3';
    ctx.fillRect(84, 104, 24, 8);
    // Diamond sword silhouette
    ctx.save();
    ctx.translate(154, 152);
    ctx.rotate(0.45);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(-6, -54, 12, 54);
    ctx.restore();
  }

  private drawStylizedFighterPortrait(ctx: CanvasRenderingContext2D, id: FighterId): void {
    const p = FIGHTER_ROSTER[id];
    const skin = hexColor(p.look.skin);
    const jacket = hexColor(p.look.jacket);
    const top = hexColor(p.look.top);
    const hair = hexColor(p.look.hair);
    const beard = hexColor(p.look.beard);

    // Shoulders
    ctx.fillStyle = id === 'kratos' ? skin : jacket;
    ctx.beginPath();
    ctx.moveTo(20, 192);
    ctx.quadraticCurveTo(96, 120, 172, 192);
    ctx.fill();

    if (id === 'ironman') {
      ctx.fillStyle = '#38f2ff';
      ctx.beginPath();
      ctx.arc(96, 166, 13, 0, Math.PI * 2);
      ctx.fill();
    } else if (id === 'kratos') {
      ctx.strokeStyle = '#b91c1c';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(126, 138);
      ctx.lineTo(66, 192);
      ctx.stroke();
    } else if (id === 'michael') {
      ctx.fillStyle = top;
      ctx.beginPath();
      ctx.moveTo(76, 145);
      ctx.lineTo(96, 188);
      ctx.lineTo(116, 145);
      ctx.fill();
    }

    // Neck & Head
    ctx.fillStyle = hexColor(p.look.skinShade);
    ctx.fillRect(82, 118, 28, 32);
    ctx.fillStyle = id === 'ironman' || id === 'spiderman' ? top : skin;
    ctx.beginPath();
    ctx.ellipse(96, 86, 40, 48, 0, 0, Math.PI * 2);
    ctx.fill();

    if (id === 'kratos') {
      ctx.fillStyle = '#b91c1c';
      ctx.fillRect(68, 42, 14, 92);
    }

    if (id === 'ironman') {
      ctx.fillStyle = jacket;
      ctx.beginPath();
      ctx.ellipse(96, 86, 30, 38, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#38f2ff';
      ctx.fillRect(70, 77, 18, 7);
      ctx.fillRect(104, 77, 18, 7);
    } else if (id === 'spiderman') {
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(96, 38);
      ctx.lineTo(96, 134);
      ctx.moveTo(56, 86);
      ctx.lineTo(136, 86);
      ctx.stroke();
      for (const sx of [-1, 1]) {
        ctx.fillStyle = '#111827';
        ctx.beginPath();
        ctx.ellipse(96 + sx * 18, 82, 14, 9, sx * -0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(96 + sx * 18, 82, 10, 6, sx * -0.35, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Hair / crown / feathers
      ctx.fillStyle = hair;
      if (p.look.hairStyle === 'monkey-crown') {
        ctx.beginPath();
        ctx.ellipse(96, 52, 41, 22, 0, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(96, 62, 36, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(84, 34);
        ctx.quadraticCurveTo(50, 6, 34, 24);
        ctx.moveTo(108, 34);
        ctx.quadraticCurveTo(142, 6, 158, 24);
        ctx.stroke();
      } else if (p.look.hairStyle !== 'bald') {
        ctx.beginPath();
        ctx.ellipse(96, 48, 42, 22, 0, Math.PI, Math.PI * 2);
        ctx.fill();
      }

      if (p.look.beardStyle === 'spartan-thick' || p.look.beardStyle === 'norse-full' || p.look.beardStyle === 'monkey-sideburns') {
        ctx.fillStyle = beard;
        ctx.beginPath();
        ctx.moveTo(62, 92);
        ctx.quadraticCurveTo(96, 148, 130, 92);
        ctx.lineTo(128, 114);
        ctx.quadraticCurveTo(96, 152, 64, 114);
        ctx.fill();
      }

      // Eyes & brows
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(80, 82, 7.5, 4.8, 0, 0, Math.PI * 2);
      ctx.ellipse(112, 82, 7.5, 4.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#141418';
      ctx.beginPath();
      ctx.arc(81, 82, 3.2, 0, Math.PI * 2);
      ctx.arc(113, 82, 3.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = hexColor(p.look.brows);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(68, 70);
      ctx.lineTo(89, 75);
      ctx.moveTo(124, 70);
      ctx.lineTo(103, 75);
      ctx.stroke();

      if (p.look.glasses) {
        ctx.fillStyle = 'rgba(15,23,42,0.88)';
        ctx.fillRect(67, 75, 24, 14);
        ctx.fillRect(101, 75, 24, 14);
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 2;
        ctx.strokeRect(67, 75, 24, 14);
        ctx.strokeRect(101, 75, 24, 14);
      }
    }
  }

  getAnchorPortrait(kind: 'godi' | 'troll'): string {
    const key = `anchor:${kind}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    if (typeof document === 'undefined') return '';

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = kind === 'godi' ? '#2a0f0f' : '#0d1b33';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = kind === 'godi' ? 'rgba(255,60,40,0.22)' : 'rgba(60,160,255,0.22)';
    for (let i = 0; i < 6; i++) ctx.fillRect(0, i * 24, 128, 10);

    ctx.fillStyle = kind === 'godi' ? '#1d2333' : '#3b3f48';
    ctx.beginPath();
    ctx.moveTo(14, 128);
    ctx.quadraticCurveTo(64, 76, 114, 128);
    ctx.fill();

    if (kind === 'godi') {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(52, 98);
      ctx.lineTo(64, 128);
      ctx.lineTo(76, 98);
      ctx.fill();
      ctx.fillStyle = '#d61f1f';
      ctx.beginPath();
      ctx.moveTo(60, 100);
      ctx.lineTo(68, 100);
      ctx.lineTo(70, 128);
      ctx.lineTo(58, 128);
      ctx.fill();
    }

    ctx.fillStyle = '#c98c5f';
    ctx.fillRect(56, 80, 16, 18);
    ctx.beginPath();
    ctx.ellipse(64, 58, 25, 30, 0, 0, Math.PI * 2);
    ctx.fill();

    if (kind === 'godi') {
      ctx.fillStyle = '#1a1310';
      ctx.beginPath();
      ctx.ellipse(64, 36, 26, 14, 0, Math.PI, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#1f6fe0';
      ctx.beginPath();
      ctx.ellipse(64, 36, 27, 15, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(84, 30, 18, 6);
    }

    ctx.fillStyle = '#fff';
    for (const ex of [54, 74]) {
      ctx.beginPath();
      ctx.ellipse(ex, 54, 6, 7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#111';
    for (const ex of [55, 75]) {
      ctx.beginPath();
      ctx.arc(ex, 55, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = '#1a1310';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(46, 44);
    ctx.lineTo(60, 48);
    ctx.moveTo(82, 44);
    ctx.lineTo(68, 48);
    ctx.stroke();

    ctx.fillStyle = '#5a1010';
    ctx.beginPath();
    ctx.ellipse(64, 74, 9, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    if (kind === 'godi') {
      ctx.fillStyle = '#222';
      ctx.fillRect(92, 70, 8, 40);
      ctx.fillStyle = '#888';
      ctx.beginPath();
      ctx.arc(96, 68, 9, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#111';
      ctx.fillRect(90, 74, 18, 30);
      ctx.fillStyle = '#4fc3ff';
      ctx.fillRect(92, 77, 14, 23);
    }

    const url = canvas.toDataURL('image/png');
    this.cache.set(key, url);
    return url;
  }

  warmAll(): void {
    for (const id of ROSTER_ORDER) {
      this.getFighterPortrait(id);
    }
    this.getAnchorPortrait('godi');
    this.getAnchorPortrait('troll');
  }
}
