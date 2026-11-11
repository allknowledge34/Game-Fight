# Sansad Showdown — Clean-Room Browser 3D Fighter Reconstruction

An independent, clean-room 3D browser fighting game built with **TypeScript**, **Three.js**, **Web Audio API**, and a **Node.js HTTP + WebSocket** friend-room server, reconstructing the observable gameplay, mechanics, interaction flows, stages, and multiplayer behavior of FightKaro / Sansad Showdown (`https://fightkaro.com/`).

---

## Features

- **11 Stylized 3D Fighters + Boss Mode:** MitraMan, Yatra Boy, Deedee, Tariff Taau, Dozer Dada, Toll Man, Sutti Babu, Rail Raja, Ghar Mantri, Fact Bhai, and unlockable Boss Mbapu (`2x` HP, `1.15x` power, passive regeneration, and **Nirmala Budget (`B`)** counter assist).
- **Fixed 60 Hz Deterministic Combat Engine:** Pushbox separation (`0.72 m`), standing/crouch hurtboxes, `9f` strike buffer / `30f` super buffer, hit-confirm chain combos (`jab -> cross -> uppercut`, etc.), high/mid/low guard mixups, `0.15x` non-lethal chip damage, `1.2x` counter hits, grab connect & tech breaks, and signature **SHAKTI Super Cinematics** (`100` meter -> `30%` damage).
- **3 Complete 3D Stages:** **Sansad Bhavan** (Diwali twilight + rangoli + diyas), **Jantar Mantar** (Samrat Yantra staircase sundial + observatory pillars), and **Desi Sadak** (Indian street market, auto-rickshaw, sabzi carts), plus reactive tiered crowds, slogan placards, strolling Chaiwala, Stray Cow jump-hazard, Soan Papdi mithai heals, and Sutli Bombs.
- **CPU AI & Local Friend Multiplayer:** Easy / Normal / Hard CPU tiers plus real-time 2-player online rooms via 4-character unambiguous room codes (`POST /api/room`, `GET /api/room/:code`, binary WebSocket input & state sync).
- **Desktop & Mobile Landscape Controls:** Keyboard controls (`A/D/W/S`, `J/K/I/L/B`, `Esc`) and virtual thumbstick + diamond action buttons on touchscreens with orientation prompt.
- **Self-Contained Procedural Assets:** Original 35-DOF parametric 3D character rigs, canvas portrait generators, and Web Audio synthesizer SFX & BGM loops (no redistributed copyrighted models, photos, or MP3s).

---

## Quick Start

### Install Dependencies
```bash
npm install
```

### Run in Development Mode
Terminal 1 (multiplayer room server on `127.0.0.1:8787`):
```bash
npm run server
```
Terminal 2 (Vite dev server on `http://127.0.0.1:5173` with `/api` & `/ws` proxy):
```bash
npm run dev
```

### Production Build & Serve
```bash
npm run build
PORT=8787 npm start
```
Then open `http://127.0.0.1:8787/` in any modern WebGL-capable browser.

---

## Controls

| Action | Desktop Keys | Mobile Touch |
| :--- | :--- | :--- |
| Move Left / Right | `A` / `D` or `←` / `→` | Virtual Thumbstick |
| Jump / Crouch | `W` / `S` or `↑` / `↓` | Thumbstick Up / Down |
| Guard | Hold Back (`←` or `→` away) | Hold Back on Thumbstick |
| Punch / Kick | `J` (`Z`) / `K` (`X`) | `PUNCH` / `KICK` |
| Grab (or Tech Break) | `I` (`V`) or `J + K` | `GRAB` |
| Super Move (`100` SHAKTI) | `L` / `Space` / `C` | `SUPER` |
| Nirmala Budget (vs Boss) | `B` | `BUDGET` |
| Pause / Music / Mute | `Esc` / `M` / `N` | Top Pause / Sound Buttons |

---

## Testing & Verification

```bash
npm run test:unit        # Fast deterministic physics, combat, rounds & AI unit specs
npm test                 # All unit + integration specs (including HTTP/WS room server)
npm run test:e2e         # Real Chromium Playwright E2E (desktop, mobile, 2-player online)
npm run build            # Strict TypeScript check + production bundle
```

---

## Documentation

- [Reverse Engineering Report](docs/REVERSE_ENGINEERING_REPORT.md)
- [Gameplay Specification](docs/GAMEPLAY_SPECIFICATION.md)
- [Asset Inventory](docs/ASSET_INVENTORY.md)
- [Reference Behavior Matrix](docs/REFERENCE_BEHAVIOR_MATRIX.md)
- [Game Architecture](docs/GAME_ARCHITECTURE.md)
- [Test Report](docs/TEST_REPORT.md)
- [Known Limitations](docs/KNOWN_LIMITATIONS.md)
