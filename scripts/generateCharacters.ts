import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import type { FighterId } from '../src/core/types';
import { FIGHTER_ROSTER, ROSTER_ORDER } from '../src/characters/roster';
import { installNodeGltfEnv } from './gltfNodeEnv';
import { buildCharacterAnimationClips } from './characterAnimations';
import {
  BakedTextureBank,
  buildAnatomicalArmWithHand,
  buildAnatomicalLegAndBoot,
  buildAnatomicalTorso,
  buildConformingBeard,
  buildCurvedVisorOrLens,
  buildPleatedCape,
  buildSculptedEar,
  buildSculptedHairCrown,
  buildSculptedHead,
  buildVoxelSwordGeometry,
  makeBoneBoundPart,
  optimizeCharacterMeshes,
} from './sculptureBuilder';

installNodeGltfEnv();

function createSkeleton(scale: number, shMul: number): { root: THREE.Group; bones: THREE.Bone[]; skeleton: THREE.Skeleton; map: Record<string, number> } {
  const root = new THREE.Group();
  root.name = 'CharacterRoot';

  const boneList: THREE.Bone[] = [];
  const map: Record<string, number> = {};
  const addBone = (name: string, parent: THREE.Object3D, x: number, y: number, z: number): THREE.Bone => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x, y, z);
    parent.add(b);
    map[name] = boneList.length;
    boneList.push(b);
    return b;
  };

  const hips = addBone('Hips', root, 0, 0.92 * scale, 0);
  const spine = addBone('Spine', hips, 0, 0.14 * scale, 0);
  const chest = addBone('Chest', spine, 0, 0.18 * scale, 0);
  const neck = addBone('Neck', chest, 0, 0.25 * scale, 0);
  addBone('Head', neck, 0, 0.08 * scale, 0);

  const shOff = 0.22 * shMul * scale;
  const lShoulder = addBone('lShoulder', chest, shOff, 0.21 * scale, 0);
  const lElbow = addBone('lElbow', lShoulder, 0, -0.26 * scale, 0);
  const lHand = addBone('lHand', lElbow, 0, -0.24 * scale, 0);

  const rShoulder = addBone('rShoulder', chest, -shOff, 0.21 * scale, 0);
  const rElbow = addBone('rElbow', rShoulder, 0, -0.26 * scale, 0);
  const rHand = addBone('rHand', rElbow, 0, -0.24 * scale, 0);

  const thighOff = 0.105 * scale;
  const lThigh = addBone('lThigh', hips, thighOff, -0.05 * scale, 0);
  const lKnee = addBone('lKnee', lThigh, 0, -0.41 * scale, 0);
  addBone('lAnkle', lKnee, 0, -0.41 * scale, 0);

  const rThigh = addBone('rThigh', hips, -thighOff, -0.05 * scale, 0);
  const rKnee = addBone('rKnee', rThigh, 0, -0.41 * scale, 0);
  addBone('rAnkle', rKnee, 0, -0.41 * scale, 0);

  addBone('WeaponR', rHand, 0, -0.03 * scale, 0.025 * scale);
  addBone('WeaponL', lHand, 0, -0.03 * scale, 0.025 * scale);
  addBone('CapeTail', chest, 0, 0.21 * scale, -0.14 * scale);

  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(boneList);
  return { root, bones: boneList, skeleton, map };
}

type PartSpec = [THREE.BufferGeometry, THREE.Material, THREE.Vector3, THREE.Euler];

function makeLeviathanAxeParts(handleMat: THREE.Material, goldMat: THREE.Material): PartSpec[] {
  // Subtle S-curved ash shaft
  const shaftCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.01, -0.16),
    new THREE.Vector3(0, 0.0, 0.0),
    new THREE.Vector3(0, 0.02, 0.24),
    new THREE.Vector3(0, 0.055, 0.48),
  ]);
  const shaft = new THREE.TubeGeometry(shaftCurve, 14, 0.019, 10, false);

  // Sculpted crescent bearded axe head (shape X runs along shaft, shape Y juts perpendicular out +Y!)
  const blade = new THREE.Shape();
  blade.moveTo(-0.04, 0.0);
  blade.lineTo(0.05, 0.0);
  blade.quadraticCurveTo(0.07, 0.07, 0.16, 0.145);
  blade.quadraticCurveTo(0.01, 0.20, -0.15, 0.165);
  blade.quadraticCurveTo(-0.06, 0.07, -0.04, 0.0);
  blade.closePath();
  const axeGeo = new THREE.ExtrudeGeometry(blade, {
    depth: 0.022,
    bevelEnabled: true,
    bevelThickness: 0.007,
    bevelSize: 0.007,
    bevelSegments: 2,
  });
  axeGeo.translate(0, 0, -0.011);
  axeGeo.rotateY(Math.PI / 2); // Shape X -> -Z along handle, Shape Y -> +Y cutting edge jutting out!

  const frostSteel = new THREE.MeshStandardMaterial({
    color: 0xdbeafe,
    emissive: 0x0284c7,
    emissiveIntensity: 0.28,
    roughness: 0.24,
    metalness: 0.65,
  });
  const runeGlow = new THREE.MeshStandardMaterial({
    color: 0x7dd3fc,
    emissive: 0x38bdf8,
    emissiveIntensity: 1.25,
    roughness: 0.2,
  });

  return [
    [shaft, handleMat, new THREE.Vector3(), new THREE.Euler()],
    [new THREE.CylinderGeometry(0.026, 0.022, 0.05, 10), goldMat, new THREE.Vector3(0, -0.015, -0.17), new THREE.Euler(Math.PI / 2, 0, 0)],
    [new THREE.CylinderGeometry(0.032, 0.028, 0.065, 10), goldMat, new THREE.Vector3(0, 0.055, 0.45), new THREE.Euler(Math.PI / 2 - 0.12, 0, 0)],
    [axeGeo, frostSteel, new THREE.Vector3(0, 0.06, 0.45), new THREE.Euler()],
    [new THREE.BoxGeometry(0.026, 0.020, 0.12), runeGlow, new THREE.Vector3(0, 0.18, 0.45), new THREE.Euler()],
  ];
}

function makeChaosBladeParts(handleMat: THREE.Material, bronzeMat: THREE.Material, emberMat: THREE.Material): PartSpec[] {
  const s = new THREE.Shape();
  s.moveTo(0, -0.025);
  s.lineTo(0.24, -0.038);
  s.quadraticCurveTo(0.36, -0.02, 0.42, 0.065);
  s.quadraticCurveTo(0.31, 0.08, 0.20, 0.055);
  s.lineTo(0.08, 0.048);
  s.lineTo(0, 0.035);
  s.closePath();
  const bladeGeo = new THREE.ExtrudeGeometry(s, {
    depth: 0.014,
    bevelEnabled: true,
    bevelThickness: 0.005,
    bevelSize: 0.006,
    bevelSegments: 2,
  });
  bladeGeo.translate(0, 0, -0.007);
  bladeGeo.rotateY(-Math.PI / 2); // Shape X -> +Z extending forward!

  const darkCharredBlade = new THREE.MeshStandardMaterial({
    color: 0x3b302a,
    emissive: 0x991b1b,
    emissiveIntensity: 0.42,
    roughness: 0.34,
    metalness: 0.58,
  });

  return [
    [new THREE.CylinderGeometry(0.016, 0.018, 0.18, 10), handleMat, new THREE.Vector3(0, 0, 0.02), new THREE.Euler(Math.PI / 2, 0, 0)],
    [new THREE.BoxGeometry(0.032, 0.09, 0.034), bronzeMat, new THREE.Vector3(0, 0.01, 0.11), new THREE.Euler()],
    [bladeGeo, darkCharredBlade, new THREE.Vector3(0, 0.015, 0.12), new THREE.Euler()],
    [new THREE.BoxGeometry(0.020, 0.016, 0.26), emberMat, new THREE.Vector3(0, 0.022, 0.28), new THREE.Euler()],
  ];
}

