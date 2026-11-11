# Gameplay Specification — Sansad Showdown (Clean-Room Reconstruction)

This document defines the exact deterministic simulation rules, combat frame data, roster stats, AI tiers, stage mechanics, and match progression derived from live browser observation (`ev_117f8749...`, `ev_ddb0928f...`, `ev_695f9ce8...`).

---

## 1. Fixed Simulation & Arena Constants

| Parameter | Observed Value | Notes |
| :--- | :--- | :--- |
| Fixed tick rate | `60 Hz` (`FIXED_DT = 1 / 60 s`) | Render loop uses frame delta accumulator with max clamp (`0.05 s`) |
| Arena half-width | `6.5 m` (`[-6.5, +6.5]`) | Wall pushback clamped inside stage boundaries |
| Spawn gap | `2.6 m` (`P1 = -1.3`, `P2 = +1.3`) | Facing inward (`P1 = +1`, `P2 = -1`) |
| Minimum fighter separation | `0.72 m` | Grounded pushbox resolution prevents overlap |
| Standing height / Crouch ratio | `1.85 m` / `0.62` | Hurtbox capsules: `legs (r=0.20)`, `torso (r=0.26)`, `head (r=0.16)` |
| Gravity | `24 m/s²` | Applied to airborne fighters & launch juggles |
| Min strike reach | `0.52 m` | Fallback floor for close-range hits |
| Chip damage multiplier | `0.15` | Applied when attack is guarded |
| Counter-hit multiplier | `1.20` | Applied when hitting opponent during startup/active frames |
| Starting / Max HP | `100` (Standard) | Boss (`mbapu`) HP multiplier = `2.0x` (`200 HP`) |
| SHAKTI Super Meter | `0 .. 100` | Needed `100` to unleash Super (`L` / `Space`) |

---

## 2. Control Mapping & Input Buffering

### Desktop Keyboard
- **Move Left / Right:** `A` / `D` or `ArrowLeft` / `ArrowRight`
- **Jump / Crouch:** `W` / `ArrowUp` (jump), `S` / `ArrowDown` (crouch)
- **Guard (Auto-Block):** Hold `Back` (away from opponent) while standing or crouching
- **Punch / Kick:** `J` or `Z` (Punch), `K` or `X` (Kick)
- **Grab:** `I`, `V`, or `J + K`
- **Super Attack:** `L`, `Space`, or `C`
- **Nirmala Budget Assist (vs Boss Mbapu):** `B`
- **System:** `Escape` (Pause), `M` (Toggle Music), `N` (Mute All)

### Mobile Touch (Landscape)
- Left virtual thumbstick: horizontal deadzone `±0.38`, jump `dy < -0.5`, crouch `dy > 0.5`.
- Right diamond cluster: `PUNCH`, `KICK`, `GRAB`, `SUPER` + conditional `BUDGET` button.

### Input Buffers & Hit-Cancel Windows
- **Normal input buffer:** `9` frames (`150 ms`).
- **Super buffer:** `30` frames (`500 ms`).
- **Combo Chain Cancel:** Allowed when current move has connected (`hasHit == true`), current frame >= `startup + active`, and a valid next move in `chains` (`jab -> cross/kick`, `cross -> uppercut/finisher`, `kick -> roundhouse`, `lowJab -> uppercut/sweep`) is pressed/buffered.

---

## 3. Core Frame Data & Move Table

