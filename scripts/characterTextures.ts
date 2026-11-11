import * as THREE from 'three';

function hexToRgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

function mixColor(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  const k = Math.max(0, Math.min(1, t));
  return [
    clampByte(a[0] + (b[0] - a[0]) * k),
    clampByte(a[1] + (b[1] - a[1]) * k),
    clampByte(a[2] + (b[2] - a[2]) * k),
  ];
}

function makePixelTex(
  w: number,
  h: number,
  nearest: boolean,
  paint: (u: number, v: number, x: number, y: number) => [number, number, number, number],
): THREE.DataTexture {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      const [r, g, b, a] = paint(u, v, x, y);
      const off = (y * w + x) * 4;
      data[off] = r;
      data[off + 1] = g;
      data[off + 2] = b;
      data[off + 3] = a;
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = nearest ? THREE.NearestFilter : THREE.LinearFilter;
  tex.minFilter = nearest ? THREE.NearestFilter : THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = !nearest;
  tex.needsUpdate = true;
  return tex;
}

function hash2d(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

export function createShadedFabricOrArmorTex(
  baseHex: number,
  shadeHex: number,
  accentHex: number,
  pattern: 'weave' | 'scales' | 'web' | 'panels' | 'pinstripe' | 'leather' | 'fur' | 'muscle',
): THREE.DataTexture {
  const base = hexToRgb(baseHex);
  const shade = hexToRgb(shadeHex);
  const accent = hexToRgb(accentHex);

  return makePixelTex(128, 128, false, (u, v, x, y) => {
    const noise = (hash2d(x, y) - 0.5) * 10;
    let rgb = mixColor(shade, base, 0.65 + Math.sin(u * Math.PI * 2) * 0.12);

    if (pattern === 'scales') {
      // Crisp Eastern mountain-scale armor: subtle interlocking diamond trim, not polka-dots!
      const sx = ((u * 14 + (Math.floor(v * 14) % 2) * 0.5) % 1) - 0.5;
      const sy = ((v * 14) % 1) - 0.5;
      const edge = Math.abs(sx) + Math.abs(sy);
      if (edge > 0.62) rgb = mixColor(rgb, accent, 0.55);
      else rgb = mixColor(shade, base, 0.72 - edge * 0.3);
      if (v > 0.85 || v < 0.12) rgb = mixColor(rgb, accent, 0.68);
    } else if (pattern === 'web') {
      // Spider-Man crisp black fine web lattice on crimson & blue panels
      const radial = Math.abs(((u * 16) % 1) - 0.5) < 0.04;
      const rings = Math.abs(((v * 14) % 1) - 0.5) < 0.04;
      const sideFlank = u > 0.18 && u < 0.34 || u > 0.66 && u < 0.82;
      if (sideFlank && v < 0.65) {
        rgb = shade; // Deep cobalt blue flank panels
      }
      if (!sideFlank && (radial || rings)) {
        rgb = mixColor(rgb, [14, 16, 20], 0.82);
      }
    } else if (pattern === 'panels') {
      const seamX = Math.abs(((u * 6) % 1) - 0.5) > 0.465;
      const seamY = Math.abs(((v * 5) % 1) - 0.5) > 0.455;
      const brushed = (hash2d(x, y >> 1) - 0.5) * 12;
      rgb = [clampByte(rgb[0] + brushed), clampByte(rgb[1] + brushed), clampByte(rgb[2] + brushed)];
      if (seamX || seamY) rgb = mixColor(rgb, [24, 12, 12], 0.78);
      if (v > 0.38 && v < 0.68 && Math.abs(u - 0.5) > 0.34) {
        rgb = mixColor(rgb, accent, 0.75);
      }
    } else if (pattern === 'pinstripe') {
      const stripe = x % 9 === 0;
      rgb = mixColor(shade, base, 0.42);
      if (stripe) rgb = mixColor(rgb, accent, 0.28);
    } else if (pattern === 'leather') {
      const stitch = Math.abs(v - 0.12) < 0.025 || Math.abs(v - 0.88) < 0.025;
      if (stitch && x % 6 < 3) rgb = mixColor(rgb, accent, 0.82);
      rgb = mixColor(shade, rgb, 0.6 + hash2d(x >> 1, y >> 1) * 0.3);
    } else if (pattern === 'fur') {
      const strand = Math.sin(x * 0.8 + hash2d(x, y >> 2) * 3) * 14;
      rgb = [clampByte(rgb[0] + strand), clampByte(rgb[1] + strand * 0.8), clampByte(rgb[2] + strand * 0.4)];
    } else if (pattern === 'muscle') {
      const striation = Math.sin(v * Math.PI * 8) * 6;
      rgb = [clampByte(rgb[0] + striation), clampByte(rgb[1] + striation), clampByte(rgb[2] + striation)];
    } else {
      const weave = (((x >> 1) + (y >> 1)) % 2) * 6;
      rgb = [clampByte(rgb[0] + weave), clampByte(rgb[1] + weave), clampByte(rgb[2] + weave)];
    }

    return [clampByte(rgb[0] + noise), clampByte(rgb[1] + noise), clampByte(rgb[2] + noise), 255];
  });
}

export function createKratosSkinAndWarpaintTex(): THREE.DataTexture {
  const skin: [number, number, number] = [218, 213, 206];
  const ashShade: [number, number, number] = [175, 168, 160];
  const redPaint: [number, number, number] = [178, 22, 22];

  return makePixelTex(128, 128, false, (u, v, x, y) => {
    const pore = (hash2d(x, y) - 0.5) * 8;
    let rgb = mixColor(ashShade, skin, 0.65 + Math.sin(v * Math.PI * 2) * 0.14);
    // Bold single diagonal Spartan war-paint across chest/shoulder only (u ~0.58)
    const diag = Math.abs(u - 0.56 - (v - 0.45) * 0.55);
    if (diag < 0.08 && v > 0.25 && v < 0.92) {
      rgb = mixColor(rgb, redPaint, 0.94);
    }
    return [clampByte(rgb[0] + pore), clampByte(rgb[1] + pore), clampByte(rgb[2] + pore), 255];
  });
}

export function createKratosHeadTex(): THREE.DataTexture {
  const skin: [number, number, number] = [218, 213, 206];
  const redPaint: [number, number, number] = [180, 22, 22];
  return makePixelTex(128, 128, false, (u, v, x, y) => {
    const pore = (hash2d(x, y) - 0.5) * 6;
    let rgb: [number, number, number] = skin;
    // Vertical crimson scar stripe over LEFT eye on front of head (+Z = u near 0 or 1 -> left side u ~0.92)
    if (u > 0.84 && u < 0.96 && v > 0.28) {
      rgb = redPaint;
    }
    return [clampByte(rgb[0] + pore), clampByte(rgb[1] + pore), clampByte(rgb[2] + pore), 255];
  });
}

export function createSteveFaceTex(): THREE.DataTexture {
  const H = '#3a2415';
  const S = '#b68663';
  const D = '#a17353';
  const B = '#3b2416';
  const N = '#8d5b3e';
  const M = '#e4c7b3';
  const E = '#ffffff';
  const P = '#5240d9';

  const grid = [
    [H, H, H, H, H, H, H, H],
    [H, H, H, H, H, H, H, H],
    [H, S, S, S, S, S, S, H],
    [S, S, D, S, S, D, S, S],
    [S, E, P, S, S, P, E, S],
    [S, S, S, N, N, S, S, S],
    [S, S, B, M, M, B, S, S],
    [S, S, B, B, B, B, S, S],
  ];

  const parse = (hex: string): [number, number, number] => hexToRgb(parseInt(hex.slice(1), 16));
  return makePixelTex(64, 64, true, (_u, _v, x, y) => {
    const gx = Math.min(7, Math.floor(x / 8));
    const gy = Math.min(7, Math.floor(y / 8));
    const [r, g, b] = parse(grid[gy][gx]);
    return [r, g, b, 255];
  });
}

export function createSteveShirtTex(): THREE.DataTexture {
  return makePixelTex(64, 64, true, (_u, v, x, y) => {
    const gx = Math.floor(x / 8);
    const gy = Math.floor(y / 8);
    if (gy <= 1 && (gx === 3 || gx === 4)) {
      const sk = gy === 0 || (gx === 3 && v < 0.22);
      if (sk) return [182, 134, 99, 255];
    }
    if (gy === 7 && (gx === 2 || gx === 5)) {
      return [28, 36, 128, 255];
    }
    const pxNoise = ((gx * 7 + gy * 13) % 3) * 8 - 8;
    return [clampByte(12 + pxNoise), clampByte(178 + pxNoise), clampByte(202 + pxNoise), 255];
  });
}

export function createDiamondWeaponTex(): THREE.DataTexture {
  return makePixelTex(32, 32, true, (_u, _v, x, y) => {
    const gx = Math.floor(x / 4);
    const gy = Math.floor(y / 4);
    const edge = gx === 0 || gx === 7 || gy === 0 || gy === 7;
    if (edge) return [18, 95, 118, 255];
    const shine = (gx + gy) % 4 === 0 ? 36 : 0;
    return [clampByte(56 + shine), clampByte(228 + shine * 0.4), clampByte(245), 255];
  });
}

export function createTntBlockTex(): THREE.DataTexture {
  return makePixelTex(64, 64, true, (_u, _v, x, y) => {
    const gy = Math.floor(y / 8);
    const gx = Math.floor(x / 8);
    if (gy >= 3 && gy <= 4) {
      if (gy === 3 && (gx === 1 || gx === 3 || gx === 6)) return [20, 20, 20, 255];
      if (gy === 4 && (gx === 1 || gx === 3 || gx === 4 || gx === 6)) return [20, 20, 20, 255];
      return [240, 240, 240, 255];
    }
    const plank = (gx % 2 === 0 ? 14 : -10) + (((x >> 2) + (y >> 2)) % 2) * 8;
    return [clampByte(205 + plank), clampByte(42 + plank * 0.3), clampByte(32 + plank * 0.2), 255];
  });
}
