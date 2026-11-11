import type { BapuProgress } from './types';

const KEYS = {
  legal: 'sansad-showdown:legal-v1',
  muted: 'sansad-showdown:muted',
  bapu: 'sansad-showdown:bapu-v1',
} as const;

export function defaultBapuProgress(): BapuProgress {
  return {
    streak: 0,
    unlocked: false,
    bestSeconds: 0,
    bestDamage: 0,
    peaceWins: 0,
    portalSeen: false,
  };
}

function getSafeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function isLegalAccepted(storage = getSafeStorage()): boolean {
  try {
    return storage?.getItem(KEYS.legal) === '1';
  } catch {
    return false;
  }
}

export function setLegalAccepted(accepted = true, storage = getSafeStorage()): void {
  try {
    storage?.setItem(KEYS.legal, accepted ? '1' : '0');
  } catch {
    // Ignore storage quota / privacy errors cleanly.
  }
}

export function isAudioMuted(storage = getSafeStorage()): boolean {
  try {
    return storage?.getItem(KEYS.muted) === '1';
  } catch {
    return false;
  }
}

export function setAudioMuted(muted: boolean, storage = getSafeStorage()): void {
  try {
    storage?.setItem(KEYS.muted, muted ? '1' : '0');
  } catch {
    // Ignore storage errors cleanly.
  }
}

export function loadBapuProgress(storage = getSafeStorage()): BapuProgress {
  try {
    const raw = storage?.getItem(KEYS.bapu);
    if (!raw) return defaultBapuProgress();
    const parsed = JSON.parse(raw) as Partial<BapuProgress>;
    return { ...defaultBapuProgress(), ...parsed };
  } catch {
    return defaultBapuProgress();
  }
}

export function saveBapuProgress(progress: BapuProgress, storage = getSafeStorage()): void {
  try {
    const existing = loadBapuProgress(storage);
    const merged: BapuProgress = {
      streak: progress.streak,
      unlocked: existing.unlocked || progress.unlocked,
      bestSeconds: Math.max(existing.bestSeconds, progress.bestSeconds),
      bestDamage: Math.max(existing.bestDamage, progress.bestDamage),
      peaceWins: Math.max(existing.peaceWins, progress.peaceWins),
      portalSeen: existing.portalSeen || progress.portalSeen,
    };
    storage?.setItem(KEYS.bapu, JSON.stringify(merged));
  } catch {
    // Ignore storage errors cleanly.
  }
}

export function recordMatchWinForBapu(wonVsCpu: boolean, defeatedBoss: boolean, storage = getSafeStorage()): boolean {
  const prog = loadBapuProgress(storage);
  if (defeatedBoss) {
    prog.unlocked = true;
    prog.peaceWins += 1;
  }
  if (!prog.unlocked) {
    prog.streak = wonVsCpu ? prog.streak + 1 : 0;
    if (prog.streak >= 3) {
      prog.unlocked = true;
    }
  }
  saveBapuProgress(prog, storage);
  return prog.unlocked;
}