| Move | Input | Startup / Active / Recovery (frames) | Damage | Guard Height | Hitstun / Blockstun | Special Properties |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `jab` | `J` | `5 / 3 / 10` (18f) | `5` | High | `16 / 10` | Chains `J -> cross`, `K -> kick` |
| `cross` | Chain `J,J` | `6 / 3 / 12` (21f) | `6` | High | `18 / 11` | Chains `J -> uppercut`, `K -> finisher` |
| `kick` | `K` | `9 / 4 / 15` (28f) | `9` | Mid | `22 / 13` | Chains `K -> roundhouse` |
| `uppercut` | Chain finisher | `9 / 4 / 20` (33f) | `11` | Mid | `24 / 15` | Knockdown, upward launch (`vy = 8`) |
| `roundhouse` | Chain finisher | `11 / 5 / 22` (38f) | `13` | High | `26 / 16` | Knockdown, launch (`vy = 5`, push `4.5`) |
| `finisher` | Chain finisher | `10 / 4 / 20` (34f) | `12` | Mid | `24 / 15` | Knockdown, launch (`vy = 5.5`, push `3.5`) |
| `lowJab` | `↓ + J` | `6 / 3 / 11` (20f) | `4` | Low | `18 / 9` | Crouching; chains `J -> uppercut`, `K -> sweep` |
| `sweep` | `↓ + K` | `11 / 4 / 20` (35f) | `8` | Low | `22 / 14` | Crouching; knockdown (`vy = 3.2`) |
| `special1` | `→ + J` | `13 / 4 / 19` (36f) | `13` | Mid | `26 / 16` | Forward lunge (`3.0`), launch (`vy = 7.5`) |
| `special2` | `→ + K` | `15 / 5 / 20` (40f) | `14` | Mid | `26 / 16` | Forward lunge (`2.6`), heavy push (`5.2`, `vy = 4.5`) |
| `airPunch` | Airborne + `J` | `4 / 10 / 0` | `6` | Mid | `18 / 11` | Cancels into `landing` (`14f`) on touchdown |
| `airKick` | Airborne + `K` | `7 / 12 / 0` | `8` | Mid | `20 / 12` | Cancels into `landing` (`14f`) on touchdown |
| `grab` | `I` / `V` / `J+K` | `6 / 3 / 24` (33f) | `14` | Unblockable | Grapple cinematic | Lunges `0.6`; breakable on early tech window |

### Combo Scaling & SHAKTI Meter Gain
- **Combo Scaling Array:** `[1.0, 0.90, 0.78, 0.66, 0.54, 0.44]` (floor `0.35`; additional `0.8x` factor vs Boss).
- **SHAKTI Gain on Block:** Attacker `+2`, Defender `+3`.
- **SHAKTI Gain on Clean Hit:** Attacker `+(damage * 0.9 + 2)`, Defender `+(damage * 0.6)`.
- **Supers:** Unblockable cinematic sequence once `meter >= 100` (at close/mid range or screen trigger), resetting meter to `0` and dealing `30` base damage (`30%` max HP), launching opponent into knockdown (`KO` if lethal).

---

## 4. Playable Roster & Signatures (11 Fighters)

| ID | Display Name | Team | Accent | Walk Fwd / Back | Jump V / Vx | Super Move (`30%` DMG) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `modi` | `MITRAMAN` | Team Vaada | `#ff9933` | `2.20 / 1.70` | `7.6 / 2.5` | `MITRA CHAKRA` (aerial solar chakra throw) |
| `rahul` | `YATRA BOY` | Team Yatra | `#2e9bff` | `2.35 / 1.80` | `7.6 / 2.5` | `ALOO SE SONA` (alchemy converter machine) |
| `didi` | `DEEDEE` | Team Dharna | `#22b35e` | `2.40 / 1.85` | `7.7 / 2.6` | `JADU HOBE` (cauldron hex -> frog transform -> pop) |
| `trump` | `TARIFF TAAU` | Team Tariff | `#e0262f` | `2.10 / 1.65` | `7.5 / 2.4` | `TARIFF TSUNAMI` (executive order stamp + 50% crate deluge) |
| `yogi` | `DOZER DADA` | Team Dozer | `#f05a00` | `2.20 / 1.70` | `7.6 / 2.5` | `DOZER KA DHAMAKA` (bulldozer entrance & triple bucket slam) |
| `nitin` | `TOLL MAN` | Team Highway | `#ff9a1f` | `2.20 / 1.70` | `7.6 / 2.5` | `GADDHA BLAST` (pothole sink + E20 cane-ethanol reactor blast) |
| `ravi` | `SUTTI BABU` | Team Viral | `#8b5cf6` | `2.25 / 1.75` | `7.7 / 2.5` | `TIME IS MONEY` (gold timepiece freeze + dash strikes) |
| `lalu` | `RAIL RAJA` | Team Kulhad | `#16a34a` | `2.15 / 1.65` | `7.5 / 2.4` | `RAIL RAJA EXPRESS` (station portal + locomotive ram) |
| `amit` | `GHAR MANTRI` | Team Booth | `#cbd5e1` | `2.10 / 1.65` | `7.5 / 2.4` | `SHAH-MAAT` ( giant chessboard + supporter wave + golden knight) |
| `dhruv` | `FACT BHAI` | Team Doston | `#22d3ee` | `2.35 / 1.80` | `7.7 / 2.5` | `DOOMSCROLL` (energy drain + glowing smartphone + hound pounce) |
| `mbapu` | `MBAPU` | Shanti Akhada | `#ffd700` | `2.30 / 1.80` | `8.0 / 2.6` | `MANCH CHHODO` (spinning charkha thread cocoon + salt storm) |

