#!/usr/bin/env python3
"""
High-resolution procedural PBR texture bakery for all 7 FightKaro fighters.
Generates aligned RGBA Albedo, Tangent-Space Normal, ORM (AO/Roughness/Metalness),
and Emissive maps stored in zlib-compressed binary `.ztex` + PNG previews.

Coordinate convention matching Three.js DataTexture(flipY=false) + our UV layout:
  - Horizontal axis u in [0, 1]: u = 0.5 is DEAD CENTER FRONT (+Z), u = 0/1 is back (-Z).
  - Vertical axis   v in [0, 1]: y = 0 is v = 0 (BOTTOM), y = H - 1 is v = 1 (TOP).
"""

from __future__ import annotations

import json
import math
import os
import zlib
from pathlib import Path
from typing import Dict, Tuple

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, sobel

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "scripts" / "baked_textures"
PREVIEW_DIR = Path(
    "/Users/sachinkumar/.gemini/antigravity/brain/14139982-5845-42e1-9e44-92742122c620/scratch/textures_preview"
)


def make_grid(w: int, h: int) -> Tuple[np.ndarray, np.ndarray]:
    xs = (np.arange(w, dtype=np.float32) + 0.5) / w
    ys = (np.arange(h, dtype=np.float32) + 0.5) / h
    u, v = np.meshgrid(xs, ys)
    return u, v


def smoothstep(edge0: float, edge1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - edge0) / (edge1 - edge0 + 1e-8), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def ellipse_mask(
    u: np.ndarray,
    v: np.ndarray,
    cu: float,
    cv: float,
    ru: float,
    rv: float,
    softness: float = 0.25,
) -> np.ndarray:
    d = np.sqrt(((u - cu) / ru) ** 2 + ((v - cv) / rv) ** 2)
    return 1.0 - smoothstep(1.0 - softness, 1.0 + softness * 0.25, d)


