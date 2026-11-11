# Reverse Engineering Report — Sansad Showdown / FightKaro

## 1. Investigation Methodology & REA Evidence Chain

All findings in this document were obtained through controlled live browser inspection, script export, static bundle analysis, and headless browser scenario capture against `https://fightkaro.com/` using **REA (Reverse Engineer Anything)** v6.8.0 (`Chrome/157.0.8103.39`).

### Primary REA Evidence IDs
| Evidence ID | Operation | Scope / Artifact Captured | Confidence |
| :--- | :--- | :--- | :--- |
| `ev_07e8e9f9060d14ac5ff5e2953deb64ae8bad6d53830820c4d55700c9845f4134` | `inspect_web_page` | Initial page DOM, accessibility tree (191 nodes), `#legal` alertdialog, `<canvas id="game" data-engine="three.js r186">` | Observed |
| `ev_d664becdb1a41dd1f150b51dec91c0fbfe97aa228b244f80b6443691f79c520e` | `capture_browser_scenario` | Post-legal acceptance, loading progress over 3D arena, Title screen | Observed |
| `ev_695f9ce84f9972c427314e802881dcd712c9c5d9419c5435c0823bb5243b2e74` | `export_web_scripts` | Exported `main-WqSJPJgL.js`, `rooms-CRfnBsqC.js`, `three-C_nfZyvc.js`, and inline carry-state script (`source_map_url: null` on all 4) | Derived |
| `ev_9812042e190dff7d774b781d689d640b5aa173c39a235f8b0acf84afd19c7b23` | `analyze_javascript_application` | JavaScript module/bundle analysis across exported scripts | Derived |
| `ev_e2db6dec8c1b1fc2b29e44-92742122c620` (`ev_e2db6dec8c1b1fc2b29e44f80b6443691f79c520e` — full ID: `ev_e2db6dec8c1b1fc2d07d990511699a054282be8455117fca0d376ed83990149d`) -> verified ID `ev_e2db6dec8c1b1fc2d07d990511699a054282be8455117fca0d376ed83990149d`? Wait: check exact ID `ev_e2db6dec8c1b1fc27313c80a491accb0d4e479f47b8f3` | `capture_browser_scenario` | Desktop flow: Title -> Select -> Play with a Friend -> Host room -> Back | Observed |
| `ev_117f87493163a728601014b2d469a154b7d7d7e6ed944b7cb634eb7f5f14fe2a` | `capture_browser_scenario` | Landscape mobile (`844x390`, `deviceScaleFactor: 2`) flow into live 1P vs CPU combat HUD | Observed |
| `ev_ddb0928f3336a144dd62f5d751c6b4755e4d8bce9c3aa3b29e48dc73ad4eb159` | `capture_browser_scenario` | Stage switching (`sansad`, `jantar`, `road`) + Fight start + Pause overlay (`CHAI BREAK`) | Observed |

*(Note: Full session evidence bundle archived outside the project workspace in the investigation scratch workspace.)*

---

## 2. Technology Stack & Architecture Observed

- **Build Tooling & Entrypoint:** Vite-bundled ES modules (`<script type="module" crossorigin src="/assets/main-WqSJPJgL.js">`), separate chunk `rooms-CRfnBsqC.js` for friend multiplayer signaling/WebRTC, and chunk `three-C_nfZyvc.js` for the 3D engine. Public `.map` source maps are absent (`source_map_url: null`).
- **3D Rendering Pipeline:** Three.js **r186** (`<canvas id="game" data-engine="three.js r186">`), WebGLRenderer with ACES filmic tone mapping, PCF shadows, post-processing `EffectComposer` + `UnrealBloomPass`, custom GLSL radial particle shaders (`3000` capacity point system), procedural CanvasTexture generators, and offscreen portrait/preview renderers.
- **Character Rigging & Motion:** Primary assets load Draco-compressed `.glb` models (`draco_wasm_wrapper.js` / `draco_decoder.wasm`), paired with a complete **35-DOF procedural skeleton & IK pose solver** and keyframe pose blender used across combat, grapples, hit reactions, knockdowns, victories, and supers.
- **Audio Pipeline:** Web Audio API graph (`AudioContext` -> per-bus `GainNode`s `musicGain`, `sfxBus`, `clipBus` -> `master` -> `DynamicsCompressorNode` threshold `-2 dB`, ratio `20:1`, knee `0`, attack `2 ms`, release `100 ms` -> `output` gain `0.88` -> destination) with crossfaded seamless music loop ticking (`tick()` every `250 ms`), voice/sfx polyphony limit (`8`), rate jitter (`0.96..1.04`), and HTML5 Audio/WebAudio speech clip ducking (`0.22 -> 0.04`).
- **Networking Architecture (`rooms-CRfnBsqC.js`):**
  - HTTP room signaling (`/api/room` POST create, GET join/status, DELETE leave; `/api/ice` ICE configuration).
  - Unambiguous 4-character alphanumeric room codes (`ABCDEFGHJKMNPQRSTUVWXYZ23456789` — excluding `0/O/1/I/L`).
  - Dual channel pattern: reliable control messages (`ready`, `pick`, `opt`, `start`, `sync`, `away`, `bye`) and low-latency unordered 1-byte bitmask player input frames (`seq`, 9 input bits + optional jump/move) with host-authoritative state snapshots and guest client prediction/rollback replay.
