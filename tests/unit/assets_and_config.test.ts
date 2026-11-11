import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOSS_ID, FIGHTER_ROSTER, ROSTER_ORDER } from '../../src/characters/roster';
import { ROSTER_DISPLAY_CONFIG, UI_LABELS_CONFIG } from '../../src/characters/characterConfigs';

describe('GLB Models, Spoken Audio Assets & Configurable Labels', () => {
  it('ships valid binary GLTF (.glb) model assets for every character in the roster', () => {
    expect(ROSTER_ORDER).toEqual(['kratos', 'wukong', 'michael', 'spiderman', 'ironman', 'thor', 'steve']);
    expect(BOSS_ID).toBe('steve');

    for (const id of ROSTER_ORDER) {
      const p = FIGHTER_ROSTER[id];
      const modelRel = p.modelUrl.replace(/^\//, '');
      const fullPath = path.resolve(process.cwd(), 'public', modelRel);
      expect(fs.existsSync(fullPath), `Missing GLB file: ${fullPath}`).toBe(true);
      const buf = fs.readFileSync(fullPath);
      expect(buf.byteLength).toBeGreaterThan(20_000);
      // Binary GLTF magic header: 'glTF' (0x46546C67)
      expect(buf.toString('ascii', 0, 4)).toBe('glTF');
    }
  });

  it('ships spoken announcer and per-character voice WAV clips for every character', () => {
    const announcerKeys = ['round1', 'round2', 'round3', 'fight', 'ko', 'win', 'lose', 'boss'];
    for (const key of announcerKeys) {
      const p = path.resolve(process.cwd(), 'public/audio', `ann_${key}.wav`);
      expect(fs.existsSync(p), `Missing announcer clip ${p}`).toBe(true);
      expect(fs.readFileSync(p).toString('ascii', 0, 4)).toBe('RIFF');
    }

    for (const id of ROSTER_ORDER) {
      for (const kind of ['intro', 'super', 'win'] as const) {
        const p = path.resolve(process.cwd(), 'public/audio', `voice_${id}_${kind}.wav`);
        expect(fs.existsSync(p), `Missing voice clip ${p}`).toBe(true);
        const header = fs.readFileSync(p).toString('ascii', 0, 4);
        expect(header).toBe('RIFF');
      }
    }
  });

  it('decouples configurable labels cleanly from core gameplay state', () => {
    expect(Object.keys(ROSTER_DISPLAY_CONFIG)).toHaveLength(7);
    expect(UI_LABELS_CONFIG.selectTitle).toBeTruthy();
    expect(UI_LABELS_CONFIG.bossBadge).toBe('BOSS');
    for (const id of ROSTER_ORDER) {
      expect(FIGHTER_ROSTER[id].name).toBe(ROSTER_DISPLAY_CONFIG[id].displayName);
      expect(FIGHTER_ROSTER[id].superName).toBe(ROSTER_DISPLAY_CONFIG[id].superName);
    }
  });
});