def value_noise(w: int, h: int, scale: float, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    gw = max(4, int(round(w / scale)))
    gh = max(4, int(round(h / scale)))
    grid = rng.random((gh, gw), dtype=np.float32)
    img = Image.fromarray((grid * 255.0).astype(np.uint8), mode="L")
    up = np.asarray(img.resize((w, h), Image.Resampling.BILINEAR), dtype=np.float32) / 255.0
    return up


def fbm(w: int, h: int, base_scale: float, octaves: int = 3, seed: int = 42) -> np.ndarray:
    acc = np.zeros((h, w), dtype=np.float32)
    amp = 0.55
    norm = 0.0
    for i in range(octaves):
        acc += amp * value_noise(w, h, max(2.0, base_scale / (2**i)), seed + i * 17)
        norm += amp
        amp *= 0.5
    return acc / max(norm, 1e-6)


def mix_rgb(a: np.ndarray, b: Tuple[float, float, float] | np.ndarray, t: np.ndarray | float) -> np.ndarray:
    b_arr = np.asarray(b, dtype=np.float32)
    if b_arr.ndim == 1:
        b_arr = b_arr.reshape(1, 1, 3)
    t_arr = np.asarray(t, dtype=np.float32)
    if t_arr.ndim == 2:
        t_arr = t_arr[..., None]
    return a * (1.0 - t_arr) + b_arr * t_arr


def height_to_normal(height: np.ndarray, strength: float = 2.6) -> np.ndarray:
    # Wrap horizontally along u, clamp vertically along v
    h_pad = np.pad(height, ((1, 1), (0, 0)), mode="edge")
    h_pad = np.pad(h_pad, ((0, 0), (1, 1)), mode="wrap")
    dx = sobel(h_pad, axis=1)[1:-1, 1:-1] * 0.25
    dy = sobel(h_pad, axis=0)[1:-1, 1:-1] * 0.25
    nx = -dx * strength
    ny = -dy * strength
    nz = np.ones_like(height, dtype=np.float32)
    length = np.sqrt(nx * nx + ny * ny + nz * nz) + 1e-8
    nx /= length
    ny /= length
    nz /= length
    rgb = np.stack(
        [
            np.clip((nx * 0.5 + 0.5) * 255.0, 0, 255),
            np.clip((ny * 0.5 + 0.5) * 255.0, 0, 255),
            np.clip((nz * 0.5 + 0.5) * 255.0, 0, 255),
        ],
        axis=-1,
    )
    return rgb.astype(np.uint8)


def make_orm(ao: np.ndarray, roughness: np.ndarray, metalness: np.ndarray) -> np.ndarray:
    rgb = np.stack(
        [
            np.clip(ao * 255.0, 0, 255),
            np.clip(roughness * 255.0, 0, 255),
            np.clip(metalness * 255.0, 0, 255),
        ],
        axis=-1,
    )
    return rgb.astype(np.uint8)


def paint_eyes(
    u: np.ndarray,
    v: np.ndarray,
    albedo: np.ndarray,
    height: np.ndarray,
    iris_rgb: Tuple[float, float, float],
    brow_rgb: Tuple[float, float, float],
    eye_v: float = 0.535,
    eye_du: float = 0.072,
    fierce_tilt: float = 0.14,
) -> np.ndarray:
    for side in (-1.0, 1.0):
        eu = 0.5 + side * eye_du
        # Shadowed upper orbital socket AO
        orb = ellipse_mask(u, v, eu, eye_v + 0.01, 0.056, 0.044, softness=0.55)
        albedo = mix_rgb(albedo, albedo * 0.68, orb * 0.72)
        height -= orb * 0.08

        # Eyebrow arch with slight fierce inner dip
        brow_v = eye_v + 0.068 - np.clip(0.016 * (1.0 - np.abs(u - eu) / 0.048), 0.0, 0.02) * fierce_tilt * (
            -side * (u - 0.5) * 18.0 + 1.0
        )
        brow_d = np.sqrt(((u - eu) / 0.054) ** 2 + ((v - (eye_v + 0.062 + side * (u - eu) * fierce_tilt * 0.35)) / 0.014) ** 2)
        brow_m = 1.0 - smoothstep(0.65, 1.15, brow_d)
        albedo = mix_rgb(albedo, brow_rgb, brow_m * 0.92)
        height += brow_m * 0.14

        # Sclera & Eyelid crease
        sclera = ellipse_mask(u, v, eu, eye_v, 0.028, 0.014, softness=0.22)
        albedo = mix_rgb(albedo, (242.0, 240.0, 236.0), sclera)
        iris = ellipse_mask(u, v, eu, eye_v, 0.015, 0.013, softness=0.18)
        albedo = mix_rgb(albedo, iris_rgb, iris)
        pupil = ellipse_mask(u, v, eu, eye_v, 0.007, 0.0065, softness=0.15)
        albedo = mix_rgb(albedo, (14.0, 14, 18), pupil)
        catch = ellipse_mask(u, v, eu - 0.004, eye_v + 0.003, 0.0035, 0.003, softness=0.25)
        albedo = mix_rgb(albedo, (255.0, 255.0, 255.0), catch * 0.85)
        # Upper lash line
        lash = np.exp(-((v - (eye_v + 0.013)) / 0.0035) ** 2) * np.exp(-((u - eu) / 0.032) ** 2)
        albedo = mix_rgb(albedo, (28.0, 22.0, 20.0), lash * 0.8)
    return albedo


def paint_lips(
    u: np.ndarray,
    v: np.ndarray,
    albedo: np.ndarray,
    height: np.ndarray,
    lip_rgb: Tuple[float, float, float],
    lip_v: float = 0.255,
) -> np.ndarray:
    lip = ellipse_mask(u, v, 0.5, lip_v, 0.044, 0.013, softness=0.4)
    albedo = mix_rgb(albedo, lip_rgb, lip * 0.65)
    part = np.exp(-((v - lip_v) / 0.0035) ** 2) * smoothstep(0.055, 0.01, np.abs(u - 0.5))
    albedo = mix_rgb(albedo, (36.0, 24.0, 24.0), part * 0.62)
    height += lip * 0.08 - part * 0.12
    return albedo


def bake_kratos(registry: Dict[str, np.ndarray]) -> None:
    w = h = 256
    u, v = make_grid(w, h)
    pore = fbm(w, h, 8.0, 3, seed=101) - 0.5

    # 1. Head: Ash-white Spartan skin, crimson tattoo over left eye (+u -> u~0.57), eye scar, beard fade
    ash = np.full((h, w, 3), [222.0, 217.0, 210.0], dtype=np.float32)
    ash += pore[..., None] * 14.0
    # Temple & cheekbone shading
    cheek_ao = ellipse_mask(u, v, 0.5 - 0.12, 0.36, 0.06, 0.09, 0.6) + ellipse_mask(u, v, 0.5 + 0.12, 0.36, 0.06, 0.09, 0.6)
    ash = mix_rgb(ash, (186.0, 179.0, 171.0), cheek_ao * 0.32)
    height = 0.5 + pore * 0.06

    # Iconic crimson warpaint stripe running over LEFT eye (u ~ 0.57) tapering slightly up crown and down cheek
    stripe_center = 0.572 + (v - 0.54) * 0.04
    stripe_w = 0.048 + 0.01 * np.sin(v * 14.0) + pore * 0.015
    tatoo_u = 1.0 - smoothstep(stripe_w * 0.65, stripe_w, np.abs(u - stripe_center))
    tatoo_v = smoothstep(0.28, 0.34, v) * (1.0 - smoothstep(0.88, 0.96, v))
    tatoo = tatoo_u * tatoo_v
    ash = mix_rgb(ash, (176.0, 22.0, 24.0), tatoo * 0.96)

    # Diagonal healed scar across right eye (u ~ 0.425)
    scar_line = np.abs((u - 0.425) - (v - 0.535) * 0.42)
    scar = (1.0 - smoothstep(0.002, 0.008, scar_line)) * smoothstep(0.42, 0.46, v) * (1.0 - smoothstep(0.62, 0.67, v))
    ash = mix_rgb(ash, (188.0, 150.0, 142.0), scar * 0.72)
    height -= scar * 0.16

    ash = paint_eyes(u, v, ash, height, (218.0, 156.0, 48.0), (48.0, 32.0, 26.0), eye_v=0.535, eye_du=0.072, fierce_tilt=0.25)
    ash = paint_lips(u, v, ash, height, (165.0, 138.0, 130.0), lip_v=0.255)

    # Dark Spartan beard fade onto lower jaw & upper lip (espresso-umber hair tone, never pitch black!)
    jaw_zone = (1.0 - smoothstep(0.27, 0.36, v)) * (1.0 - smoothstep(0.14, 0.24, np.abs(u - 0.5)))
    stubble_grain = fbm(w, h, 3.0, 2, seed=109)
    mustache = ellipse_mask(u, v, 0.5, 0.285, 0.062, 0.020, 0.35)
    beard_fade = np.clip(np.maximum(jaw_zone, mustache) * (0.68 + 0.32 * stubble_grain), 0.0, 1.0)
    ash = mix_rgb(ash, (68.0, 48.0, 38.0), beard_fade * 0.88)
    height += beard_fade * 0.14

    registry["kratos_head_albedo"] = np.clip(ash, 0, 255).astype(np.uint8)
    registry["kratos_head_normal"] = height_to_normal(height, 2.4)

    # Textured Spartan beard strands (rich dark umber + salt-and-ash highlights so beard sculpt reads clearly)
    b_strand = np.sin(u * 120.0 + value_noise(w, h, 3.5, seed=131) * 5.0) * 0.5 + 0.5
    beard_tex = mix_rgb(np.full((h, w, 3), [78.0, 56.0, 46.0], dtype=np.float32), (138.0, 108.0, 92.0), b_strand * 0.68)
    registry["kratos_beard_albedo"] = np.clip(beard_tex, 0, 255).astype(np.uint8)
    registry["kratos_beard_normal"] = height_to_normal(b_strand * 0.55, 2.8)

    # 2. Kratos Torso Skin & Diagonal Crimson War-Paint + Musculature AO
    body = np.full((h, w, 3), [220.0, 214.0, 206.0], dtype=np.float32)
    body += pore[..., None] * 14.0
    bh = 0.5 + pore * 0.06
    # Subtle broad muscular AO shading (works with 3D sculpted relief, no sharp grey lines!)
    sternum = np.exp(-((u - 0.5) / 0.032) ** 2) * smoothstep(0.54, 0.65, v) * (1.0 - smoothstep(0.76, 0.85, v))
    pec_under = np.exp(-((v - 0.57) / 0.032) ** 2) * (smoothstep(0.02, 0.06, np.abs(u - 0.5)) * (1.0 - smoothstep(0.16, 0.22, np.abs(u - 0.5))))
    abs_div = np.exp(-((u - 0.5) / 0.028) ** 2) * smoothstep(0.18, 0.25, v) * (1.0 - smoothstep(0.50, 0.56, v))
    body = mix_rgb(body, (176.0, 168.0, 160.0), np.clip(sternum * 0.26 + pec_under * 0.34 + abs_div * 0.24, 0, 0.45))
    bh -= (sternum + pec_under + abs_div) * 0.08

    # Continuous sweeping crimson Spartan tattoo: front-left ribs (u~0.52) -> up over left shoulder (u~0.75) -> down back (u~0.92)
    t_front_u = 0.52 + (v - 0.38) * 0.38
    tattoo_front = (1.0 - smoothstep(0.048, 0.068, np.abs(u - t_front_u))) * smoothstep(0.36, 0.43, v)
    t_back_u = 0.74 + (1.0 - v) * 0.28
    tattoo_back = (1.0 - smoothstep(0.045, 0.065, np.abs(u - t_back_u))) * smoothstep(0.34, 0.42, v)
    t_shoulder_cap = ellipse_mask(u, v, 0.74, 0.94, 0.08, 0.08, 0.35)
    body = mix_rgb(body, (176.0, 22.0, 24.0), np.clip(np.maximum.reduce([tattoo_front, tattoo_back, t_shoulder_cap]), 0, 1) * 0.94)
    # Battle scar across upper right rib
    c_scar = (1.0 - smoothstep(0.004, 0.011, np.abs((u - 0.43) + (v - 0.56) * 0.55))) * smoothstep(0.48, 0.51, v) * (1.0 - smoothstep(0.66, 0.69, v))
    body = mix_rgb(body, (192.0, 148.0, 142.0), c_scar * 0.72)
    bh -= c_scar * 0.18

    registry["kratos_body_albedo"] = np.clip(body, 0, 255).astype(np.uint8)
    registry["kratos_body_normal"] = height_to_normal(bh, 2.2)

    # 3. Kratos Leather & Embossed Bronze Armor
    grain = fbm(w, h, 5.0, 3, seed=115)
    arm = np.full((h, w, 3), [84.0, 50.0, 32.0], dtype=np.float32) + (grain[..., None] - 0.5) * 32.0
    ah = 0.5 + grain * 0.2
    border = (smoothstep(0.08, 0.12, v) * (1.0 - smoothstep(0.14, 0.18, v))) + (smoothstep(0.82, 0.86, v) * (1.0 - smoothstep(0.88, 0.92, v)))
    arm = mix_rgb(arm, (194.0, 144.0, 62.0), border * 0.88)
    ah += border * 0.25
    # Bronze rivets
    ru = ((u * 8.0) % 1.0) - 0.5
    rv = ((v * 6.0) % 1.0) - 0.5
    rivets = 1.0 - smoothstep(0.14, 0.22, np.sqrt(ru * ru + rv * rv))
    stud_band = smoothstep(0.1, 0.2, v) * (1.0 - smoothstep(0.8, 0.9, v))
    arm = mix_rgb(arm, (214.0, 168.0, 82.0), rivets * stud_band * 0.85)
    ah += rivets * stud_band * 0.25
    rough = np.where(border > 0.3, 0.32, 0.66)
    metal = np.where(border > 0.3, 0.62, 0.12)
    registry["kratos_armor_albedo"] = np.clip(arm, 0, 255).astype(np.uint8)
    registry["kratos_armor_normal"] = height_to_normal(ah, 3.0)
    registry["kratos_armor_orm"] = make_orm(np.ones_like(grain), rough, metal)

    # 4. Kratos Wolf-Fur Mantle Texture
    strand_noise = value_noise(w, h, 3.5, seed=123)
    fur_strand = np.sin(u * 140.0 + strand_noise * 5.0) * 0.5 + 0.5
    fur = mix_rgb(np.full((h, w, 3), [48.0, 42.0, 38.0], dtype=np.float32), (102.0, 92.0, 84.0), fur_strand * 0.72 + grain * 0.28)
    registry["kratos_fur_albedo"] = np.clip(fur, 0, 255).astype(np.uint8)
    registry["kratos_fur_normal"] = height_to_normal(fur_strand * 0.55 + grain * 0.3, 3.2)


def bake_wukong(registry: Dict[str, np.ndarray]) -> None:
    w = h = 256
    u, v = make_grid(w, h)
    fur_n = fbm(w, h, 4.0, 3, seed=201)

    # 1. Monkey King Face: peach-tan heart muzzle transitioning into warm chestnut-gold monkey fur
    fur_col = np.full((h, w, 3), [176.0, 98.0, 38.0], dtype=np.float32)
    fur_streak = np.sin(u * 130.0 + fur_n * 6.0) * 14.0
    fur_col += fur_streak[..., None]
    fh = 0.5 + fur_n * 0.22 + np.sin(u * 130.0 + fur_n * 6.0) * 0.08

    # Heart-shaped hairless face mask around u = 0.5
    eye_mask_l = ellipse_mask(u, v, 0.445, 0.54, 0.082, 0.092, 0.32)
    eye_mask_r = ellipse_mask(u, v, 0.555, 0.54, 0.082, 0.092, 0.32)
    muzzle_mask = ellipse_mask(u, v, 0.5, 0.33, 0.115, 0.145, 0.32)
    face_mask = np.clip(np.maximum.reduce([eye_mask_l, eye_mask_r, muzzle_mask]), 0.0, 1.0)
    skin_tone = mix_rgb(np.full((h, w, 3), [212.0, 152.0, 108.0], dtype=np.float32), (235.0, 184.0, 140.0), 1.0 - np.abs(u - 0.5) * 4.0)
    head = mix_rgb(fur_col, skin_tone, face_mask)
    fh = fh * (1.0 - face_mask) + 0.45 * face_mask

    # Crimson & Gold warrior forehead emblem
    crest = ellipse_mask(u, v, 0.5, 0.65, 0.022, 0.036, 0.25)
    head = mix_rgb(head, (220.0, 38.0, 38.0), crest * 0.9)

    # Fiery golden eyes ("Huo Yan Jin Jing")
    head = paint_eyes(u, v, head, fh, (250.0, 178.0, 22.0), (105.0, 48.0, 16.0), eye_v=0.535, eye_du=0.072, fierce_tilt=0.18)
    head = paint_lips(u, v, head, fh, (176.0, 98.0, 74.0), lip_v=0.255)

    registry["wukong_head_albedo"] = np.clip(head, 0, 255).astype(np.uint8)
    registry["wukong_head_normal"] = height_to_normal(fh, 2.5)

    # 2. Mountain-Scale Eastern Armor ("Shanwenjia") + Crimson Silk Tunic
    # Build crisp interlocking diamond/mountain scale grid
    sc_u = (u * 14.0) + (np.floor(v * 14.0) % 2.0) * 0.5
    fx = (sc_u % 1.0) - 0.5
    fy = ((v * 14.0) % 1.0) - 0.5
    scale_dist = np.abs(fx) * 1.15 + np.abs(fy)
    scale_ridge = smoothstep(0.38, 0.56, scale_dist) * (1.0 - smoothstep(0.56, 0.72, scale_dist))
    scale_plate = 1.0 - smoothstep(0.45, 0.65, scale_dist)

    crimson_silk = np.full((h, w, 3), [158.0, 24.0, 26.0], dtype=np.float32) + (fur_n[..., None] - 0.5) * 18.0
    gold_armor = np.full((h, w, 3), [226.0, 174.0, 48.0], dtype=np.float32)
    armor = mix_rgb(crimson_silk, (198.0, 146.0, 36.0), scale_plate * 0.85)
    armor = mix_rgb(armor, (248.0, 206.0, 78.0), scale_ridge * 0.95)
    # Crimson center silk sash band vertically
    center_sash = smoothstep(0.43, 0.45, u) * (1.0 - smoothstep(0.55, 0.57, u)) * (1.0 - smoothstep(0.42, 0.52, v))
    armor = mix_rgb(armor, (186.0, 22.0, 28.0), center_sash * 0.9)
    # Waist gold brocade band
    belt_band = smoothstep(0.04, 0.08, v) * (1.0 - smoothstep(0.18, 0.22, v))
    armor = mix_rgb(armor, (238.0, 186.0, 52.0), belt_band * 0.92)

    ah = 0.45 + scale_plate * 0.22 + scale_ridge * 0.28 + belt_band * 0.2
    rough = np.where((scale_plate > 0.4) | (belt_band > 0.3), 0.30, 0.62)
    metal = np.where((scale_plate > 0.4) | (belt_band > 0.3), 0.56, 0.06)

    registry["wukong_armor_albedo"] = np.clip(armor, 0, 255).astype(np.uint8)
    registry["wukong_armor_normal"] = height_to_normal(ah, 2.8)
    registry["wukong_armor_orm"] = make_orm(np.ones_like(ah), rough, metal)

    # Striped crimson & gold pheasant feather pattern
    band = np.sin(v * np.pi * 16.0) * 0.5 + 0.5
    feather = mix_rgb(np.full((h, w, 3), [176.0, 22.0, 24.0], dtype=np.float32), (244.0, 186.0, 54.0), smoothstep(0.35, 0.65, band))
    registry["wukong_feather_albedo"] = np.clip(feather, 0, 255).astype(np.uint8)

    # Rich chestnut-gold textured monkey mane & fur
    m_strand = np.sin(u * 110.0 + fur_n * 5.0) * 0.5 + 0.5
    mane = mix_rgb(np.full((h, w, 3), [138.0, 72.0, 24.0], dtype=np.float32), (212.0, 128.0, 48.0), m_strand * 0.72)
    registry["wukong_hair_albedo"] = np.clip(mane, 0, 255).astype(np.uint8)
    registry["wukong_hair_normal"] = height_to_normal(m_strand * 0.5 + fur_n * 0.3, 2.8)


def bake_michael(registry: Dict[str, np.ndarray]) -> None:
    w = h = 256
    u, v = make_grid(w, h)
    pore = fbm(w, h, 6.0, 3, seed=301) - 0.5

    # 1. Realistic Middle-Aged Skin + Salt-and-Pepper Temple Fade + Subtle Stubble
    skin = np.full((h, w, 3), [220.0, 168.0, 134.0], dtype=np.float32) + pore[..., None] * 14.0
    sh = 0.5 + pore * 0.05
    # Warm cheek & nasolabial shadow
    cheek_s = ellipse_mask(u, v, 0.42, 0.37, 0.055, 0.065, 0.6) + ellipse_mask(u, v, 0.58, 0.37, 0.055, 0.065, 0.6)
    skin = mix_rgb(skin, (190.0, 134.0, 104.0), cheek_s * 0.25)
    # Eyes (semi-visible behind shades) & brows
    skin = paint_eyes(u, v, skin, sh, (72.0, 108.0, 128.0), (54.0, 56.0, 62.0), eye_v=0.535, eye_du=0.072, fierce_tilt=0.08)
    skin = paint_lips(u, v, skin, sh, (176.0, 118.0, 98.0), lip_v=0.255)

    # Five-o'clock jaw stubble & salt-and-pepper hairline
    stubble_n = value_noise(w, h, 2.2, seed=307)
    jaw = (1.0 - smoothstep(0.28, 0.38, v)) * (1.0 - smoothstep(0.15, 0.25, np.abs(u - 0.5)))
    skin = mix_rgb(skin, (112.0, 96.0, 88.0), jaw * (0.28 + 0.24 * stubble_n))
    sh += jaw * stubble_n * 0.08

    # Smooth natural arched hairline (curved temple recess, NO boxy square cut!)
    temple_curve = 0.69 + 0.055 * np.exp(-((u - 0.5) / 0.14) ** 2) - 0.04 * smoothstep(0.12, 0.24, np.abs(u - 0.5))
    hair_crown = smoothstep(temple_curve - 0.035, temple_curve + 0.035, v)
    side_temples = smoothstep(0.17, 0.24, np.abs(u - 0.5)) * smoothstep(0.36, 0.48, v)
    hair_edge = np.clip(np.maximum(hair_crown, side_temples), 0, 1)
    sp_wave = np.sin(u * 120.0 + v * 35.0) * 0.5 + 0.5
    sp = mix_rgb(np.full((h, w, 3), [62.0, 64.0, 72.0], dtype=np.float32), (146.0, 152.0, 162.0), sp_wave * 0.35 + value_noise(w, h, 3.0, seed=311) * 0.3)
    skin = mix_rgb(skin, sp, np.clip(hair_edge, 0, 1))
    registry["michael_head_albedo"] = np.clip(skin, 0, 255).astype(np.uint8)
    registry["michael_head_normal"] = height_to_normal(sh, 2.0)

    # Brushed salt-and-pepper hair strands for Michael's swept crown
    mh_strand = np.sin(u * 130.0 + v * 28.0) * 0.5 + 0.5
    mh_col = mix_rgb(np.full((h, w, 3), [56.0, 60.0, 68.0], dtype=np.float32), (154.0, 160.0, 170.0), mh_strand * 0.42 + value_noise(w, h, 4.0, seed=317) * 0.28)
    registry["michael_hair_albedo"] = np.clip(mh_col, 0, 255).astype(np.uint8)
    registry["michael_hair_normal"] = height_to_normal(mh_strand * 0.45, 2.4)

    # 2. Tailored Charcoal-Navy Suit Wool (readable under stage lights!)
    weave_u = np.sin(u * 340.0) * 0.5 + 0.5
    weave_v = np.sin(v * 340.0) * 0.5 + 0.5
    wool = np.full((h, w, 3), [52.0, 66.0, 88.0], dtype=np.float32)
    wool += ((weave_u * 0.6 + weave_v * 0.4) - 0.5)[..., None] * 14.0
    # Subtle pinstripe every ~14px horizontally
    pin = np.exp(-((((u * 26.0) % 1.0) - 0.5) / 0.08) ** 2)
    wool = mix_rgb(wool, (118.0, 134.0, 160.0), pin * 0.32)
    nh = 0.5 + weave_u * 0.08 + weave_v * 0.08
    registry["michael_suit_albedo"] = np.clip(wool, 0, 255).astype(np.uint8)
    registry["michael_suit_normal"] = height_to_normal(nh, 1.5)
    registry["michael_suit_orm"] = make_orm(np.ones_like(nh), np.full_like(nh, 0.68), np.full_like(nh, 0.04))

    # Crisp White Shirt + Burgundy/Silver Silk Striped Tie
    shirt = np.full((h, w, 3), [242.0, 245.0, 250.0], dtype=np.float32)
    tie_diag = ((u * 8.0 + v * 8.0) % 1.0)
    tie = mix_rgb(np.full((h, w, 3), [128.0, 26.0, 36.0], dtype=np.float32), (212.0, 178.0, 108.0), smoothstep(0.45, 0.52, np.abs(tie_diag - 0.5)) * 0.8)
    registry["michael_shirt_albedo"] = np.clip(shirt, 0, 255).astype(np.uint8)
    registry["michael_tie_albedo"] = np.clip(tie, 0, 255).astype(np.uint8)


def bake_spiderman(registry: Dict[str, np.ndarray]) -> None:
    w = h = 256
    u, v = make_grid(w, h)

    # Hexagonal micro-fabric bump for MCU / Insomniac tech suit texture
    hx = (u * 52.0 + (np.floor(v * 52.0) % 2.0) * 0.5) % 1.0 - 0.5
    hy = (v * 52.0) % 1.0 - 0.5
    hex_cell = 1.0 - smoothstep(0.32, 0.48, np.maximum(np.abs(hx), np.abs(hy)))

    crimson = np.full((h, w, 3), [222.0, 28.0, 34.0], dtype=np.float32) + hex_cell[..., None] * 14.0
    cobalt = np.full((h, w, 3), [28.0, 82.0, 212.0], dtype=np.float32) + hex_cell[..., None] * 12.0

    # --- 1. Masked Head with Radial Center-Origin Scalloped Webbing ---
    du = u - 0.5
    dv = v - 0.47  # origin between eyes on nose bridge
    r = np.sqrt(du * du + dv * dv * 0.92) + 1e-6
    ang = np.arctan2(dv, du)
    num_spokes = 12.0
    spoke_phase = np.abs(((ang / (2.0 * math.pi) * num_spokes) % 1.0) - 0.5)
    spokes = 1.0 - smoothstep(0.045, 0.11, spoke_phase * np.clip(r * 5.0, 0.35, 1.4))
    # Scallop inward curve between spokes
    scallop = 0.016 * np.abs(np.cos(ang * num_spokes * 0.5))
    ring_phase = np.abs((((r + scallop) * 14.0) % 1.0) - 0.5)
    rings = 1.0 - smoothstep(0.06, 0.14, ring_phase)
    rings *= smoothstep(0.055, 0.085, r)
    spokes *= smoothstep(0.045, 0.075, r)
    web_h = np.clip(np.maximum(spokes, rings), 0.0, 1.0)

    head = mix_rgb(crimson, (16.0, 18.0, 22.0), web_h * 0.94)
    hh = 0.5 + hex_cell * 0.08 + web_h * 0.32
    registry["spiderman_head_albedo"] = np.clip(head, 0, 255).astype(np.uint8)
    registry["spiderman_head_normal"] = height_to_normal(hh, 2.8)

    # --- 2. Suit Body UV: Center chest/abs + shoulder cap RED with web; Side flanks BLUE ---
    # Smooth athletic curved waist-to-shoulder paneling
    dist_front = np.abs(u - 0.5)
    dist_back = np.minimum(u, 1.0 - u)
    panel_width = 0.11 + 0.07 * smoothstep(0.32, 0.72, v)
    in_red_front = 1.0 - smoothstep(panel_width - 0.012, panel_width + 0.012, dist_front)
    in_red_back = 1.0 - smoothstep(panel_width * 0.9 - 0.012, panel_width * 0.9 + 0.012, dist_back)
    in_yoke = smoothstep(0.73 - 0.05 * np.cos((u - 0.5) * math.pi * 2), 0.78 - 0.05 * np.cos((u - 0.5) * math.pi * 2), v)
    in_belt = 1.0 - smoothstep(0.08, 0.12, v)
    red_mask = np.clip(np.maximum.reduce([in_red_front, in_red_back, in_yoke, in_belt]), 0.0, 1.0)

    # Seam border right along red-to-blue boundary
    seam = np.exp(-((red_mask - 0.5) / 0.16) ** 2) * (1.0 - in_yoke * 0.3)

    # Body web lines radiating cleanly across the red panels
    b_r = np.sqrt(((u - 0.5) ** 2) + ((v - 0.64) ** 2) * 0.85) + 1e-6
    b_ang = np.arctan2(v - 0.64, u - 0.5)
    b_spoke_phase = np.abs(((b_ang / (2.0 * math.pi) * 14.0) % 1.0) - 0.5)
    b_spokes = (1.0 - smoothstep(0.04, 0.1, b_spoke_phase * np.clip(b_r * 4.5, 0.4, 1.4))) * smoothstep(0.04, 0.07, b_r)
    b_rings = (1.0 - smoothstep(0.06, 0.13, np.abs((((b_r + 0.014 * np.abs(np.cos(b_ang * 7.0))) * 12.0) % 1.0) - 0.5))) * smoothstep(0.045, 0.075, b_r)
    body_web = np.maximum(b_spokes, b_rings) * red_mask

    suit = mix_rgb(cobalt, crimson, red_mask)
    suit = mix_rgb(suit, (14.0, 16.0, 22.0), np.clip(np.maximum(body_web, seam), 0, 1) * 0.92)
    sh = 0.5 + hex_cell * 0.08 + body_web * 0.28 + seam * 0.22
    rough = np.where(body_web > 0.35, 0.26, 0.48)
    metal = np.full_like(sh, 0.06)

    registry["spiderman_body_albedo"] = np.clip(suit, 0, 255).astype(np.uint8)
    registry["spiderman_body_normal"] = height_to_normal(sh, 2.8)
    registry["spiderman_body_orm"] = make_orm(np.ones_like(sh), rough, metal)

    # Limb map: full cobalt base with crimson web gauntlets/boots
    limb_red = smoothstep(0.58, 0.64, v)  # forearms/boots near red caps or cuffs
    l_spokes = 1.0 - smoothstep(0.06, 0.13, np.abs(((u * 10.0) % 1.0) - 0.5))
    l_rings = 1.0 - smoothstep(0.06, 0.13, np.abs(((v * 12.0) % 1.0) - 0.5))
    l_web = np.maximum(l_spokes, l_rings) * limb_red
    limb = mix_rgb(cobalt, crimson, limb_red)
    limb = mix_rgb(limb, (16.0, 18.0, 22.0), np.maximum(l_web, np.exp(-((limb_red - 0.5) / 0.18) ** 2)) * 0.92)
    lh = 0.5 + hex_cell * 0.08 + l_web * 0.26
    registry["spiderman_limb_albedo"] = np.clip(limb, 0, 255).astype(np.uint8)
    registry["spiderman_limb_normal"] = height_to_normal(lh, 2.6)


def bake_ironman(registry: Dict[str, np.ndarray]) -> None:
    w = h = 256
    u, v = make_grid(w, h)
    brushed = fbm(w, h, 3.5, 2, seed=501) * 0.5 + value_noise(w, h, 2.0, seed=509) * 0.5

    # Vibrant Hot-Rod Candy Red + Champagne Gold Titanium (avoids turning dark brown!)
    candy_red = np.full((h, w, 3), [218.0, 28.0, 28.0], dtype=np.float32) + (brushed[..., None] - 0.5) * 14.0
    gold_alloy = np.full((h, w, 3), [245.0, 198.0, 52.0], dtype=np.float32) + (brushed[..., None] - 0.5) * 12.0
    dark_frame = np.full((h, w, 3), [48.0, 52.0, 62.0], dtype=np.float32)

    # --- 1. Mark LXXXV Armor Body Texture ---
    # Angular geometric Mark LXXXV gold shoulder/collar stripes & side-rib cutouts
    au = np.abs(u - 0.5)
    gold_collar = smoothstep(0.74, 0.78, v) * smoothstep(0.08, 0.10, au) * (1.0 - smoothstep(0.19, 0.23, au))
    gold_chev = (1.0 - smoothstep(0.025, 0.042, np.abs((v - 0.42) + au * 0.45))) * smoothstep(0.08, 0.11, au) * (1.0 - smoothstep(0.22, 0.25, au))
    gold_mask = np.clip(np.maximum(gold_collar, gold_chev), 0.0, 1.0)

    # Dark mechanical inner frame along side-waist joints
    frame_mask = smoothstep(0.18, 0.22, v) * (1.0 - smoothstep(0.38, 0.42, v)) * smoothstep(0.17, 0.21, au) * (1.0 - smoothstep(0.32, 0.36, au))

    # Diagonal angular Mark LXXXV pectoral & abdominal panel seams
    pec_diag = (1.0 - smoothstep(0.005, 0.011, np.abs((v - 0.56) - (au - 0.08) * 0.35))) * smoothstep(0.03, 0.05, au) * (1.0 - smoothstep(0.24, 0.27, au))
    sternum_seam = np.exp(-((u - 0.5) / 0.005) ** 2) * smoothstep(0.22, 0.26, v) * (1.0 - smoothstep(0.58, 0.62, v))
    abs_chev = (1.0 - smoothstep(0.004, 0.009, np.abs((v - 0.34) + au * 0.3))) * (1.0 - smoothstep(0.15, 0.18, au))
    seams = np.clip(np.maximum.reduce([pec_diag, sternum_seam, abs_chev]), 0.0, 1.0)

    col = mix_rgb(candy_red, gold_alloy, gold_mask)
    col = mix_rgb(col, dark_frame, frame_mask * 0.9)
    col = mix_rgb(col, (26.0, 16.0, 18.0), seams * 0.85)
    # Subtle metallic highlight along upper pectoral slope so suit reads glossy red in studio light
    highlight = smoothstep(0.62, 0.82, v) * (1.0 - smoothstep(0.0, 0.25, np.abs(u - 0.5)))
    col += highlight[..., None] * 18.0

    bh = 0.5 + brushed * 0.03 - seams * 0.34 - frame_mask * 0.15 + gold_mask * 0.08
    # Calibrated for vivid hot-red armor sheen without darkening to brown in stage light
    rough = np.where(frame_mask > 0.4, 0.55, 0.24)
    metal = np.where(frame_mask > 0.4, 0.35, np.where(gold_mask > 0.4, 0.62, 0.42))
    registry["ironman_armor_albedo"] = np.clip(col, 0, 255).astype(np.uint8)
    registry["ironman_armor_normal"] = height_to_normal(bh, 3.0)
    registry["ironman_armor_orm"] = make_orm(np.ones_like(bh), rough, metal)

    # --- 2. Mark LXXXV Helmet Map (Candy Red Cranium + Champagne Gold Faceplate + Cyan Slits) ---
    # Faceplate occupies front center u=[0.365, 0.635], v=[0.14, 0.74] with slight temple wings
    mask_u = 0.132 - 0.025 * smoothstep(0.20, 0.45, np.abs(v - 0.48))
    faceplate = (1.0 - smoothstep(mask_u - 0.012, mask_u + 0.012, np.abs(u - 0.5))) * smoothstep(0.14, 0.19, v) * (1.0 - smoothstep(0.72, 0.77, v))
    cheek_cut = (1.0 - smoothstep(0.006, 0.014, np.abs(np.abs(u - 0.5) - mask_u))) * smoothstep(0.15, 0.2, v) * (1.0 - smoothstep(0.7, 0.75, v))
    head = mix_rgb(candy_red, gold_alloy, faceplate)
    head = mix_rgb(head, (30.0, 18.0, 16.0), cheek_cut * 0.9)
    hh = 0.5 + faceplate * 0.14 - cheek_cut * 0.32
    registry["ironman_head_albedo"] = np.clip(head, 0, 255).astype(np.uint8)
    registry["ironman_head_normal"] = height_to_normal(hh, 2.8)


def bake_thor(registry: Dict[str, np.ndarray]) -> None:
    w = h = 256
    u, v = make_grid(w, h)
    pore = fbm(w, h, 6.0, 3, seed=601) - 0.5

    # 1. Nordic Hero Face + Piercing Electric Blue Eyes + Blonde Beard Fade
    skin = np.full((h, w, 3), [226.0, 176.0, 142.0], dtype=np.float32) + pore[..., None] * 12.0
    sh = 0.5 + pore * 0.05
    skin = paint_eyes(u, v, skin, sh, (76.0, 168.0, 240.0), (176.0, 132.0, 48.0), eye_v=0.535, eye_du=0.072, fierce_tilt=0.18)
    skin = paint_lips(u, v, skin, sh, (184.0, 128.0, 108.0), lip_v=0.255)
    beard_grain = fbm(w, h, 3.0, 2, seed=603)
    jaw = (1.0 - smoothstep(0.27, 0.36, v)) * (1.0 - smoothstep(0.14, 0.23, np.abs(u - 0.5)))
    must = ellipse_mask(u, v, 0.5, 0.292, 0.068, 0.022, 0.35)
    beard_blend = np.clip(np.maximum(jaw, must) * (0.65 + 0.35 * beard_grain), 0.0, 1.0)
    beard_col = mix_rgb(np.full((h, w, 3), [176.0, 130.0, 48.0], dtype=np.float32), (232.0, 192.0, 92.0), np.sin(u * 130.0) * 0.5 + 0.5)
    skin = mix_rgb(skin, beard_col, beard_blend * 0.90)
    sh += beard_blend * 0.15
    registry["thor_head_albedo"] = np.clip(skin, 0, 255).astype(np.uint8)
    registry["thor_head_normal"] = height_to_normal(sh, 2.2)

    # 2. Asgardian Cuirass (Rich Storm Navy + Embossed Silver Steel Plate Trims — reads clearly!)
    cloth_grain = fbm(w, h, 4.0, 2, seed=607)
    cuirass = np.full((h, w, 3), [42.0, 58.0, 86.0], dtype=np.float32) + (cloth_grain[..., None] - 0.5) * 14.0
    # Sculpted silver V-ribs & center steel trim
    v_rib = (1.0 - smoothstep(0.01, 0.024, np.abs(np.abs(u - 0.5) - (v - 0.22) * 0.36))) * smoothstep(0.22, 0.26, v) * (1.0 - smoothstep(0.78, 0.84, v))
    abs_seg = (np.exp(-((v - 0.28) / 0.009) ** 2) + np.exp(-((v - 0.40) / 0.009) ** 2)) * (1.0 - smoothstep(0.12, 0.16, np.abs(u - 0.5)))
    silver_trim = np.clip(np.maximum(v_rib, abs_seg * 0.75), 0.0, 1.0)
    # Warm leather battle belt around waist
    belt = (1.0 - smoothstep(0.08, 0.12, v))
    cuirass = mix_rgb(cuirass, (186.0, 198.0, 214.0), silver_trim * 0.88)
    cuirass = mix_rgb(cuirass, (92.0, 56.0, 32.0), belt * 0.9)
    ch = 0.5 + silver_trim * 0.26 + belt * 0.16 + cloth_grain * 0.05
    rough = np.where(silver_trim > 0.3, 0.28, 0.58)
    metal = np.where(silver_trim > 0.3, 0.56, 0.12)
    registry["thor_armor_albedo"] = np.clip(cuirass, 0, 255).astype(np.uint8)
    registry["thor_armor_normal"] = height_to_normal(ch, 2.8)
    registry["thor_armor_orm"] = make_orm(np.ones_like(ch), rough, metal)

    # 3. Interlocking Asgardian Silver Chainmail Sleeves
    lx = ((u * 24.0 + (np.floor(v * 24.0) % 2.0) * 0.5) % 1.0) - 0.5
    ly = ((v * 24.0) % 1.0) - 0.5
    ring_d = np.sqrt(lx * lx + ly * ly)
    ring = smoothstep(0.2, 0.32, ring_d) * (1.0 - smoothstep(0.38, 0.48, ring_d))
    chain = mix_rgb(np.full((h, w, 3), [66.0, 74.0, 88.0], dtype=np.float32), (188.0, 200.0, 218.0), ring * 0.9)
    registry["thor_chain_albedo"] = np.clip(chain, 0, 255).astype(np.uint8)
    registry["thor_chain_normal"] = height_to_normal(0.3 + ring * 0.55, 3.0)
    registry["thor_chain_orm"] = make_orm(np.ones_like(ring), np.where(ring > 0.4, 0.28, 0.72), np.where(ring > 0.4, 0.62, 0.15))

    # 4. Golden Blonde Hair Strands
    hair_wave = np.sin(u * 90.0 + fbm(w, h, 6.0, 2, seed=619) * 4.0) * 0.5 + 0.5
    hair = mix_rgb(np.full((h, w, 3), [174.0, 128.0, 42.0], dtype=np.float32), (242.0, 204.0, 102.0), hair_wave)
    registry["thor_hair_albedo"] = np.clip(hair, 0, 255).astype(np.uint8)
    registry["thor_hair_normal"] = height_to_normal(hair_wave * 0.5, 2.5)


def bake_steve(registry: Dict[str, np.ndarray]) -> None:
    # Sharp voxel pixel art baked at 128x128 with subtle per-pixel chamfer bevel normals!
    # Convention reminder: gy=0 is BOTTOM (v=0), gy=H-1 is TOP (v=1).
    def build_pixel_normal(pix_grid_h: np.ndarray, sub: int = 16) -> np.ndarray:
        gh, gw = pix_grid_h.shape
        out = np.zeros((gh * sub, gw * sub), dtype=np.float32)
        for y in range(gh):
            for x in range(gw):
                out[y * sub : (y + 1) * sub, x * sub : (x + 1) * sub] = pix_grid_h[y, x]
        # Subtle chamfer edge inside each voxel pixel so light catches voxel relief!
        su = (np.arange(gw * sub) % sub) / sub - 0.5
        sv = (np.arange(gh * sub) % sub) / sub - 0.5
        uu, vv = np.meshgrid(su, sv)
        edge = np.maximum(np.abs(uu), np.abs(vv))
        bevel = 1.0 - smoothstep(0.36, 0.49, edge)
        return height_to_normal(out * 0.55 + bevel * 0.18, 2.2)

    palette = {
        "H": (58, 36, 22),      # Dark brown hair
        "h": (74, 48, 30),      # Lighter hair pixel variation
        "S": (182, 134, 99),    # Steve classic tan skin
        "s": (166, 118, 86),    # Slightly shaded skin pixel
        "E": (250, 250, 252),   # Eye white
        "P": (82, 62, 218),     # Iconic Steve indigo eye
        "N": (140, 88, 60),     # Classic pixel nose
        "M": (208, 166, 140),   # Mouth/lip highlight
        "B": (56, 34, 22),      # Goatee beard
        "C": (18, 178, 202),    # Turquoise shirt
        "c": (14, 152, 176),    # Shaded shirt fold
        "D": (56, 224, 246),    # Enchanted diamond armor trim
        "d": (18, 118, 145),    # Deep diamond shadow
        "W": (214, 252, 255),   # Bright diamond shine
        "V": (168, 85, 247),    # Enchanted boss amethyst crystal accent
        "A": (42, 38, 56),      # Netherite dark boss chestplate steel
        "J": (36, 40, 128),     # Indigo jeans
    }

    # Steve Head Front Face (row 0 = BOTTOM chin, row 7 = TOP forehead!)
    face_rows_top_to_bot = [
        "HHhHHhHH",
        "HhHHHHhH",
        "HSSSSSSH",
        "SSsSSsSS",
        "SEPSSPES",
        "SSsNNsSS",
        "SSBMMBSS",
        "SSBBBBSS",
    ]
    face_rows = face_rows_top_to_bot[::-1]  # invert so row 0 = bottom (v=0)

    def grid_to_img(rows: list[str], sub: int = 16) -> Tuple[np.ndarray, np.ndarray]:
        gh = len(rows)
        gw = len(rows[0])
        rgba = np.zeros((gh * sub, gw * sub, 3), dtype=np.uint8)
        hg = np.full((gh, gw), 0.5, dtype=np.float32)
        for y in range(gh):
            for x in range(gw):
                ch = rows[y][x]
                rgba[y * sub : (y + 1) * sub, x * sub : (x + 1) * sub] = palette[ch]
                hg[y, x] = 0.7 if ch in ("H", "B", "D", "V", "A") else 0.5
        return rgba, build_pixel_normal(hg, sub)

    f_alb, f_nrm = grid_to_img(face_rows, 16)
    registry["steve_face_albedo"] = f_alb
    registry["steve_face_normal"] = f_nrm

    # Steve Shirt Front (row 0 = BOTTOM waist, row 7 = TOP neck!) with V-neck collar & turquoise shading
    shirt_rows_top_to_bot = [
        "CCCSSCCC",
        "CcCSsCcC",
        "CCCCCCCC",
        "CcCCCCcC",
        "CCCCCCCC",
        "CcCCCCcC",
        "CCCCCCCC",
        "CCJJJJCC",
    ]
    s_alb, s_nrm = grid_to_img(shirt_rows_top_to_bot[::-1], 16)
    registry["steve_shirt_albedo"] = s_alb
    registry["steve_shirt_normal"] = s_nrm

    # Clean Minecraft Boss Enchanted Netherite-and-Diamond Armor Trim texture (chunky border plates, NO barcode stripes!)
    armor_rows_top_to_bot = [
        "DDDDDDDD",
        "DAAAAAAd",
        "DAAAAAAd",
        "DAAVVAAd",
        "DAAVVAAd",
        "DAAAAAAd",
        "DDDDDDDD",
        "AAAAAAAA",
    ]
    ba_alb, ba_nrm = grid_to_img(armor_rows_top_to_bot[::-1], 16)
    registry["steve_bossarmor_albedo"] = ba_alb
    registry["steve_bossarmor_normal"] = ba_nrm
    # Tasteful soft purple crystal glint at center jewel only (no blown-out white stripes!)
    ba_em = np.zeros_like(ba_alb)
    gem_px = (ba_alb[..., 0] > 140) & (ba_alb[..., 2] > 200)
    dia_px = (ba_alb[..., 2] > 210) & ~gem_px
    ba_em[gem_px] = (140, 60, 220)
    ba_em[dia_px] = (16, 85, 110)
    registry["steve_bossarmor_emissive"] = ba_em

    # Crisp TNT Block Texture (side face with crisp red wood slats, white paper band, and black pixel "TNT")
    tnt_sub = 8
    tnt = np.zeros((16 * tnt_sub, 16 * tnt_sub, 3), dtype=np.uint8)
    for y in range(16):
        for x in range(16):
            if 5 <= y <= 10:
                c = (242, 240, 236)
                # Pixel letters T N T centered inside white band (y=6..9)
                in_T1 = (6 <= y <= 9 and x == 3) or (y == 9 and 2 <= x <= 4)
                in_N = (6 <= y <= 9 and x in (6, 9)) or (y == 8 and x == 7) or (y == 7 and x == 8)
                in_T2 = (6 <= y <= 9 and x == 12) or (y == 9 and 11 <= x <= 13)
                if in_T1 or in_N or in_T2:
                    c = (18, 18, 22)
            else:
                plank = ((x % 3) - 1) * 14 + (((x * 5 + y * 3) % 3) - 1) * 6
                c = (max(0, min(255, 204 + plank)), max(0, min(255, 42 + plank // 3)), max(0, min(255, 34 + plank // 3)))
            tnt[y * tnt_sub : (y + 1) * tnt_sub, x * tnt_sub : (x + 1) * tnt_sub] = c
    registry["steve_tnt_albedo"] = tnt

    # Diamond Sword Pixel Texture (beveled turquoise/cyan with white glint)
    dia_rows_top_to_bot = [
        "DDDDDDDD",
        "DCCCCCCd",
        "DCWWWWCd",
        "DCWDDWCd",
        "DCWDDWCd",
        "DCWWWWCd",
        "DCCCCCCd",
        "dddddddd",
    ]
    # Expand palette gently for diamond sword
    palette["W"] = (214, 252, 255)
    palette["d"] = (18, 118, 145)
    d_alb, _ = grid_to_img(dia_rows_top_to_bot[::-1], 8)
    registry["steve_diamond_albedo"] = d_alb


def save_texture(name: str, rgb: np.ndarray, manifest: Dict[str, dict]) -> None:
    h, w = rgb.shape[:2]
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[..., :3] = rgb
    rgba[..., 3] = 255
    blob = zlib.compress(rgba.tobytes(), level=6)
    zpath = OUT_DIR / f"{name}.ztex"
    zpath.write_bytes(blob)
    manifest[name] = {"width": w, "height": h, "file": zpath.name}
    # Save human-readable preview flipped vertically so head/chest face up in Finder/Preview
    Image.fromarray(rgba[::-1], mode="RGBA").save(PREVIEW_DIR / f"{name}.png")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)

    registry: Dict[str, np.ndarray] = {}
    bake_kratos(registry)
    bake_wukong(registry)
    bake_michael(registry)
    bake_spiderman(registry)
    bake_ironman(registry)
    bake_thor(registry)
    bake_steve(registry)

    manifest: Dict[str, dict] = {}
    for name, arr in registry.items():
        save_texture(name, arr, manifest)

    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"Baked {len(manifest)} PBR textures into {OUT_DIR}")


if __name__ == "__main__":
    main()