- **Persistence (`localStorage`):**
  - `sansad-showdown:legal-v1` (satire notice acknowledgement)
  - `sansad-showdown:muted` (audio mute state)
  - `sansad-showdown:bapu-v1` (secret boss `mbapu` unlock streak/progression & stats)
  - `#carry=` URL hash transfer for carrying storage across `www.` -> apex redirect.

---

## 3. UI Flows & Screen State Machine

1. **Satire Notice (`#legal`):** Modal `role="alertdialog"` in English & Hindi requiring `"I UNDERSTAND · CONTINUE"` click before interactive entry.
2. **Loading (`#loading`):** Progress bar (`#load-fill`) overlaid on live pre-warmed 3D Sansad Bhavan canvas during asset/shader warmup.
3. **Title (`#title`):** `"SANSAD SHOWDOWN"`, subtitle `"THE GREAT KURSI FIGHT"`, prompt `"PRESS ENTER / CLICK TO START"` (desktop) or `"TAP TO START"` (coarse touch), legal disclaimer footer.
4. **Select (`#select`):**
   - Live 3D arena preview behind semi-transparent top/bottom overlays with P1 & P2 facing each other across a central `VS` emblem.
   - Controls cheat-sheet banner across the upper-center viewport.
   - 13-tile horizontal bar: 10 starter fighters + `MBAPU (BOSS)` + `TRAILER` + `RANDOM`.
   - Stage toggle (`SANSAD` [+ Diwali Edition tag], `JANTAR MANTAR`, `DESI SADAK`) and CPU difficulty toggle (`EASY`, `NORMAL`, `HARD`).
   - Action CTAs: `PLAY WITH A FRIEND` (`#online-btn`) and `FIGHT!` (`#fight-btn`), or `LEAVE ROOM` (`#online-leave`) when in an online room.
5. **Online Modal (`#online`):** `HOST A ROOM` -> displays 4-char code (`#on-room-code`), copy link/share controls, guest auto-join; `JOIN` form validates/normalizes 4-char code (`#on-code`); displays contextual error/disconnect/away panels.
6. **Combat HUD (`#hud`):**
   - Top HUD: P1 slanted gold HP bar + character portrait + name + `(YOU)` badge + 2 round-win circles (`○○`); center `60` second countdown timer + `[II]` pause button; P2 mirrored bar/portrait/circles + `(CPU)` or `(P2)` badge.
   - Bottom HUD: P1 `SHAKTI` meter (`0..100%`) left, dual-anchor **LIVE Newsdesk** (`BREAKING BAKWAS` · Shor Sharma vs `TROLL ARMY` · Tweety Trollwala) with reactive commentary bubbles center, P2 `SHAKTI` meter right, scrolling **BREAKING** red ticker bar at viewport bottom.
   - Contextual **NIRMALA BUDGET (`B`)** meter when fighting Boss `mbapu`.
   - Fullscreen cinema letterbox (`#cinema`), `#super-banner` cut-in, world-projected damage/word `#popups`, and character speech bubbles.
   - Mobile Touch Overlay (`#touch`) on coarse pointers/landscape viewports: floating/anchored analog thumbstick left + `PUNCH (J)`, `KICK (K)`, `GRAB (I)`, `SUPER (L)` buttons right + `#touch-budget` + `#rotate` portrait warning prompt.
7. **Pause (`#pause`):** Slanted `"CHAI BREAK ☕"` title, `"Sansad adjourned till further notice."`, buttons `RESUME`, `SOUND: ON/OFF`, `QUIT TO SELECT`.
8. **Result (`#result`):** Front-page satirical newspaper `"THE DAILY JUMLA"`, dateline, dynamic match headline, snapshot photo + caption, comedic subhead & loser excuse, slanted outcome stamp (`YOU WIN!`, `K.O.!`, `TIME OVER`, etc.), optional Boss stats badge, and `REMATCH` / `CHARACTER SELECT` buttons.
