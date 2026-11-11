import type { FighterId } from '../core/types';
import { FIGHTER_ROSTER, ROSTER_ORDER } from '../characters/roster';

function hexColor(num: number): string {
  return `#${num.toString(16).padStart(6, '0')}`;
}

export class PortraitFactory {
  private readonly cache = new Map<string, string>();

  getFighterPortrait(id: FighterId): string {
    const cached = this.cache.get(id);
    if (cached) return cached;

    const p = FIGHTER_ROSTER[id];
    const canvas = document.createElement('canvas');
    canvas.width = 192;
    canvas.height = 192;
    const ctx = canvas.getContext('2d')!;

    // Dramatic studio radial backdrop tinted by fighter accent
    const bg = ctx.createRadialGradient(96, 86, 12, 96, 96, 120);
    bg.addColorStop(0, p.accent);
    bg.addColorStop(1, '#14151e');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 192, 192);

    // Sunburst rays
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

    const skin = hexColor(p.look.skin);
    const jacket = hexColor(p.look.jacket);
    const top = hexColor(p.look.top);
    const hair = hexColor(p.look.hair);
    const beard = hexColor(p.look.beard);

    // Shoulders & collar
    ctx.fillStyle = p.look.topStyle === 'tshirt' ? top : jacket;
    ctx.beginPath();
    ctx.moveTo(22, 192);
    ctx.quadraticCurveTo(96, 122, 170, 192);
    ctx.fill();

    ctx.fillStyle = top;
    ctx.beginPath();
    ctx.moveTo(74, 146);
    ctx.lineTo(96, 188);
    ctx.lineTo(118, 146);
    ctx.closePath();
    ctx.fill();

    // Neck
    ctx.fillStyle = hexColor(p.look.skinShade);
    ctx.fillRect(82, 118, 28, 32);

    // Head oval
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.ellipse(96, 86, 40, 48, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ears
    ctx.fillStyle = hexColor(p.look.skinShade);
    ctx.beginPath();
    ctx.ellipse(55, 88, 6, 11, 0, 0, Math.PI * 2);
    ctx.ellipse(137, 88, 6, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    // Hair
    ctx.fillStyle = hair;
    if (p.look.hairStyle === 'side-part') {
      ctx.beginPath();
      ctx.ellipse(96, 48, 42, 22, -0.06, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(80, 44, 24, 12, -0.15, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.look.hairStyle === 'bun') {
      ctx.beginPath();
      ctx.ellipse(96, 52, 41, 20, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(96, 30, 13, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(62, 68, 12, Math.PI * 0.5, Math.PI * 1.5);
      ctx.arc(130, 68, 12, -Math.PI * 0.5, Math.PI * 0.5);
      ctx.fill();
    }

    // Beard
    if (p.look.beardStyle === 'full-white') {
      ctx.fillStyle = beard;
      ctx.beginPath();
      ctx.moveTo(60, 88);
      ctx.quadraticCurveTo(96, 146, 132, 88);
      ctx.lineTo(132, 108);
      ctx.quadraticCurveTo(96, 152, 60, 108);
      ctx.fill();
    } else if (p.look.beardStyle === 'stubble-grey') {
      ctx.fillStyle = 'rgba(80,75,72,0.45)';
      ctx.beginPath();
      ctx.arc(96, 92, 36, 0.25, Math.PI - 0.25);
      ctx.fill();
    }

    // Eyes & confident smirk
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(80, 82, 8, 5, 0, 0, Math.PI * 2);
    ctx.ellipse(112, 82, 8, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#141418';
    ctx.beginPath();
    ctx.arc(81, 82, 3.5, 0, Math.PI * 2);
    ctx.arc(113, 82, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Brows
    ctx.strokeStyle = hexColor(p.look.brows);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(69, 71);
    ctx.lineTo(89, 74);
    ctx.moveTo(123, 71);
    ctx.lineTo(103, 74);
    ctx.stroke();

    // Mouth / mustache
    ctx.strokeStyle = '#60251c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(85, 110);
    ctx.quadraticCurveTo(96, 115, 109, 108);
    ctx.stroke();

    // Glasses
    if (p.look.glasses) {
      ctx.strokeStyle = '#1b1d24';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(80, 82, 12, 0, Math.PI * 2);
      ctx.moveTo(92, 82);
      ctx.lineTo(100, 82);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(112, 82, 12, 0, Math.PI * 2);
      ctx.stroke();
    }

    const url = canvas.toDataURL('image/png');
    this.cache.set(id, url);
    return url;
  }

  getAnchorPortrait(kind: 'godi' | 'troll'): string {
    const key = `anchor:${kind}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = kind === 'godi' ? '#2a0f0f' : '#0d1b33';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = kind === 'godi' ? 'rgba(255,60,40,0.22)' : 'rgba(60,160,255,0.22)';
    for (let i = 0; i < 6; i++) ctx.fillRect(0, i * 24, 128, 10);

    // Suit / hoodie
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

    // Face
    ctx.fillStyle = '#c98c5f';
    ctx.fillRect(56, 80, 16, 18);
    ctx.beginPath();
    ctx.ellipse(64, 58, 25, 30, 0, 0, Math.PI * 2);
    ctx.fill();

    // Hair or backward cap
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

    // Wide shouting eyes
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

    // Shouting mouth
    ctx.fillStyle = '#5a1010';
    ctx.beginPath();
    ctx.ellipse(64, 74, 9, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Mic or smartphone
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