function makeMjolnirParts(handleMat: THREE.Material, glowMat: THREE.Material): PartSpec[] {
  const hammerMat = new THREE.MeshStandardMaterial({
    color: 0xd0dae6,
    emissive: 0x1e293b,
    emissiveIntensity: 0.22,
    roughness: 0.25,
    metalness: 0.45,
  });
  const s = new THREE.Shape();
  const hw = 0.068;
  const hh = 0.062;
  const ch = 0.018;
  s.moveTo(-hw + ch, -hh);
  s.lineTo(hw - ch, -hh);
  s.lineTo(hw, -hh + ch);
  s.lineTo(hw, hh - ch);
  s.lineTo(hw - ch, hh);
  s.lineTo(-hw + ch, hh);
  s.lineTo(-hw, hh - ch);
  s.lineTo(-hw, -hh + ch);
  s.closePath();

  const headGeo = new THREE.ExtrudeGeometry(s, {
    depth: 0.24,
    bevelEnabled: true,
    bevelThickness: 0.014,
    bevelSize: 0.012,
    bevelSegments: 2,
  });
  headGeo.translate(0, 0, -0.12);
  headGeo.rotateX(Math.PI / 2); // Long 0.24m striking axis runs perpendicular along Y across the +Z handle!

  return [
    [new THREE.CylinderGeometry(0.019, 0.022, 0.42, 12), handleMat, new THREE.Vector3(0, 0.02, 0.12), new THREE.Euler(Math.PI / 2, 0, 0)],
    [new THREE.TorusGeometry(0.022, 0.006, 8, 14), handleMat, new THREE.Vector3(0, 0.02, -0.09), new THREE.Euler(0, Math.PI / 2, 0)],
    [headGeo, hammerMat, new THREE.Vector3(0, 0.02, 0.34), new THREE.Euler()],
    [new THREE.CylinderGeometry(0.032, 0.032, 0.024, 12), hammerMat, new THREE.Vector3(0, 0.02, 0.422), new THREE.Euler(Math.PI / 2, 0, 0)],
    // Proud glowing Asgardian lightning rune inlays across beveled hammer faces
    [new THREE.BoxGeometry(0.168, 0.024, 0.152), glowMat, new THREE.Vector3(0, 0.02, 0.34), new THREE.Euler()],
    [new THREE.BoxGeometry(0.168, 0.155, 0.022), glowMat, new THREE.Vector3(0, 0.02, 0.34), new THREE.Euler()],
  ];
}

