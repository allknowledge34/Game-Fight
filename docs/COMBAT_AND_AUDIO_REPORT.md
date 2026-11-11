# Combat Mechanics, Signature Ultimates & Audio Report

## 1. Frame-Accurate Combat & Character Tuning

The 60Hz deterministic simulation ([`BattleSimulation.ts`](../src/simulation/BattleSimulation.ts), [`FighterController.ts`](../src/physics/FighterController.ts), [`CombatResolver.ts`](../src/collision/CombatResolver.ts)) preserves FightKaro's complete move grammar:
- **Normals & Chains**: Standing `jab → cross → uppercut / finisher`, `kick → roundhouse`, crouching `lowJab → uppercut / sweep`, directional specials `→J` (`special1`) & `→K` (`special2`), airborne `airPunch` & `airKick`, grab (`I` / `J+K`) with simultaneous tech break (`grappleBreak`), and blocking by holding back (high/mid guard with `15%` non-lethal chip damage; low `sweep` breaks standing guard).
- **Character Differentiation**: Each fighter defines custom speed, jump velocity, damage multiplier (`damageMul`), attack reach overrides (`CHARACTER_REACH_OVERRIDES` in [`moves.ts`](../src/combat/moves.ts)), chain overrides (`CHARACTER_CHAIN_OVERRIDES`), custom popup move callouts (`moveNames`), and live newsdesk headlines ([`NewsdeskData.ts`](../src/ui/NewsdeskData.ts)).

## 2. Signature Ultimate Cinematics ([`SuperDirector.ts`](../src/rendering/SuperDirector.ts))

At 100% `SHAKTI` meter (`L` / `Space` / touch `SUPER`), each character launches a unique 4.0-second cinematic ultimate (`30` damage standard, `40` damage for Boss Steve) with custom camera orbit, stage mood dimming, particles, and character-specific 3D VFX sequences:

| Fighter | Super Name | 3D Visual Sequence |
|---|---|---|
| **Kratos** | `SPARTAN RAGE` | Spinning fiery Spartan ground aura, orbiting blazing Blades of Chaos, and descending colossal frost-edged Leviathan Axe slam |
| **Sun Wukong** | `GREAT SAGE TRANSFORM` | Twin luminous golden Hair Clones flanking target + skyscraper-scale Ruyi Jingu Bang pillar crashing from the sky |
| **Michael** | `BULLET-TIME FOCUS` | Spinning golden/red sniper crosshair reticle locking onto defender + rapid golden tracer projectile barrage |
| **Spider-Man** | `MAXIMUM SPIDER` | Crisscrossing glowing white web beams + spinning wireframe web-cocoon tether sphere |
| **Iron Man** | `MAXIMUM PULSE UNIBEAM` | Supercharging cyan chest Arc Reactor core + arena-spanning glowing cyan-white Unibeam plasma cylinder |
| **Thor** | `BIFROST THUNDERSTRIKE` | Concentric multi-color Bifrost energy cylinders descending over target + falling storm-charged Mjolnir hammer strike |
| **Boss Steve** | `OVERWORLD APOCALYPSE` | Dual rising obsidian confinement pillars trapping the foe + heavy dark-iron Falling Anvil & TNT shockwave |

## 3. Spoken Character Dialogue & Combat Audio ([`AudioEngine.ts`](../src/audio/AudioEngine.ts))

- **Generated Spoken Voice & Announcer Assets (`public/audio/`)**: `29` uncompressed mono 22050Hz `PCM WAVE` clips compiled via [`scripts/generateAudio.ts`](../scripts/generateAudio.ts) using macOS `say` + `afconvert`:
  - **8 Announcer Calls**: `ann_round1.wav`, `ann_round2.wav`, `ann_round3.wav`, `ann_fight.wav`, `ann_ko.wav`, `ann_win.wav`, `ann_lose.wav`, `ann_boss.wav`.
  - **21 Fighter Voice Clips (`intro`, `super`, `win`)**: Distinct voice timbres mapped per character (`Ralph` for Kratos, `Rishi` for Sun Wukong, `Daniel` for Michael, `Eddy` for Spider-Man, `Reed` for Iron Man, `Grandpa` for Thor, and `Zarvox` for Boss Steve).
- **Audio Engine Behavior**: Lazy-decodes and caches `.wav` voice buffers on first playback, ducks music bus gain cleanly (`0.2 → 0.08`) while dialogue speaks, prevents overlapping speech clutter by stopping prior speech channels cleanly, respects global Pause & Mute states (`N` / sound toggle), and differentiates synthesized hit/super SFX timbres per character weapon (`hit(power, fighterId)`, `superSting(fighterId)`).
