# Test & Verification Results

All build, unit, server integration, asset verification, and headless Google Chrome WebGL/multiplayer E2E suites passed cleanly after the final code & asset edits.

## 1. Production Build (`npm run build`)

- **Command**: `npm run build` (`tsc --noEmit && vite build`)
- **Result**: Exited with code `0` (`911ms` build time, zero TypeScript diagnostics)
- **Output Bundle**:
  - `dist/index.html` (`13.48 kB`)
  - `dist/assets/index-BMN_vUX0.css` (`22.27 kB`)
  - `dist/assets/index-DY7p8qRA.js` (`194.79 kB`)
  - `dist/assets/three-DtY4SR0v.js` (`572.89 kB`)

## 2. Unit & Integration Test Suite (`npm test`)

- **Command**: `npm test` (`vitest run tests/unit tests/integration`)
- **Note on Sandbox**: `tests/integration/room_server.test.ts` opens an HTTP & WebSocket server on `127.0.0.1` and requires unsandboxed local loopback permissions (`BypassSandbox: true`); pure unit and headless battle simulation suites also run cleanly inside the sandbox.
- **Result**: **7 test files passed (`20 / 20` tests passed, `0` failed, `0` skipped)** in `403ms`:
  - `tests/unit/assets_and_config.test.ts` (3 tests): verifies binary GLTF `'glTF'` header + size across all 7 `.glb` models, `RIFF` WAV headers across all 8 announcer and 21 character voice clips, and decoupling of `ROSTER_DISPLAY_CONFIG` / `UI_LABELS_CONFIG`.
  - `tests/unit/fighter_physics.test.ts` (4 tests): jump arc & gravity, `[-6.5, +6.5]` arena clamp, minimum grounded pushbox separation, model-height-scaled crouch hurtboxes.
  - `tests/unit/combat_and_moves.test.ts` (5 tests): standing jab/damage/SHAKTI meter gain, high/mid blocking & non-lethal chip damage, crouch ducking & low sweep guard break, hit-confirm chain combos with scaling, simultaneous grab tech break.
  - `tests/unit/round_and_boss.test.ts` (3 tests): FT2 round tracking/draws/timeover percentages, Boss Steve `200` HP / passive regen / 25% Counter Drop assist, Boss unlock progression.
  - `tests/unit/ai_and_encoding.test.ts` (2 tests): 6-byte binary input pack/unpack determinism & CPU AI approach/cow-jump/super activation.
  - `tests/integration/battle_simulation.test.ts` (2 tests): full lifecycle simulation & execution of all 7 fighter supers without runtime errors, plus snapshot export/restore symmetry.
  - `tests/integration/room_server.test.ts` (1 test): HTTP room creation, lookup, bad room code rejection (`400`/`404`), 3rd-player capacity rejection (`409`), JSON lobby relay, 6-byte binary input relay, and disconnect cleanup.

## 3. Real Chrome WebGL & Multiplayer E2E (`npm run test:e2e`)

- **Command**: `npm run test:e2e` (`tsx tests/e2e/runE2E.ts`, executed with `BypassSandbox: true`)
- **Result**: Exited with code `0` — **`ALL E2E CHECKS PASSED WITH 0 RUNTIME ERRORS`** (`Desktop WebGL FPS: 15.4` under headless SwiftShader CPU WebGL)
- **Observed Checks**:
  - Legal notice → Loading (`preloadFighterModels`) → Title screen (`SANSAD SHOWDOWN`) → Select screen with `8` tiles (`7` fighters + `RANDOM`).
  - Verified active fighter `.glb` load telemetry in live browser WebGL: `{"0":{"id":"kratos","loaded":true,"clips":28},"1":{"id":"wukong","loaded":true,"clips":28}}`.
  - Switched cleanly across Thor/Boss Steve preview, Sansad Bhavan, Jantar Mantar, and Desi Sadak stages (`scratch/e2e_screenshots/e2e_01`..`e2e_11`), plus individual 7-character Before/After/Close-up/Combat gallery captures (`scripts/captureCharGallery.ts`).
  - Executed real keyboard combat through Round 1 KO, Round 2 Super activation & KO (`0-2`), Pause/Resume toggle, Result Newspaper rendering (`#result`), and Rematch flow.
  - Verified Mobile Landscape (`844×390`, touch joystick/buttons) + Portrait rotation warning (`390×844`, `#rotate` visible).
  - Verified Two-Browser (`1280×720` Host + Guest) WebSocket room hosting, invalid-code error handling, lobby stage sync (`jantar`), live combat input synchronization, and disconnect banner handling.