function buildHumanFighter(id: FighterId, bank: BakedTextureBank): THREE.Group {
  const p = FIGHTER_ROSTER[id];
  const l = p.look;
  const s = l.scale;
  const { root, skeleton, map } = createSkeleton(s, l.shoulders);

  // Shared accessory metals/neutrals
  const darkIron = new THREE.MeshStandardMaterial({ color: 0x1e222b, roughness: 0.32, metalness: 0.55 });
  const whiteLensMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    emissive: id === 'spiderman' ? 0x64748b : 0x000000,
    emissiveIntensity: id === 'spiderman' ? 0.35 : 0,
    roughness: 0.22,
  });
  const glowMat = new THREE.MeshStandardMaterial({
    color: l.emissiveGlow,
    emissive: l.emissiveGlow,
    emissiveIntensity: 1.45,
    roughness: 0.2,
  });
  const leatherDark = new THREE.MeshStandardMaterial({ color: 0x3b2316, roughness: 0.65, metalness: 0.08 });
  const bootSoleMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.72, metalness: 0.08 });

  // Per-character bespoke PBR material suites
  let headMat: THREE.Material;
  let torsoMat: THREE.Material;
  let armMat: THREE.Material;
  let forearmMat: THREE.Material;
  let handMat: THREE.Material;
  let pantsMat: THREE.Material;
  let bootMat: THREE.Material;
  let armorMat: THREE.Material;
  let hairMat: THREE.Material;
  let beardMat: THREE.Material;

  if (id === 'kratos') {
    headMat = bank.makeMat({ albedo: 'kratos_head_albedo', normal: 'kratos_head_normal', roughness: 0.56, metalness: 0.04 });
    torsoMat = bank.makeMat({ albedo: 'kratos_body_albedo', normal: 'kratos_body_normal', roughness: 0.54, metalness: 0.04 });
    const paleAsh = new THREE.MeshStandardMaterial({ color: 0xded8d0, roughness: 0.56, metalness: 0.04 });
    armMat = paleAsh;
    forearmMat = paleAsh;
    handMat = paleAsh;
    armorMat = bank.makeMat({ albedo: 'kratos_armor_albedo', normal: 'kratos_armor_normal', orm: 'kratos_armor_orm' });
    pantsMat = new THREE.MeshStandardMaterial({ color: 0x2d221c, roughness: 0.72, metalness: 0.06 });
    bootMat = leatherDark;
    hairMat = bank.makeMat({ albedo: 'kratos_beard_albedo', normal: 'kratos_beard_normal', roughness: 0.72, metalness: 0.05 });
    beardMat = hairMat;
  } else if (id === 'wukong') {
    headMat = bank.makeMat({ albedo: 'wukong_head_albedo', normal: 'wukong_head_normal', roughness: 0.60, metalness: 0.04 });
    armorMat = bank.makeMat({ albedo: 'wukong_armor_albedo', normal: 'wukong_armor_normal', orm: 'wukong_armor_orm' });
    torsoMat = armorMat;
    const goldMetal = new THREE.MeshStandardMaterial({ color: 0xf4c430, roughness: 0.28, metalness: 0.62 });
    const furSkin = new THREE.MeshStandardMaterial({ color: 0xb66a2c, roughness: 0.76, metalness: 0.04 });
    armMat = armorMat;
    forearmMat = furSkin;
    handMat = new THREE.MeshStandardMaterial({ color: 0xd09562, roughness: 0.62, metalness: 0.03 });
    pantsMat = new THREE.MeshStandardMaterial({ color: 0x421818, roughness: 0.68, metalness: 0.06 });
    bootMat = goldMetal;
    hairMat = bank.makeMat({ albedo: 'wukong_hair_albedo', normal: 'wukong_hair_normal', roughness: 0.74, metalness: 0.04 });
    beardMat = hairMat;
  } else if (id === 'michael') {
    headMat = bank.makeMat({ albedo: 'michael_head_albedo', normal: 'michael_head_normal', roughness: 0.56, metalness: 0.03 });
    const skinPlain = new THREE.MeshStandardMaterial({ color: 0xdca886, roughness: 0.58, metalness: 0.03 });
    const suitMat = bank.makeMat({ albedo: 'michael_suit_albedo', normal: 'michael_suit_normal', orm: 'michael_suit_orm' });
    torsoMat = suitMat;
    armMat = suitMat;
    forearmMat = suitMat;
    handMat = skinPlain;
    pantsMat = suitMat;
    armorMat = suitMat;
    bootMat = new THREE.MeshStandardMaterial({ color: 0x1c1d24, roughness: 0.30, metalness: 0.16 });
    hairMat = bank.makeMat({ albedo: 'michael_hair_albedo', normal: 'michael_hair_normal', roughness: 0.64, metalness: 0.06 });
    beardMat = hairMat;
  } else if (id === 'spiderman') {
    headMat = bank.makeMat({ albedo: 'spiderman_head_albedo', normal: 'spiderman_head_normal', roughness: 0.44, metalness: 0.06 });
    torsoMat = bank.makeMat({ albedo: 'spiderman_body_albedo', normal: 'spiderman_body_normal', orm: 'spiderman_body_orm' });
    const limbMat = bank.makeMat({ albedo: 'spiderman_limb_albedo', normal: 'spiderman_limb_normal', roughness: 0.46, metalness: 0.06 });
    armMat = limbMat;
    forearmMat = new THREE.MeshStandardMaterial({ color: 0xdc1e26, roughness: 0.42, metalness: 0.06 });
    handMat = forearmMat;
    pantsMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.48, metalness: 0.06 });
    bootMat = forearmMat;
    armorMat = darkIron;
    hairMat = darkIron;
    beardMat = darkIron;
  } else if (id === 'ironman') {
    headMat = bank.makeMat({ albedo: 'ironman_head_albedo', normal: 'ironman_head_normal', roughness: 0.25, metalness: 0.44 });
    torsoMat = bank.makeMat({ albedo: 'ironman_armor_albedo', normal: 'ironman_armor_normal', orm: 'ironman_armor_orm' });
    const candyRedArm = new THREE.MeshStandardMaterial({ color: 0xde2424, roughness: 0.25, metalness: 0.42 });
    const champGold = new THREE.MeshStandardMaterial({ color: 0xf7c530, roughness: 0.22, metalness: 0.58 });
    armMat = champGold;
    forearmMat = candyRedArm;
    handMat = candyRedArm;
    pantsMat = candyRedArm;
    bootMat = candyRedArm;
    armorMat = champGold;
    hairMat = champGold;
    beardMat = candyRedArm;
  } else {
    // Thor
    headMat = bank.makeMat({ albedo: 'thor_head_albedo', normal: 'thor_head_normal', roughness: 0.56, metalness: 0.03 });
    torsoMat = bank.makeMat({ albedo: 'thor_armor_albedo', normal: 'thor_armor_normal', orm: 'thor_armor_orm' });
    const chainMat = bank.makeMat({ albedo: 'thor_chain_albedo', normal: 'thor_chain_normal', orm: 'thor_chain_orm' });
    const norseSkin = new THREE.MeshStandardMaterial({ color: 0xe2af8c, roughness: 0.56, metalness: 0.03 });
    armMat = chainMat;
    forearmMat = norseSkin;
    handMat = norseSkin;
    pantsMat = new THREE.MeshStandardMaterial({ color: 0x202b3e, roughness: 0.68, metalness: 0.1 });
    bootMat = leatherDark;
    armorMat = new THREE.MeshStandardMaterial({ color: 0xc8d4e4, roughness: 0.26, metalness: 0.62 });
    hairMat = bank.makeMat({ albedo: 'thor_hair_albedo', normal: 'thor_hair_normal', roughness: 0.64, metalness: 0.08 });
    beardMat = hairMat;
  }

  // 1. Sculpted Anatomical Torso
  const muscularity = id === 'kratos' ? 1.35 : id === 'thor' ? 1.32 : id === 'spiderman' ? 1.15 : id === 'ironman' ? 1.05 : id === 'wukong' ? 1.08 : 0.35;
  root.add(
    buildAnatomicalTorso(
      {
        scale: s,
        belly: l.belly,
        chestBuild: l.chestBuild,
        shoulders: l.shoulders,
        muscularity,
        hardSurface: id === 'ironman' ? 1.0 : 0,
      },
      map,
      torsoMat,
      skeleton,
    ),
  );

  // 2. Sculpted Anatomical Arms + Articulated Hands/Fists
  for (const isLeft of [true, false]) {
    const armParts = buildAnatomicalArmWithHand(isLeft, s, l.shoulders, muscularity, armMat, forearmMat, handMat, map, skeleton);
    for (const part of armParts) root.add(part);
  }

  // 3. Sculpted Anatomical Legs + Multi-Part Boots/Dress Shoes
  for (const isLeft of [true, false]) {
    const legParts = buildAnatomicalLegAndBoot(isLeft, s, muscularity, pantsMat, bootMat, bootSoleMat, map, skeleton, id === 'wukong');
    for (const part of legParts) root.add(part);
  }

  // 4. Sculpted Anatomical Head & Cranial Relief + 3D Ears
  root.add(
    buildSculptedHead(
      {
        scale: s,
        browProminence: id === 'kratos' || id === 'thor' ? 1.25 : 1.0,
        jawWidth: id === 'kratos' || id === 'thor' ? 1.12 : id === 'spiderman' ? 0.92 : 1.0,
        monkeyMuzzle: id === 'wukong' ? 1.0 : 0,
        helmetMode: id === 'ironman' || id === 'spiderman',
      },
      map,
      headMat,
      skeleton,
    ),
  );

  if (id !== 'ironman' && id !== 'spiderman') {
    const earMat = id === 'wukong' ? new THREE.MeshStandardMaterial({ color: 0xd09562, roughness: 0.65 }) : headMat;
    root.add(buildSculptedEar(1, s, id === 'wukong', earMat, map.Head, skeleton));
    root.add(buildSculptedEar(-1, s, id === 'wukong', earMat, map.Head, skeleton));
  }

  // 5. Character-Specific Costumes, Armor, Hair, Masks & Weapons
  const c = l.chestBuild;
  const b = l.belly;
  const sh = l.shoulders;

  if (id === 'kratos') {
    const furMat = bank.makeMat({ albedo: 'kratos_fur_albedo', normal: 'kratos_fur_normal', roughness: 0.88, metalness: 0.02 });
    const bronzeMat = new THREE.MeshStandardMaterial({ color: 0xc8963e, roughness: 0.30, metalness: 0.65 });

    // Sculpted jaw-hugging pointed Spartan beard
    for (const bp of buildConformingBeard(s, 0.042, 0.85, beardMat, map.Head, skeleton)) root.add(bp);

    // Laminated asymmetric bronze-leather right pauldron hugging rShoulder
    for (let layer = 0; layer < 2; layer++) {
      const capGeo = new THREE.SphereGeometry((0.088 - layer * 0.008) * s, 14, 10, -Math.PI * 0.6, Math.PI * 1.2, 0, Math.PI * 0.62);
      root.add(makeBoneBoundPart(capGeo, layer === 0 ? armorMat : bronzeMat, map.rShoulder, skeleton, new THREE.Vector3(-0.015 * s, (0.015 - layer * 0.022) * s, 0), new THREE.Euler(0, 0, 0.35)));
    }

    // Surface-exact 28-sample diagonal leather chest baldric hugging ribcage cleanly (zero Catmull-Rom overshoot, zero gap!)
    const kratosTorsoR = (worldY: number): [number, number] => {
      if (worldY >= 1.34 * s) return [0.214 * c, 0.148 * c];
      if (worldY >= 1.26 * s) {
        const t = (worldY - 1.26 * s) / (0.08 * s);
        return [(0.190 + 0.024 * t) * c, (0.140 + 0.008 * t) * c];
      }
      const t = Math.max(0, Math.min(1, (worldY - 1.10 * s) / (0.16 * s)));
      return [(0.148 * (b * 0.5 + c * 0.5)) * (1 - t) + 0.190 * c * t, (0.116 + 0.024 * t) * c];
    };
    const baldricPts: THREE.Vector3[] = [];
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      // Tilts smoothly from left shoulder (a = +0.5*pi -> +0.195*s) down across chest/back to right rib (a = -0.5*pi -> -0.03*s)
      const localY = (0.08 + 0.115 * Math.sin(a)) * s;
      const worldY = 1.24 * s + localY;
      const [rx0, rz0] = kratosTorsoR(worldY);
      const frontPec = Math.max(0, Math.cos(a)) * Math.exp(-(((localY - 0.11 * s) / (0.09 * s)) ** 2)) * 0.014 * s;
      const rx = rx0 + 0.006 * s;
      const rz = rz0 + 0.006 * s + frontPec;
      baldricPts.push(new THREE.Vector3(Math.sin(a) * rx, localY, Math.cos(a) * rz));
    }
    const baldricGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(baldricPts, true), 48, 0.015 * s, 8, true);
    root.add(makeBoneBoundPart(baldricGeo, armorMat, map.Chest, skeleton));
    const medA = 0.08;
    const [mrx, mrz] = kratosTorsoR(1.24 * s + 0.09 * s);
    root.add(makeBoneBoundPart(new THREE.CylinderGeometry(0.035 * s, 0.035 * s, 0.020 * s, 16), bronzeMat, map.Chest, skeleton, new THREE.Vector3(Math.sin(medA) * mrx, 0.09 * s, Math.cos(medA) * (mrz + 0.018 * s)), new THREE.Euler(Math.PI / 2, 0, 0)));

    // Textured Wolf-Fur Shoulder Mantle over upper back & left shoulder
    root.add(makeBoneBoundPart(new THREE.TorusGeometry(0.165 * sh, 0.048 * s, 10, 20, Math.PI * 1.15), furMat, map.Chest, skeleton, new THREE.Vector3(0.01 * s, 0.20 * s, -0.02 * s), new THREE.Euler(Math.PI / 2 + 0.15, 0.2, 2.55)));
    root.add(buildPleatedCape(0.28 * sh, 0.36 * sh, 0.42 * s, 2.5, furMat, map.CapeTail, skeleton, new THREE.Vector3(0, -0.01 * s, -0.02 * s), new THREE.Euler(0.10, 0, 0)));

    // Heavy studded battle waist belt + overlapping pleated leather pteruges skirt!
    root.add(makeBoneBoundPart(new THREE.CylinderGeometry(0.162 * b, 0.166 * b, 0.075 * s, 22), bronzeMat, map.Hips, skeleton, new THREE.Vector3(0, 0.015 * s, 0)));
    const numStrips = 12;
    for (let k = 0; k < numStrips; k++) {
      const ang = (k / numStrips) * Math.PI * 2;
      const sx = Math.sin(ang) * 0.158 * b;
      const sz = Math.cos(ang) * 0.128 * b;
      root.add(
        makeBoneBoundPart(
          new THREE.BoxGeometry(0.066 * s, 0.21 * s, 0.022 * s),
          k % 2 === 0 ? armorMat : leatherDark,
          map.Hips,
          skeleton,
          new THREE.Vector3(sx, -0.10 * s, sz),
          new THREE.Euler(-Math.cos(ang) * 0.12, ang, Math.sin(ang) * 0.12),
        ),
      );
    }

    // Leather & brass forearm bracers + Chaos Chain coil on left forearm
    for (const isLeft of [true, false]) {
      const elIdx = isLeft ? map.lElbow : map.rElbow;
      root.add(makeBoneBoundPart(new THREE.CylinderGeometry(0.048 * s, 0.040 * s, 0.135 * s, 14), armorMat, elIdx, skeleton, new THREE.Vector3(0, -0.14 * s, 0)));
    }
    for (let ring = 0; ring < 3; ring++) {
      root.add(makeBoneBoundPart(new THREE.TorusGeometry(0.048 * s, 0.008 * s, 6, 14), bronzeMat, map.lElbow, skeleton, new THREE.Vector3(0, (-0.10 - ring * 0.036) * s, 0), new THREE.Euler(Math.PI / 2, 0.2, 0)));
    }

    // Leviathan Axe (Right) & Chaos Blade (Left tilted cleanly forward away from axe)
    for (const [g, m, pos, rot] of makeLeviathanAxeParts(leatherDark, bronzeMat)) root.add(makeBoneBoundPart(g, m, map.WeaponR, skeleton, pos, rot));
    for (const [g, m, pos, rot] of makeChaosBladeParts(leatherDark, bronzeMat, glowMat)) {
      const tilted = rot.clone();
      tilted.x += 0.55;
      root.add(makeBoneBoundPart(g, m, map.WeaponL, skeleton, pos, tilted));
    }
  } else if (id === 'wukong') {
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xf4c430, roughness: 0.26, metalness: 0.65 });
    const crimsonSilk = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.62, side: THREE.DoubleSide });
    const featherMat = bank.makeMat({ albedo: 'wukong_feather_albedo', roughness: 0.55 });
    const jadeMat = new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x059669, emissiveIntensity: 0.4, roughness: 0.18 });

    // Sculpted Monkey Mane Cap + Ornate Phoenix Crown ("Zijin Guan") circlet + frontal gold finial + jade stone
    root.add(makeBoneBoundPart(new THREE.SphereGeometry(0.112 * s, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.48), hairMat, map.Head, skeleton, new THREE.Vector3(0, 0.172 * s, -0.008 * s)));
    root.add(makeBoneBoundPart(new THREE.TorusGeometry(0.111 * s, 0.013 * s, 10, 26), goldMat, map.Head, skeleton, new THREE.Vector3(0, 0.212 * s, 0.002 * s), new THREE.Euler(Math.PI / 2 - 0.06, 0, 0)));
    root.add(makeBoneBoundPart(new THREE.BoxGeometry(0.038 * s, 0.055 * s, 0.018 * s), goldMat, map.Head, skeleton, new THREE.Vector3(0, 0.232 * s, 0.112 * s), new THREE.Euler(-0.15, 0, 0)));
    root.add(makeBoneBoundPart(new THREE.SphereGeometry(0.014 * s, 10, 8), jadeMat, map.Head, skeleton, new THREE.Vector3(0, 0.225 * s, 0.122 * s)));

    // Twin graceful S-arched sweeping Pheasant Plumes (NO straight sticks!)
    for (const sx of [-1, 1]) {
      const plumeCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(sx * 0.032 * s, 0.24 * s, 0.06 * s),
        new THREE.Vector3(sx * 0.08 * s, 0.42 * s, -0.04 * s),
        new THREE.Vector3(sx * 0.14 * s, 0.55 * s, -0.22 * s),
        new THREE.Vector3(sx * 0.16 * s, 0.50 * s, -0.44 * s),
        new THREE.Vector3(sx * 0.14 * s, 0.38 * s, -0.56 * s),
      ]);
      const plumeGeo = new THREE.TubeGeometry(plumeCurve, 22, 0.010 * s, 8, false);
      // Flatten gently into feather ribbon
      plumeGeo.scale(0.65, 1.0, 1.35);
      plumeGeo.normalizeNormals();
      root.add(makeBoneBoundPart(plumeGeo, featherMat, map.Head, skeleton));
    }

    // Cheek monkey fur sideburns
    for (const sx of [-1, 1]) {
      root.add(makeBoneBoundPart(new THREE.ConeGeometry(0.025 * s, 0.095 * s, 8), hairMat, map.Head, skeleton, new THREE.Vector3(sx * 0.088 * s, 0.09 * s, 0.048 * s), new THREE.Euler(0.15, 0, sx * -0.4)));
    }

    // Multi-layered Dragon Shoulder Pauldrons with upward curved golden wing rims
    for (const isLeft of [true, false]) {
      const sx = isLeft ? 1 : -1;
      const shIdx = isLeft ? map.lShoulder : map.rShoulder;
      const elIdx = isLeft ? map.lElbow : map.rElbow;
      root.add(makeBoneBoundPart(new THREE.SphereGeometry(0.084 * s, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), goldMat, shIdx, skeleton, new THREE.Vector3(sx * 0.012 * s, 0.018 * s, 0), new THREE.Euler(0, 0, sx * -0.35)));
      root.add(makeBoneBoundPart(new THREE.BoxGeometry(0.082 * s, 0.024 * s, 0.105 * s), armorMat, shIdx, skeleton, new THREE.Vector3(sx * 0.032 * s, -0.015 * s, 0), new THREE.Euler(0, 0, sx * -0.48)));
      root.add(makeBoneBoundPart(new THREE.CylinderGeometry(0.048 * s, 0.038 * s, 0.125 * s, 14), goldMat, elIdx, skeleton, new THREE.Vector3(0, -0.14 * s, 0)));
    }

    // Waist belt + Beast-head Taotie clasp + layered war tassets + Flowing Crimson Cape
    root.add(makeBoneBoundPart(new THREE.CylinderGeometry(0.162 * b, 0.168 * b, 0.072 * s, 20), goldMat, map.Hips, skeleton, new THREE.Vector3(0, 0.02 * s, 0)));
    root.add(makeBoneBoundPart(new THREE.SphereGeometry(0.044 * s, 12, 10), goldMat, map.Hips, skeleton, new THREE.Vector3(0, 0.02 * s, 0.128 * b)));
    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * Math.PI * 2;
      root.add(
        makeBoneBoundPart(
          new THREE.BoxGeometry(0.082 * s, 0.19 * s, 0.022 * s),
          k % 2 === 0 ? armorMat : crimsonSilk,
          map.Hips,
          skeleton,
          new THREE.Vector3(Math.sin(ang) * 0.155 * b, -0.095 * s, Math.cos(ang) * 0.125 * b),
          new THREE.Euler(-Math.cos(ang) * 0.14, ang, Math.sin(ang) * 0.14),
        ),
      );
    }
    root.add(buildPleatedCape(0.32 * sh, 0.44 * sh, 0.82 * s, 3.0, crimsonSilk, map.CapeTail, skeleton));

    // Ornate Ruyi Jingu Bang Staff
    const staffShaftMat = new THREE.MeshStandardMaterial({ color: 0x7f1d1d, roughness: 0.42, metalness: 0.25 });
    const tipGlowMat = new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xf59e0b, emissiveIntensity: 0.65, roughness: 0.25, metalness: 0.6 });
    const staffTilt = new THREE.Euler(Math.PI / 2 - 0.22, 0, 0);
    root.add(makeBoneBoundPart(new THREE.CylinderGeometry(0.020 * s, 0.020 * s, 1.56 * s, 14), staffShaftMat, map.WeaponR, skeleton, new THREE.Vector3(0, 0.03 * s, 0.16 * s), staffTilt));
    root.add(makeBoneBoundPart(new THREE.CylinderGeometry(0.032 * s, 0.026 * s, 0.20 * s, 14), tipGlowMat, map.WeaponR, skeleton, new THREE.Vector3(0, 0.18 * s, 0.80 * s), staffTilt));
    root.add(makeBoneBoundPart(new THREE.CylinderGeometry(0.026 * s, 0.032 * s, 0.20 * s, 14), tipGlowMat, map.WeaponR, skeleton, new THREE.Vector3(0, -0.12 * s, -0.48 * s), staffTilt));
  } else if (id === 'michael') {
    const shirtMat = bank.makeMat({ albedo: 'michael_shirt_albedo', roughness: 0.62, metalness: 0.02 });
    const tieMat = bank.makeMat({ albedo: 'michael_tie_albedo', roughness: 0.36, metalness: 0.12 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.18, metalness: 0.85 });
    const tintLensMat = new THREE.MeshStandardMaterial({ color: 0x11141c, roughness: 0.14, metalness: 0.42 });

    // Swept salt-and-pepper Pompadour hair + sideburns
    for (const hp of buildSculptedHairCrown(s, 'pompadour', hairMat, map.Head, skeleton)) root.add(hp);

    // Contoured Chrome-Frame Aviator Sunglasses (teardrop lenses + brow bridge + temples)
    const lensPts: [number, number][] = [
      [-0.024 * s, 0.013 * s],
      [0.024 * s, 0.015 * s],
      [0.025 * s, -0.004 * s],
      [0.010 * s, -0.018 * s],
      [-0.014 * s, -0.015 * s],
      [-0.026 * s, 0.002 * s],
    ];
    for (const sx of [-1, 1]) {
      root.add(buildCurvedVisorOrLens(lensPts, 0.005 * s, 0.10 * s, tintLensMat, map.Head, skeleton, new THREE.Vector3(sx * 0.038 * s, 0.156 * s, 0.124 * s), new THREE.Euler(0, sx * 0.22, sx * -0.08)));
      root.add(makeBoneBoundPart(new THREE.BoxGeometry(0.006 * s, 0.006 * s, 0.105 * s), chromeMat, map.Head, skeleton, new THREE.Vector3(sx * 0.082 * s, 0.164 * s, 0.072 * s), new THREE.Euler(0, sx * 0.16, 0)));
    }
    root.add(makeBoneBoundPart(new THREE.BoxGeometry(0.085 * s, 0.005 * s, 0.008 * s), chromeMat, map.Head, skeleton, new THREE.Vector3(0, 0.172 * s, 0.128 * s)));

    // Open V-Neck White Shirt Insert + Burgundy Silk Tie & Knot + Sharp 3D Notched Suit Lapels
    root.add(makeBoneBoundPart(new THREE.BoxGeometry(0.102 * c, 0.25 * s, 0.024 * c), shirtMat, map.Chest, skeleton, new THREE.Vector3(0, 0.155 * s, 0.144 * c)));
    root.add(makeBoneBoundPart(new THREE.CylinderGeometry(0.024 * c, 0.015 * c, 0.036 * s, 6), tieMat, map.Chest, skeleton, new THREE.Vector3(0, 0.235 * s, 0.152 * c)));
    root.add(makeBoneBoundPart(new THREE.BoxGeometry(0.030 * c, 0.20 * s, 0.026 * c), tieMat, map.Chest, skeleton, new THREE.Vector3(0, 0.13 * s, 0.150 * c)));
    for (const sx of [-1, 1]) {
      root.add(makeBoneBoundPart(new THREE.BoxGeometry(0.048 * c, 0.24 * s, 0.022 * c), torsoMat, map.Chest, skeleton, new THREE.Vector3(sx * 0.052 * c, 0.145 * s, 0.150 * c), new THREE.Euler(0.08, sx * 0.16, sx * 0.22)));
      // Peeking crisp white dress shirt sleeve cuffs
      root.add(makeBoneBoundPart(new THREE.CylinderGeometry(0.038 * s, 0.036 * s, 0.028 * s, 14), shirtMat, sx > 0 ? map.lHand : map.rHand, skeleton, new THREE.Vector3(0, 0.022 * s, 0)));
    }
    // Silver wristwatch on left wrist + pocket square
    root.add(makeBoneBoundPart(new THREE.CylinderGeometry(0.040 * s, 0.040 * s, 0.018 * s, 14), chromeMat, map.lHand, skeleton, new THREE.Vector3(0, 0.008 * s, 0)));
    root.add(makeBoneBoundPart(new THREE.BoxGeometry(0.036 * c, 0.018 * s, 0.010 * c), shirtMat, map.Chest, skeleton, new THREE.Vector3(0.088 * c, 0.145 * s, 0.150 * c), new THREE.Euler(0, 0.2, 0.1)));
    // Smooth tapered lower suit coat skirt hugging hips cleanly
    root.add(makeBoneBoundPart(new THREE.CylinderGeometry(0.148 * b, 0.158 * b, 0.15 * s, 20), torsoMat, map.Hips, skeleton, new THREE.Vector3(0, -0.01 * s, 0)));

    // Detailed Suppressed 9mm Pistol tilted cleanly forward away from face (+0.90 rad X)
    const gunBody = new THREE.MeshStandardMaterial({ color: 0x3b495e, roughness: 0.32, metalness: 0.68 });
    const gripDark = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.72 });
    const gunTilt = new THREE.Euler(0.92, 0, 0);
    const applyGunTilt = (v: THREE.Vector3) => v.clone().applyEuler(gunTilt);
    root.add(makeBoneBoundPart(new THREE.BoxGeometry(0.032 * s, 0.095 * s, 0.042 * s), gripDark, map.WeaponR, skeleton, applyGunTilt(new THREE.Vector3(0, -0.012 * s, 0.01 * s)), new THREE.Euler(1.16, 0, 0)));
    root.add(makeBoneBoundPart(new THREE.BoxGeometry(0.034 * s, 0.044 * s, 0.195 * s), gunBody, map.WeaponR, skeleton, applyGunTilt(new THREE.Vector3(0, 0.038 * s, 0.088 * s)), gunTilt));
    root.add(makeBoneBoundPart(new THREE.CylinderGeometry(0.016 * s, 0.016 * s, 0.135 * s, 12), gripDark, map.WeaponR, skeleton, applyGunTilt(new THREE.Vector3(0, 0.042 * s, 0.245 * s)), new THREE.Euler(0.92 + Math.PI / 2, 0, 0)));
  } else if (id === 'spiderman') {
    const blackRubber = new THREE.MeshStandardMaterial({ color: 0x16181e, roughness: 0.34, metalness: 0.18 });
    const crimsonBrief = new THREE.MeshStandardMaterial({ color: 0xdc1e26, roughness: 0.44, metalness: 0.06 });
    const nozzleMetal = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.28, metalness: 0.75 });

    // Seamless crimson pelvis brief blending waist smoothly into cobalt legs
    root.add(makeBoneBoundPart(new THREE.CylinderGeometry(0.128 * b, 0.136 * b, 0.12 * s, 20), crimsonBrief, map.Hips, skeleton, new THREE.Vector3(0, 0.01 * s, 0)));

    // Iconic angular expressive Spider-Man lenses curving smoothly over orbital sockets
    const framePts: [number, number][] = [
      [-0.028 * s, -0.014 * s],
      [0.018 * s, -0.018 * s],
      [0.036 * s, 0.018 * s],
      [0.004 * s, 0.024 * s],
      [-0.026 * s, 0.004 * s],
    ];
    const innerPts: [number, number][] = framePts.map(([x, y]) => [x * 0.72, y * 0.68]);
    for (const sx of [-1, 1]) {
      const fPts: [number, number][] = sx < 0 ? framePts.map(([x, y]) => [-x, y]) : framePts;
      const iPts: [number, number][] = sx < 0 ? innerPts.map(([x, y]) => [-x, y]) : innerPts;
      root.add(buildCurvedVisorOrLens(fPts, 0.008 * s, 0.095 * s, blackRubber, map.Head, skeleton, new THREE.Vector3(sx * 0.042 * s, 0.160 * s, 0.118 * s), new THREE.Euler(0, sx * 0.25, 0)));
      root.add(buildCurvedVisorOrLens(iPts, 0.010 * s, 0.095 * s, whiteLensMat, map.Head, skeleton, new THREE.Vector3(sx * 0.042 * s, 0.160 * s, 0.120 * s), new THREE.Euler(0, sx * 0.25, 0)));
    }

    // 3D Raised Front & Back Spider Emblems
    root.add(makeBoneBoundPart(new THREE.SphereGeometry(0.022 * s, 10, 8), blackRubber, map.Chest, skeleton, new THREE.Vector3(0, 0.135 * s, 0.156 * c)));
    root.add(makeBoneBoundPart(new THREE.SphereGeometry(0.016 * s, 10, 8), blackRubber, map.Chest, skeleton, new THREE.Vector3(0, 0.162 * s, 0.156 * c)));
    for (const sx of [-1, 1]) {
      for (const leg of [
        { dy: 0.04, ang: 0.65, len: 0.068 },
        { dy: 0.02, ang: 0.35, len: 0.072 },
        { dy: -0.02, ang: -0.45, len: 0.074 },
        { dy: -0.045, ang: -0.78, len: 0.070 },
      ]) {
        root.add(
          makeBoneBoundPart(
            new THREE.BoxGeometry(leg.len * s, 0.009 * s, 0.012 * s),
            blackRubber,
            map.Chest,
            skeleton,
            new THREE.Vector3(sx * 0.036 * s, (0.145 + leg.dy) * s, 0.152 * c),
            new THREE.Euler(0, sx * -0.18, sx * leg.ang),
          ),
        );
      }
    }

    // Compact Mechanical Wrist Web-Shooters
    for (const wIdx of [map.lHand, map.rHand]) {
      root.add(makeBoneBoundPart(new THREE.CylinderGeometry(0.042 * s, 0.040 * s, 0.026 * s, 14), blackRubber, wIdx, skeleton, new THREE.Vector3(0, 0.032 * s, 0)));
      root.add(makeBoneBoundPart(new THREE.BoxGeometry(0.020 * s, 0.026 * s, 0.016 * s), nozzleMetal, wIdx, skeleton, new THREE.Vector3(0, 0.028 * s, 0.040 * s)));
    }
  } else if (id === 'ironman') {
    const champGold = new THREE.MeshStandardMaterial({ color: 0xf6c332, roughness: 0.22, metalness: 0.64 });
    const candyRed = new THREE.MeshStandardMaterial({ color: 0xd92323, roughness: 0.24, metalness: 0.54 });
    const housingDark = new THREE.MeshStandardMaterial({ color: 0x262b36, roughness: 0.42, metalness: 0.6 });

    // Sculpted Chamfered Mark LXXXV Gold Helmet Faceplate & Glowing Cyan Eye Slits
    const visorPts: [number, number][] = [
      [-0.062 * s, -0.075 * s],
      [0.062 * s, -0.075 * s],
      [0.078 * s, 0.02 * s],
      [0.065 * s, 0.088 * s],
      [0.018 * s, 0.092 * s],
      [0, 0.068 * s],
      [-0.018 * s, 0.092 * s],
      [-0.065 * s, 0.088 * s],
      [-0.078 * s, 0.02 * s],
    ];
    root.add(buildCurvedVisorOrLens(visorPts, 0.014 * s, 0.095 * s, champGold, map.Head, skeleton, new THREE.Vector3(0, 0.140 * s, 0.112 * s)));
    for (const sx of [-1, 1]) {
      root.add(makeBoneBoundPart(new THREE.BoxGeometry(0.038 * s, 0.011 * s, 0.016 * s), glowMat, map.Head, skeleton, new THREE.Vector3(sx * 0.038 * s, 0.162 * s, 0.125 * s), new THREE.Euler(0, sx * 0.18, sx * -0.14)));
      root.add(makeBoneBoundPart(new THREE.CylinderGeometry(0.026 * s, 0.026 * s, 0.018 * s, 14), champGold, map.Head, skeleton, new THREE.Vector3(sx * 0.105 * s, 0.142 * s, 0), new THREE.Euler(0, 0, Math.PI / 2)));
    }

    // Faceted Chest Carapace & Prominent Glowing Chest Arc Reactor (proud on sternum!)
    root.add(makeBoneBoundPart(new THREE.CylinderGeometry(0.056 * s, 0.060 * s, 0.028 * s, 6), housingDark, map.Chest, skeleton, new THREE.Vector3(0, 0.14 * s, 0.162 * c), new THREE.Euler(Math.PI / 2, 0, 0)));
    root.add(makeBoneBoundPart(new THREE.CylinderGeometry(0.044 * s, 0.044 * s, 0.034 * s, 6), glowMat, map.Chest, skeleton, new THREE.Vector3(0, 0.14 * s, 0.166 * c), new THREE.Euler(Math.PI / 2, 0, 0)));
    root.add(makeBoneBoundPart(new THREE.TorusGeometry(0.054 * s, 0.009 * s, 8, 18), champGold, map.Chest, skeleton, new THREE.Vector3(0, 0.14 * s, 0.175 * c)));
    // Raised gold pectoral collar armor trim
    for (const sx of [-1, 1]) {
      root.add(makeBoneBoundPart(new THREE.BoxGeometry(0.092 * c, 0.036 * s, 0.042 * c), champGold, map.Chest, skeleton, new THREE.Vector3(sx * 0.088 * c, 0.195 * s, 0.125 * c), new THREE.Euler(-0.35, sx * 0.2, sx * -0.25)));
    }

    // Flared Curved Titanium Shoulder Pauldrons & Forearm Repulsor Gauntlets + Palm Emitters
    for (const isLeft of [true, false]) {
      const sx = isLeft ? 1 : -1;
      const shIdx = isLeft ? map.lShoulder : map.rShoulder;
      const elIdx = isLeft ? map.lElbow : map.rElbow;
      const knIdx = isLeft ? map.lKnee : map.rKnee;
      const wIdx = isLeft ? map.WeaponL : map.WeaponR;
      root.add(makeBoneBoundPart(new THREE.SphereGeometry(0.084 * s, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.56), candyRed, shIdx, skeleton, new THREE.Vector3(sx * 0.016 * s, 0.018 * s, 0), new THREE.Euler(0, 0, sx * -0.32)));
      root.add(makeBoneBoundPart(new THREE.TorusGeometry(0.068 * s, 0.010 * s, 8, 16), champGold, shIdx, skeleton, new THREE.Vector3(sx * 0.018 * s, -0.012 * s, 0), new THREE.Euler(Math.PI / 2, 0, sx * -0.32)));
      root.add(makeBoneBoundPart(new THREE.CylinderGeometry(0.056 * s, 0.044 * s, 0.155 * s, 14), candyRed, elIdx, skeleton, new THREE.Vector3(sx * 0.006 * s, -0.14 * s, 0)));
      root.add(makeBoneBoundPart(new THREE.CylinderGeometry(0.058 * s, 0.052 * s, 0.085 * s, 12), champGold, knIdx, skeleton, new THREE.Vector3(0, 0.02 * s, 0.026 * s)));
      // Palm Repulsor Disc
      root.add(makeBoneBoundPart(new THREE.CylinderGeometry(0.028 * s, 0.028 * s, 0.018 * s, 16), glowMat, wIdx, skeleton, new THREE.Vector3(0, 0, 0.02 * s), new THREE.Euler(Math.PI / 2, 0, 0)));
    }
  } else {
    // THOR: God of Thunder
    const silverSteel = armorMat;
    const crimsonCapeMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.72, side: THREE.DoubleSide });
    const runeBlueGlow = new THREE.MeshStandardMaterial({ color: 0x7dd3fc, emissive: 0x38bdf8, emissiveIntensity: 1.35, roughness: 0.18 });

    // Sculpted flowing golden Norse locks + full warrior beard
    for (const hp of buildSculptedHairCrown(s, 'norse-long', hairMat, map.Head, skeleton)) root.add(hp);
    for (const bp of buildConformingBeard(s, 0.048, 0.5, beardMat, map.Head, skeleton)) root.add(bp);

    // 6 Luminous Beveled Silver Chest Armor Discs (2x3 Asgardian arrangement sitting proudly on chest!)
    for (const [dx, dy, dz] of [
      [-0.072, 0.175, 0.154],
      [0.072, 0.175, 0.154],
      [-0.068, 0.085, 0.148],
      [0.068, 0.085, 0.148],
      [-0.058, -0.005, 0.136],
      [0.058, -0.005, 0.136],
    ]) {
      root.add(makeBoneBoundPart(new THREE.CylinderGeometry(0.032 * s, 0.034 * s, 0.020 * s, 16), silverSteel, map.Chest, skeleton, new THREE.Vector3(dx * c, dy * s, dz * c), new THREE.Euler(Math.PI / 2, 0, 0)));
      root.add(makeBoneBoundPart(new THREE.CylinderGeometry(0.017 * s, 0.017 * s, 0.026 * s, 14), runeBlueGlow, map.Chest, skeleton, new THREE.Vector3(dx * c, dy * s, (dz + 0.004) * c), new THREE.Euler(Math.PI / 2, 0, 0)));
    }

    // Twin Silver Collar Cape Clasps + Sculpted Wave-Pleated Flowing Crimson Cape + Silver Shoulder Armor Caps
    for (const sx of [-1, 1]) {
      root.add(makeBoneBoundPart(new THREE.CylinderGeometry(0.036 * s, 0.038 * s, 0.022 * s, 16), silverSteel, map.Chest, skeleton, new THREE.Vector3(sx * 0.125 * sh, 0.215 * s, 0.082 * c), new THREE.Euler(Math.PI / 2 - 0.35, sx * 0.3, 0)));
      const shIdx = sx > 0 ? map.lShoulder : map.rShoulder;
      root.add(makeBoneBoundPart(new THREE.SphereGeometry(0.078 * s, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), silverSteel, shIdx, skeleton, new THREE.Vector3(sx * 0.006 * s, 0.016 * s, 0), new THREE.Euler(0, 0, sx * -0.25)));
      const elIdx = sx > 0 ? map.lElbow : map.rElbow;
      root.add(makeBoneBoundPart(new THREE.CylinderGeometry(0.048 * s, 0.042 * s, 0.125 * s, 14), leatherDark, elIdx, skeleton, new THREE.Vector3(0, -0.145 * s, 0)));
    }
    root.add(buildPleatedCape(0.36 * sh, 0.56 * sh, 1.02 * s, 3.5, crimsonCapeMat, map.CapeTail, skeleton));

    // Studded Asgardian leather/silver battle belt + Mjolnir
    root.add(makeBoneBoundPart(new THREE.CylinderGeometry(0.158 * b, 0.164 * b, 0.068 * s, 20), leatherDark, map.Hips, skeleton, new THREE.Vector3(0, 0.02 * s, 0)));
    root.add(makeBoneBoundPart(new THREE.BoxGeometry(0.072 * s, 0.056 * s, 0.024 * s), silverSteel, map.Hips, skeleton, new THREE.Vector3(0, 0.02 * s, 0.126 * b)));
    for (const [g, m, pos, rot] of makeMjolnirParts(leatherDark, runeBlueGlow)) root.add(makeBoneBoundPart(g, m, map.WeaponR, skeleton, pos, rot));
  }

  optimizeCharacterMeshes(root, skeleton);
  return root;
}

