import type { PlayerInput } from '../core/types';

// Binary 2-byte deterministic netcode packing for fixed-step input streaming
export function packPlayerInput(input: PlayerInput): number {
  let mask = 0;
  if (input.moveX < 0) mask |= 1 << 0;
  if (input.moveX > 0) mask |= 1 << 1;
  if (input.up) mask |= 1 << 2;
  if (input.down) mask |= 1 << 3;
  if (input.punch) mask |= 1 << 4;
  if (input.kick) mask |= 1 << 5;
  if (input.grab) mask |= 1 << 6;
  if (input.super) mask |= 1 << 7;
  if (input.budget) mask |= 1 << 8;
  return mask;
}

export function unpackPlayerInput(mask: number): PlayerInput {
  const left = (mask & (1 << 0)) !== 0;
  const right = (mask & (1 << 1)) !== 0;
  const moveX = left && !right ? -1 : right && !left ? 1 : 0;
  return {
    moveX,
    up: (mask & (1 << 2)) !== 0,
    down: (mask & (1 << 3)) !== 0,
    punch: (mask & (1 << 4)) !== 0,
    kick: (mask & (1 << 5)) !== 0,
    grab: (mask & (1 << 6)) !== 0,
    super: (mask & (1 << 7)) !== 0,
    budget: (mask & (1 << 8)) !== 0,
  };
}
