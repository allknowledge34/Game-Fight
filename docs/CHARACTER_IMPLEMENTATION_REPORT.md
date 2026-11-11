# Character Replacement & 3D GLTF Implementation Report

## 1. Roster Replacement & Configurable Architecture

All legacy political neta characters were cleanly replaced with a 7-character roster (6 playable fighters + 1 Final Boss). Display labels, titles, faction strings, accent colors, model URLs, portrait URLs, voice audio clip paths, super move copy, and newspaper excuses are externalized in [`characterConfigs.ts`](../src/characters/characterConfigs.ts) (`ROSTER_DISPLAY_CONFIG`, `UI_LABELS_CONFIG`) and joined with biomechanical and frame-balance specs in [`roster.ts`](../src/characters/roster.ts).

| ID | Display Name | Role | Weapon / Gear & Sculpted Upgrades | Model Asset (`public/models/`) | Size | Meshes | Tris | Clips |
|---|---|---|---|---|---:|---:|---:|---:|
| `kratos` | **KRATOS** | Playable | Sculpted pale ash muscles, crimson eye & chest/back warpaint, textured pointed Spartan beard, wolf-fur cape & leather baldric w/ medallion, bronze-leather pauldron, pleated *pteruges* war skirt, frosted crescent Leviathan Axe + curved Chaos Blade w/ chain coils | [`kratos.glb`](../public/models/kratos.glb) | 2,619.0 KB | 14 | 8,496 | 28 |
| `wukong` | **SUN WUKONG** | Playable | Primate facial muzzle & pointed ears, golden Phoenix crown w/ jade finial & S-arched feathered plumes, crimson/gold *Shanwenjia* mountain-scale armor & tassets, dragon wing pauldrons, flowing pleated silk cape, ringed Ruyi Jingu Bang staff | [`wukong.glb`](../public/models/wukong.glb) | 2,093.6 KB | 15 | 7,254 | 28 |
| `michael` | **MICHAEL** | Playable | Natural adult human head, swept salt-and-pepper pompadour hair & sideburns, contoured chrome-frame Aviator shades, tailored charcoal herringbone suit jacket w/ open V-neck shirt & burgundy tie knot, shirt cuffs, silver watch, tactical suppressed 9mm pistol | [`michael.glb`](../public/models/michael.glb) | 1,502.5 KB | 12 | 5,054 | 28 |
| `spiderman` | **SPIDER-MAN** | Playable | Athletic V-taper anatomy, raised normal-mapped scalloped spider-web weave across vivid crimson & cobalt suit panels, curved angular white lenses w/ dark bevel frames, 3D chest spider emblem, metallic wrist web-shooters | [`spiderman.glb`](../public/models/spiderman.glb) | 1,274.3 KB | 10 | 4,044 | 28 |
| `ironman` | **IRON MAN** | Playable | Faceted candy-crimson & champagne gold Mark LXXXV metallic armor plates, sculpted helmet faceplate w/ cyan optic slits, glowing hexagonal chest Arc Reactor & palm repulsors, curved shoulder pauldrons & knee guards | [`ironman.glb`](../public/models/ironman.glb) | 1,286.5 KB | 9 | 5,412 | 28 |
| `thor` | **THOR** | Playable | Broad Asgardian build, flowing golden blonde hair locks & Norse beard, storm-navy cuirass w/ 6 glowing silver chest discs, silver shoulder pauldrons & chainmail sleeves, wave-pleated crimson cape, chamfered octagonal Uru Mjolnir w/ glowing lightning runes | [`thor.glb`](../public/models/thor.glb) | 2,176.6 KB | 12 | 8,770 | 28 |
| `steve` | **STEVE** | **Final Boss** | Authentic blocky Minecraft voxel proportions (`NearestFilter`), overhanging 3D outer hair layer, Netherite-and-Diamond Boss armor pauldrons/chestplate/belt trim, stepped-pixel 3D Enchanted Diamond Sword, crisp `"TNT"` cube w/ fuse | [`steve.glb`](../public/models/steve.glb) | 483.8 KB | 10 | 528 | 28 |