function buildVoxelBossSteve(bank: BakedTextureBank): THREE.Group {
  const s = FIGHTER_ROSTER.steve.look.scale;
  const { root, skeleton, map } = createSkeleton(s, 1.12);

  // Authentic Minecraft Voxel Boss textures with crisp NearestFilter + subtle pixel-chamfer normalMap!
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xb68663, roughness: 0.72 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x3a2415, roughness: 0.82 });
  const faceMat = bank.makeMat({ albedo: 'steve_face_albedo', normal: 'steve_face_normal', nearest: true, roughness: 0.62, normalScale: 0.45 });
  const shirtMat = bank.makeMat({ albedo: 'steve_shirt_albedo', normal: 'steve_shirt_normal', nearest: true, roughness: 0.66, normalScale: 0.4 });
  const bossArmorMat = bank.makeMat({
    albedo: 'steve_bossarmor_albedo',
    normal: 'steve_bossarmor_normal',
    emissiveMap: 'steve_bossarmor_emissive',
    nearest: true,
    roughness: 0.36,
    metalness: 0.45,
    emissive: 0xffffff,
    emissiveIntensity: 0.42,
  });
  const diaMat = bank.makeMat({
    albedo: 'steve_diamond_albedo',
    nearest: true,
    roughness: 0.22,
    metalness: 0.45,
    emissive: 0x22d3ee,
    emissiveIntensity: 0.55,
  });
  const guardTealMat = new THREE.MeshStandardMaterial({
    color: 0x0e7490,
    emissive: 0x6d28d9,
    emissiveIntensity: 0.35,
    roughness: 0.28,
    metalness: 0.52,
  });
  const tntMat = bank.makeMat({ albedo: 'steve_tnt_albedo', nearest: true, roughness: 0.70 });
  const tntTopMat = new THREE.MeshStandardMaterial({ color: 0x3f2421, roughness: 0.82 });
  const jeansMat = new THREE.MeshStandardMaterial({ color: 0x242878, roughness: 0.76 });
  const bootMat = new THREE.MeshStandardMaterial({ color: 0x3f424e, roughness: 0.52, metalness: 0.22 });

  // 1. Crisp Voxel Head Cube + Overhanging 2nd-Layer 3D Hair Strips (authentic Minecraft outer skin layer!)
  const headMats = [skinMat, skinMat, hairMat, skinMat, faceMat, hairMat];
  const headGeo = new THREE.BoxGeometry(0.42 * s, 0.42 * s, 0.42 * s);
  const headWorld = new THREE.Vector3();
  skeleton.bones[map.Head].getWorldPosition(headWorld);
  headGeo.translate(headWorld.x, headWorld.y + 0.19 * s, headWorld.z);
  const hIdx = new Uint16Array(headGeo.attributes.position.count * 4);
  const hWgt = new Float32Array(headGeo.attributes.position.count * 4);
  for (let i = 0; i < headGeo.attributes.position.count; i++) {
    hIdx[i * 4] = map.Head;
    hWgt[i * 4] = 1;
  }
  headGeo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(hIdx, 4));
  headGeo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(hWgt, 4));
  const headMesh = new THREE.SkinnedMesh(headGeo, headMats);
  headMesh.castShadow = true;
  headMesh.receiveShadow = true;
  headMesh.bind(skeleton);
  root.add(headMesh);

  // Overhanging 2nd-layer 3D hair crown & temple bangs (proud by +0.015m)
  root.add(makeBoneBoundPart(new THREE.BoxGeometry(0.448 * s, 0.115 * s, 0.448 * s), hairMat, map.Head, skeleton, new THREE.Vector3(0, 0.352 * s, 0)));
  root.add(makeBoneBoundPart(new THREE.BoxGeometry(0.448 * s, 0.19 * s, 0.16 * s), hairMat, map.Head, skeleton, new THREE.Vector3(0, 0.23 * s, -0.145 * s)));

  // 2. Crisp Voxel Torso + Boss Enchanted Netherite/Diamond Chestplate & Shoulder Pauldrons
  root.add(makeBoneBoundPart(new THREE.BoxGeometry(0.45 * s, 0.32 * s, 0.24 * s), shirtMat, map.Spine, skeleton, new THREE.Vector3(0, 0.04 * s, 0)));
  root.add(makeBoneBoundPart(new THREE.BoxGeometry(0.46 * s, 0.32 * s, 0.25 * s), shirtMat, map.Chest, skeleton, new THREE.Vector3(0, 0.10 * s, 0)));
  // Raised voxel Boss Armor Chestplate bib & belt buckle
  root.add(makeBoneBoundPart(new THREE.BoxGeometry(0.42 * s, 0.24 * s, 0.275 * s), bossArmorMat, map.Chest, skeleton, new THREE.Vector3(0, 0.12 * s, 0)));
  root.add(makeBoneBoundPart(new THREE.BoxGeometry(0.465 * s, 0.075 * s, 0.265 * s), bossArmorMat, map.Hips, skeleton, new THREE.Vector3(0, 0.04 * s, 0)));
  root.add(makeBoneBoundPart(new THREE.BoxGeometry(0.11 * s, 0.085 * s, 0.285 * s), diaMat, map.Hips, skeleton, new THREE.Vector3(0, 0.04 * s, 0)));
  root.add(makeBoneBoundPart(new THREE.BoxGeometry(0.44 * s, 0.15 * s, 0.24 * s), jeansMat, map.Hips, skeleton, new THREE.Vector3(0, -0.02 * s, 0)));

  // 3. Blocky Arms + Stepped Voxel Shoulder Armor Pauldrons + Wrist Cuffs
  for (const isLeft of [true, false]) {
    const shIdx = isLeft ? map.lShoulder : map.rShoulder;
    const elIdx = isLeft ? map.lElbow : map.rElbow;
    root.add(makeBoneBoundPart(new THREE.BoxGeometry(0.195 * s, 0.27 * s, 0.195 * s), shirtMat, shIdx, skeleton, new THREE.Vector3(0, -0.11 * s, 0)));
    root.add(makeBoneBoundPart(new THREE.BoxGeometry(0.225 * s, 0.155 * s, 0.225 * s), bossArmorMat, shIdx, skeleton, new THREE.Vector3(0, -0.045 * s, 0)));
    root.add(makeBoneBoundPart(new THREE.BoxGeometry(0.185 * s, 0.31 * s, 0.185 * s), skinMat, elIdx, skeleton, new THREE.Vector3(0, -0.14 * s, 0)));
    root.add(makeBoneBoundPart(new THREE.BoxGeometry(0.198 * s, 0.055 * s, 0.198 * s), bossArmorMat, elIdx, skeleton, new THREE.Vector3(0, -0.255 * s, 0)));
  }

  // 4. Blocky Legs + Stepped Boss Knee & Boot Armor Cuffs
  for (const isLeft of [true, false]) {
    const thIdx = isLeft ? map.lThigh : map.rThigh;
    const knIdx = isLeft ? map.lKnee : map.rKnee;
    const anIdx = isLeft ? map.lAnkle : map.rAnkle;
    root.add(makeBoneBoundPart(new THREE.BoxGeometry(0.205 * s, 0.40 * s, 0.205 * s), jeansMat, thIdx, skeleton, new THREE.Vector3(0, -0.20 * s, 0)));
    root.add(makeBoneBoundPart(new THREE.BoxGeometry(0.20 * s, 0.35 * s, 0.20 * s), jeansMat, knIdx, skeleton, new THREE.Vector3(0, -0.17 * s, 0)));
    root.add(makeBoneBoundPart(new THREE.BoxGeometry(0.22 * s, 0.08 * s, 0.22 * s), bossArmorMat, knIdx, skeleton, new THREE.Vector3(0, -0.26 * s, 0)));
    root.add(makeBoneBoundPart(new THREE.BoxGeometry(0.215 * s, 0.092 * s, 0.245 * s), bootMat, anIdx, skeleton, new THREE.Vector3(0, -0.02 * s, 0.015 * s)));
  }

  // 5. Stepped-Pixel 3D Enchanted Diamond Sword (WeaponR) & Detailed Multi-Face TNT Cube (WeaponL)
  const { hiltGeo, guardGeo, bladeGeo } = buildVoxelSwordGeometry();
  const swordTilt = new THREE.Euler(-0.18, 0, 0);
  root.add(makeBoneBoundPart(hiltGeo, hairMat, map.WeaponR, skeleton, new THREE.Vector3(0, 0.02, 0.04), swordTilt));
  root.add(makeBoneBoundPart(guardGeo, guardTealMat, map.WeaponR, skeleton, new THREE.Vector3(0, 0.02, 0.04), swordTilt));
  root.add(makeBoneBoundPart(bladeGeo, diaMat, map.WeaponR, skeleton, new THREE.Vector3(0, 0.02, 0.04), swordTilt));

  const tntMats = [tntMat, tntMat, tntTopMat, tntTopMat, tntMat, tntMat];
  const tntCube = new THREE.BoxGeometry(0.22, 0.22, 0.22);
  const tntPos = new THREE.Vector3(0.05, 0.02, 0.11);
  const tntRot = new THREE.Euler(0.18, 0.38, 0);
  // Multi-material BoxGeometry needs explicit skeleton bind helper
  const tntClone = tntCube.clone();
  const tntQ = new THREE.Quaternion().setFromEuler(tntRot);
  const wPos = new THREE.Vector3();
  skeleton.bones[map.WeaponL].getWorldPosition(wPos);
  tntClone.applyMatrix4(new THREE.Matrix4().compose(wPos.clone().add(tntPos), tntQ, new THREE.Vector3(1, 1, 1)));
  const tIdx = new Uint16Array(tntClone.attributes.position.count * 4);
  const tWgt = new Float32Array(tntClone.attributes.position.count * 4);
  for (let i = 0; i < tntClone.attributes.position.count; i++) {
    tIdx[i * 4] = map.WeaponL;
    tWgt[i * 4] = 1;
  }
  tntClone.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(tIdx, 4));
  tntClone.setAttribute('skinWeight', new THREE.Float32BufferAttribute(tWgt, 4));
  const tntMesh = new THREE.SkinnedMesh(tntClone, tntMats);
  tntMesh.castShadow = true;
  tntMesh.bind(skeleton);
  root.add(tntMesh);
  // Protruding fuse wick on top of TNT cube
  root.add(makeBoneBoundPart(new THREE.CylinderGeometry(0.012, 0.014, 0.06, 6), hairMat, map.WeaponL, skeleton, new THREE.Vector3(0.05, 0.145, 0.11), tntRot));

  optimizeCharacterMeshes(root, skeleton);
  return root;
}

