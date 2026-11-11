# Test Report — Sansad Showdown Clean-Room Reconstruction

All automated checks were executed after the final code edit against the built production bundle (`npm run build`) and real headless Chromium + loopback Node HTTP/WebSocket room server.

---

## 1. Build Verification

- **Command:** `npm run build` (`tsc --noEmit && vite build`)
- **Result:** Passed (`0` TypeScript errors, Vite production bundle generated in `664ms`).
- **Bundle Output:**
  - `dist/index.html` (`13.47 kB`)
  - `dist/assets/index-BSYX1smP.css` (`19.49 kB`)
  - `dist/assets/index-CCHC4xpt.js` (`139.97 kB`)
  - `dist/assets/three-CbaolE55.js` (`506.48 kB`)

---

## 2. Unit & Integration Test Suite (`npm test`)

- **Command:** `npm test` (`vitest run tests/unit tests/integration`)
- **Result:** **6 test files passed, 17 / 17 tests passed** (`312ms` total run time, `0` skipped, `0` failures).

| Test File | Scope Verified | Cases Passed |
| :--- | :--- | :--- |
| `tests/unit/fighter_physics.test.ts` | Jump velocity & landing recovery, `±6.5` wall clamping, `0.72m` pushbox separation, `1.85m` vs `0.62x` crouching hurtbox height | `4 / 4` |
| `tests/unit/combat_and_moves.test.ts` | Standing jab hit & meter gain, high/mid standing guard + non-lethal chip damage, crouch dodging high strikes, chain combos with combo scaling, simultaneous grab tech break | `5 / 5` |
| `tests/unit/round_and_boss.test.ts` | FT2 round/draw/timeover resolution, Boss Mbapu `200 HP` & passive regen, `15s` Nirmala Budget Assist `25%` slam, 3-streak / boss-clear progression | `3 / 3` |
| `tests/unit/ai_and_encoding.test.ts` | 2-byte binary player input packing roundtrip, Hard CPU approach / cow hazard jump / full-meter Super execution | `2 / 2` |
| `tests/integration/battle_simulation.test.ts` | Full headless 60 Hz match lifecycle, snapshot export/apply determinism, signature SHAKTI super trigger across all 11 fighters | `2 / 2` |
| `tests/integration/room_server.test.ts` | Real Node HTTP + WebSocket room creation, 4-char code validation (`400`/`404`/`409`), lobby sync, binary 6-byte input relay, peer disconnect cleanup | `1 / 1` |

---

## 3. End-to-End Real Chromium Browser Verification (`npm run test:e2e`)

- **Command:** `npm run test:e2e` (`tsx tests/e2e/runE2E.ts`)
- **Runtime Environment:** `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` (Playwright Chromium with WebGL enabled via SwiftShader software GL) connected to live `createRoomServer` serving `dist/`.
- **Result:** Passed (`0` console errors, `0` page errors).
- **Verified User Flows:**
  1. **Desktop Full Lifecycle (`1280x720`):**
     - Satire Notice modal (`#legal`) -> Title screen (`#title`) -> Character & Stage Select (`11` netas + `RANDOM` tile verified).
     - Stage switching (`SANSAD`, `JANTAR MANTAR`, `DESI SADAK`) verified visually via screenshots.
     - Live combat start, `Escape` Pause (`CHAI BREAK`), Resume, real keyboard combat driving FT2 match through `Round 1 K.O.` (`0-1`) -> CPU Super (`100 -> 70`) -> `Round 2 K.O.` (`0-2`) -> `matchEnd` Newspaper (`THE KURSI EXPRESS`) -> `REMATCH` -> Pause -> `QUIT TO SELECT`.
     - Measured WebGL RAF frame rate under headless SwiftShader CPU rendering: `21.1 FPS`.
  2. **Mobile Landscape & Orientation (`844x390` touch / `390x844` portrait):**
     - Verified `#touch` virtual thumbstick and `PUNCH` / `KICK` / `GRAB` / `SUPER` diamond controls visible in `844x390` landscape fight HUD without text overlap.
     - Verified `#rotate` landscape instruction overlay renders properly when switched to `390x844` portrait viewport.
  3. **Two-Browser Friend Multiplayer (`Host` + `Guest` Chromium contexts):**
     - Verified 4-char room creation, validation error on bad code (`0000`), successful guest join, host-to-guest `JANTAR MANTAR` stage sync, simultaneous live fight launch with role labels (`HOST` / `YOU`), real-time host input relay, and disconnect notification (`#net-away`) when Guest closes room.
