import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROSTER_DISPLAY_CONFIG } from '../src/characters/characterConfigs';
import type { FighterId } from '../src/core/types';

interface VoiceSpec {
  voice: string;
  rate: number;
}

const CHARACTER_VOICES: Record<FighterId, VoiceSpec> = {
  kratos: { voice: 'Ralph', rate: 145 },
  wukong: { voice: 'Rishi', rate: 190 },
  michael: { voice: 'Daniel', rate: 170 },
  spiderman: { voice: 'Eddy (English (US))', rate: 195 },
  ironman: { voice: 'Reed (English (US))', rate: 185 },
  thor: { voice: 'Grandpa (English (UK))', rate: 155 },
  steve: { voice: 'Zarvox', rate: 165 },
};

const ANNOUNCER_CLIPS: Record<string, { text: string; voice: string; rate: number }> = {
  ann_round1: { text: 'Round One!', voice: 'Rocko (English (US))', rate: 165 },
  ann_round2: { text: 'Round Two!', voice: 'Rocko (English (US))', rate: 165 },
  ann_round3: { text: 'Final Round!', voice: 'Rocko (English (US))', rate: 165 },
  ann_fight: { text: 'Fight!', voice: 'Rocko (English (US))', rate: 185 },
  ann_ko: { text: 'Knock Out!', voice: 'Rocko (English (US))', rate: 155 },
  ann_win: { text: 'You Win!', voice: 'Rocko (English (US))', rate: 175 },
  ann_lose: { text: 'Defeat!', voice: 'Rocko (English (US))', rate: 165 },
  ann_boss: { text: 'Warning! Final Boss Steve approaches!', voice: 'Rocko (English (US))', rate: 168 },
};

const outDir = path.resolve(process.cwd(), 'public/audio');
fs.mkdirSync(outDir, { recursive: true });
const tmpDir = path.resolve('/tmp/fightkaro_tts');
fs.mkdirSync(tmpDir, { recursive: true });

function synthWav(filename: string, text: string, voice: string, rate: number): void {
  const safeBase = filename.replace(/\.wav$/, '');
  const aiffPath = path.join(tmpDir, `${safeBase}.aiff`);
  const wavPath = path.join(outDir, filename);
  execFileSync('/usr/bin/say', ['-v', voice, '-r', String(rate), '-o', aiffPath, text], {
    stdio: 'pipe',
  });
  execFileSync('/usr/bin/afconvert', ['-f', 'WAVE', '-d', 'LEI16@22050', aiffPath, wavPath], {
    stdio: 'pipe',
  });
}

for (const [id, spec] of Object.entries(ANNOUNCER_CLIPS)) {
  synthWav(`${id}.wav`, spec.text, spec.voice, spec.rate);
  console.log('Generated', `${id}.wav`);
}

for (const id of Object.keys(ROSTER_DISPLAY_CONFIG) as FighterId[]) {
  const cfg = ROSTER_DISPLAY_CONFIG[id];
  const v = CHARACTER_VOICES[id];
  synthWav(`voice_${id}_intro.wav`, cfg.introLine, v.voice, v.rate);
  synthWav(`voice_${id}_super.wav`, cfg.superLine, v.voice, Math.round(v.rate * 1.05));
  synthWav(`voice_${id}_win.wav`, cfg.winLine, v.voice, v.rate);
  console.log(`Generated character voices for ${id}`);
}
console.log('All spoken audio clips generated in', outDir);
