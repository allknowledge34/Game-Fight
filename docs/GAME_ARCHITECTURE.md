# Game Architecture — Sansad Showdown Clean-Room Reconstruction

## 1. Guiding Principles

1. **Simulation Decoupled from Rendering:** `FighterController`, `CombatCollision`, `RoundManager`, `CpuAi`, and `BattleSimulation` run purely in deterministic TypeScript (`60 Hz` ticks, zero Three.js or DOM dependency) so all combat logic, AI, round rules, and netcode determinism can execute headlessly inside Vitest AND in browser/server validation.
2. **Clean-Room 3D Presentation Layer:** `ThreeRenderer`, `FighterRig` (35-DOF articulated rig + procedural IK/pose synthesizer), `StageManager`, `ParticleSystem`, `SuperDirector`, and `PortraitFactory` consume simulation state snapshots to render smooth interpolated visuals at native monitor refresh rate.
3. **Resilient Real-Time Multiplayer Backend:** A dedicated Node HTTP + WebSocket room server (`server/`) provides room creation (`POST /api/room`), room validation & join (`GET /api/room/:code`), automatic TTL cleanup, dual-channel binary-compact or JSON input forwarding, host state authoritative snapshot broadcasting, disconnect/away detection, and clean reconnection/cleanup.

---

## 2. Directory Structure

```text
/Users/sachinkumar/Documents/game/
├── index.html                  # Semantic screens (#legal, #loading, #title, #select, #online, #hud, #pause, #result, #touch)
├── package.json                # Scripts: dev, build, server, test, test:unit, test:integration, test:e2e
├── tsconfig.json               # Strict TypeScript config
├── vite.config.ts              # Vite build + /api & /ws dev proxy to local backend
├── server/
│   ├── index.ts                # Standalone Node HTTP + WebSocket server entrypoint
│   └── roomServer.ts           # Modular createRoomServer() factory for testability & prod
├── src/
│   ├── main.ts                 # Bootstrap & global error resilience
│   ├── core/
│   │   ├── types.ts            # Shared DTOs, states, input frames, match options
│   │   ├── storage.ts          # Safe localStorage persistence (legal, muted, bapu unlock)
│   │   └── prng.ts             # Deterministic seeded PRNG for lockstep/hazards
│   ├── characters/
│   │   ├── roster.ts           # All 11 netas + Boss config, super metadata, voice lines
│   │   └── moveTables.ts       # Per-fighter reach/height tuning & combo chain overrides
│   ├── combat/
│   │   ├── moves.ts            # Frame data (startup/active/recovery/damage/stun/launch)
│   │   ├── CombatResolver.ts   # Hit/block/counter/grab checks, damage scaling, meter gain
│   │   └── RoundManager.ts     # 60s clock, FT2 rounds, KO / Time Over / Draw resolution
│   ├── physics/
│   │   └── FighterController.ts # 60Hz kinematics, pushbox resolution, hurtbox geometry
│   ├── ai/
│   │   └── CpuAi.ts            # Easy/Normal/Hard/Boss AI decision engine with reaction queues
│   ├── input/
│   │   ├── InputManager.ts     # Keyboard + pointer virtual joystick + mobile diamond buttons
│   │   └── inputEncoding.ts    # 2-byte deterministic netcode input bitmask packing
│   ├── simulation/
│   │   └── BattleSimulation.ts # Headless deterministic 60Hz match core + hazards + boss logic
│   ├── animation/
│   │   └── PoseSolver.ts       # 35-DOF keyframe pose evaluator (idle/walk/jump/attacks/ko/wins)
│   ├── rendering/
│   │   ├── ThreeScene.ts       # WebGLRenderer, ACES tone mapping, bloom composer, Resize/Cleanup
│   │   ├── FightCamera.ts      # Dynamic zoom/pan combat camera + traumatic shake + cinema override
│   │   ├── FighterRig.ts       # Clean-room stylized 3D articulated character builder & rig updater
│   │   ├── ParticleSystem.ts   # GPU point particles, hit sparks, shockwave rings
│   │   ├── PortraitFactory.ts  # Offscreen 2D canvas portraits & hero icons for all 11 fighters
│   │   └── SuperDirector.ts    # Signature 3D visual effects & cameras for all 11 Supers + Budget + Grapple
│   ├── stages/
│   │   ├── stageThemes.ts      # Sansad, Jantar Mantar, Desi Sadak palettes & lighting presets
│   │   ├── SansadStage.ts      # Parliament rotunda, pillars, waving tricolor flags & Diwali overlay
│   │   ├── JantarStage.ts      # Samrat Yantra staircase sundial, quadrants, circular observatory
│   │   ├── RoadStage.ts        # Indian bazaar street, auto-rickshaws, shopfronts, dogs, confetti
│   │   └── CrowdAndProps.ts    # Instanced spectators, flipping slogan placards, Chaiwala, Cow, Mithai, Bomb
│   ├── audio/
│   │   └── AudioEngine.ts      # Web Audio synth SFX + compressor limiter + procedural BGM loops
│   ├── multiplayer/
│   │   └── NetClient.ts        # HTTP/WebSocket room client, RTT ping, binary input & snapshot sync
│   ├── ui/
│   │   ├── NewsdeskData.ts     # Anchors (Shor Sharma, Tweety Trollwala), reactive quips & breaking ticker
│   │   ├── ScreenManager.ts    # Screen transitions, legal modal, title, pause, result & focus trapping
│   │   ├── SelectController.ts # Roster tiles, 1P/CPU picking, stage/difficulty controls, online bar
│   │   └── HudController.ts    # Slanted HP bars, SHAKTI fill, timer, budget bar, newsdesk, popups
│   ├── game/
│   │   └── GameApp.ts          # Top-level orchestrator connecting Simulation <-> Rendering <-> Audio <-> UI <-> Net
│   └── styles/
│       └── main.css            # Modern layered CSS (tokens, responsive HUD, slanted bars, newspaper, touch)
├── tests/
│   ├── unit/                   # Simulation, physics, combat, moves, round manager, AI, input encoding, storage
│   ├── integration/            # Room server HTTP/WS lifecycle, full headless battle loop, boss/super/budget
│   └── e2e/                    # Live Playwright Chromium flows (Desktop, Mobile Landscape, 2-Player Online)
└── docs/
    ├── REVERSE_ENGINEERING_REPORT.md
    ├── GAMEPLAY_SPECIFICATION.md
    ├── ASSET_INVENTORY.md
    ├── REFERENCE_BEHAVIOR_MATRIX.md
    ├── GAME_ARCHITECTURE.md
    ├── TEST_REPORT.md
    └── KNOWN_LIMITATIONS.md
```