async function exportCharacter(id: FighterId, outDir: string, bank: BakedTextureBank): Promise<number> {
  const root = id === 'steve' ? buildVoxelBossSteve(bank) : buildHumanFighter(id, bank);
  const baseHipsY = 0.92 * FIGHTER_ROSTER[id].look.scale;
  const animations = buildCharacterAnimationClips(id, baseHipsY);

  const exporter = new GLTFExporter();
  const glbBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    exporter.parse(
      root,
      (res) => {
        if (res instanceof ArrayBuffer) resolve(res);
        else reject(new Error('Expected binary GLB ArrayBuffer output'));
      },
      (err) => reject(err),
      { binary: true, animations },
    );
  });

  const outPath = path.join(outDir, `${id}.glb`);
  fs.writeFileSync(outPath, Buffer.from(glbBuffer));
  return glbBuffer.byteLength;
}

async function main(): Promise<void> {
  const bank = new BakedTextureBank();
  const outDir = path.resolve(process.cwd(), 'public/models');
  fs.mkdirSync(outDir, { recursive: true });
  for (const id of ROSTER_ORDER) {
    const bytes = await exportCharacter(id, outDir, bank);
    console.log(`Exported ${id}.glb (${(bytes / 1024).toFixed(1)} KB, 28 animation clips)`);
  }
}

void main();