> **Environment & Pipeline Note**: External 3D tools (`blender`, `assimp`, `gltf-pipeline`, `toktx`) are not installed on this host. All 7 `.glb` character rigs were compiled offline via Python (`numpy` + `scipy` + `Pillow` in `scripts/bakePbrTextures.py`) generating 59 aligned PBR textures (albedo, Sobel tangent-space `normalMap`, linear `metallicRoughnessTexture` ORM, and `emissiveMap` stored in `scripts/baked_textures/`), paired with parametric TypeScript vertex-sculpted anatomy & accessories (`scripts/sculptureBuilder.ts`, `scripts/generateCharacters.ts`) exported via Three.js `GLTFExporter`.

## 2. Rigging, Sculpting & Performance Optimization Pipeline

- **Skeletal Hierarchy (`createSkeleton`)**: Unchanged 20-bone hierarchy (`Hips → Spine → Chest → Neck → Head`, `l/rShoulder → Elbow → Hand → WeaponL/R`, `l/rThigh → Knee → Ankle`, `CapeTail`) preserving 100% compatibility with [`FighterRig.ts`](../src/rendering/FighterRig.ts), `PoseSolver.ts`, `BattleSimulation.ts`, and all 28 embedded `AnimationClip`s (`scripts/characterAnimations.ts`).
- **Parametric Anatomical Sculpting (`scripts/sculptureBuilder.ts`)**:
  - `buildSculptedSkinnedMesh` places UV seams on the center back (`u = 0/1`, front center at `u = 0.5`) so faces, chest emblems, and armor linings are seamless.
  - `buildAnatomicalTorso` & `buildSculptedHead` sculpt pectorals, sternum cleft, 6-pack abs, latissimus V-taper, spinal furrow, brow ridges, sunken orbital eye sockets, nasal bridge, zygomatic cheekbones, parted lips, jawline, and 3D sculpted ears (`buildSculptedEar`).
  - `buildAnatomicalArmWithHand` & `buildAnatomicalLegAndBoot` replace spherical/cylindrical ends with muscular biceps/calves, articulated fists (palm, 4 curled fingers, thumb), and multi-part shoes/boots.
- **Draw-Call Batching (`optimizeCharacterMeshes`)**: Post-assembly pass merges single-material `SkinnedMesh` parts by material using `BufferGeometryUtils.mergeGeometries` while retaining each vertex's exact bone `skinIndex` and `skinWeight`, keeping WebGL draw calls low (`9–15` meshes per fighter) and maintaining `15.4 FPS` under headless SwiftShader CPU WebGL (`npm run test:e2e`).
- **3D Studio Bust Portraits ([`PortraitFactory.ts`](../src/rendering/PortraitFactory.ts))**: Renders offscreen studio-lit `256×256` bust portraits directly from the upgraded `.glb` assets via `warmFromLoadedModels`, updating tiles and HUD portraits 1:1 with in-arena fighters.

## 3. Boss Steve Mechanics & Progression

- **Boss Multipliers (`BOSS_MULTIPLIERS`)**: When selected as CPU Final Boss (`p2 === 'steve'`), Steve receives `2×` HP (`200` max HP), `1.18×` damage multiplier, `0.55×` meter scaling, passive HP regeneration (`1.8 HP/s` after `3s` without taking damage), and higher AI reaction tiers.
- **Counter Drop Assist (`budget`)**: Charges over `15s` in boss encounters (`#budget-meter` / `B` key / mobile `DROP` button) and triggers a cinematic drop dealing `25%` of Boss Steve's max HP (`50` HP).
- **Unlock Progression**: Beating Boss Steve or reaching a 3-match win streak unlocks Steve for `1P` selection across subsequent matches via persistent storage (`src/core/storage.ts`).