- **Boss Unlock & Balance:** Defeating Boss `mbapu` (`2x HP`, `1.15x power`, `0.4x meter gain`, passive HP regen `2/sec` after `3s` idle) or achieving a 3-win streak (`streak >= 3`) unlocks `mbapu` as playable (`sansad-showdown:bapu-v1`). Fighting against Boss enables the **Budget (`B`)** meter (`15s` cooldown; summons Nirmala assist dealing `25%` max HP GST-slab slam).

---

## 5. CPU AI Tiers

| Tier | Reaction Time (`s`) | Block Chance | Punish Chance | Aggression | Super Probability | Grab Tech Chance | Boss Read Chance |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `easy` | `0.42` | `0.18` | `0.20` | `0.45` | `0.35` | `0.08` | `0.20` |
| `normal` | `0.26` | `0.45` | `0.50` | `0.65` | `0.70` | `0.30` | `0.35` |
| `hard` | `0.14` (`0.06` vs Boss) | `0.75` | `0.85` | `0.80` | `1.00` | `0.60` | `0.80` |

---

## 6. Match Rules & Dynamic Stage Hazards

- **Round Format:** Best of 3 rounds (**First to 2**, `60 s` round timer). On timer expiry, higher remaining HP% wins (`TIME OVER`); equal HP declares `DRAW`.
- **Stage Themes:**
  1. `sansad` (**Sansad Bhavan**): Circular red-sandstone pillared parliament rotunda, tricolor flags, twilight sunset sky, optional festive **Diwali Mode** (diyas, rangoli centerpiece, hanging lanterns, background fireworks).
  2. `jantar` (**Jantar Mantar**): Monumental red-sandstone Samrat Yantra triangular sundial staircase, white quadrants, circular Misra/Rama Yantra pillars, Hindi/English observatory plaque, checkered stone court.
  3. `road` (**Desi Sadak**): Asphalt avenue with white centerline stripe, colorful Indian shopfronts, overhead fairy/street lights, fruit/sabzi carts, auto-rickshaw, sleeping street dogs, rain puddles & confetti.
- **Dynamic Ambient Events:**
  - **Tiered Crowd & Placards:** Crowd waves with excitement, flips placards toward the match leader (`VOTE!`, `BADLAV`, `SUNO!`, `JAI HIND`), or pulls out selfie phones & samosas if combat stalls (`calm` / boredom meter).
  - **Chaiwala:** Periodically strolls behind the arena calling `"Chai!"`.
  - **Stray Cow & Sabziwala Cart / Mithai / Sutli Bomb:** Mid-round comedic stage hazards/pickups (healing Soan Papdi mithai box, warning cow stampede jump-over, Diwali sutli bomb fuse).
