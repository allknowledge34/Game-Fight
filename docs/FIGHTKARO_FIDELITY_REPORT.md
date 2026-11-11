# FightKaro Visual & Structural Fidelity Report

## 1. Live Reference Inspection Summary

Prior to refactoring the project, the reference production game at `https://fightkaro.com/` was inspected using REA browser capture evidence (`ev_df42dd3d79fae58c4aa3d13f834b1af6b999024b1c12383cd5a74123874fb039` exported to `scratch/rea_combat_bundle.json`), Playwright Chrome capture & stylesheet extraction (`scratch/ref_main.css`, formatted into `scratch/ref_main_pretty.css`), and live visual screenshot comparison (`scratch/screenshots/` & `scratch/ref_screenshots/`).

Observed FightKaro reference specifications retained directly:
- **Screen Architecture**: Legal Satire Notice (`#legal`) → Asset Loading (`#loading`) → Transparent Live-Arena Title (`#title`) → Open-Stage Character & Stage Select (`#select`) → Online Friend Modal (`#online`) → Combat HUD + LIVE Newsdesk (`#hud`, `#newsdesk`) → Borderless Pause Overlay (`#pause`) → Rotated Aged-Cream Result Newspaper (`#result`, `.newspaper`, `.stamp`).
- **Title Presentation**: Two-tone diagonal gradient italic display logo (`SANSAD` in white/gold/amber filter drop-shadow + `SHOWDOWN` in white/sky-blue gradient), pulsing transparent click/Enter prompt (`#title-start-btn.press-btn`), and live slow-orbit camera over the Sansad arena with both selected fighters posed on stage.
- **Select Screen Preservation**: Open central court window displaying full-body 3D fighters flanking the diagonal skewed `VS` emblem, translucent keyboard legend strip at top, left/right bottom corner angled `clip-path` plates (`polygon(0 0, 100% 0, 92% 100%, 0 100%)` for `1P` and `polygon(8% 0, 100% 0, 100% 100%, 0 100%)` for `CPU` / `FINAL BOSS`) with `7px` accent stripes, skewed (`-6deg`) portrait tiles, golden `STAGE` / `CPU` pill selectors, and `PLAY WITH A FRIEND` + `FIGHT!` buttons.

## 2. Stage & Arena Fidelity Upgrades (`src/stages/`)

| Arena Stage | Reference Elements Reconstructed | Implementation File |
|---|---|---|
| **Sansad Bhavan** (`sansad`) | Raised `15.5 × 0.3 × 8` marbled court with 6-layer Diwali Rangoli centerpiece, rim string bulbs, 32 flickering clay diyas, diamond akasha kandil lanterns, 4 sky firework bursts, 144 fluted rotunda columns at `z = -34`, dome & spire, distant India Gate landmark `(22, -0.3, -46)`, twilight indigo-to-saffron sky shader (`StageTheme.sansad`), 6 tricolor flags, walking chaiwala NPC, and 420-fan 5-tier bleacher crowds with placards & boredom smartphones | [`ArenaStage.ts`](../src/stages/ArenaStage.ts), [`stageThemes.ts`](../src/stages/stageThemes.ts) |
| **Jantar Mantar** (`jantar`) | Daytime blue-to-gold sky gradient, concentric engraved brass sundial clock floor texture, monumental 46-step Samrat Yantra gnomon wedge (`ExtrudeGeometry`), twin marble curved quadrant dial arcs, red sandstone drum observatory towers, `"JANTAR MANTAR / जंतर मंतर · NEW DELHI"` heritage board, emerald lawn & garden trees | [`ArenaStage.ts`](../src/stages/ArenaStage.ts), [`stageThemes.ts`](../src/stages/stageThemes.ts) |
| **Desi Sadak** (`road`) | Weather-cracked asphalt street texture with oil puddles, lane markings, and confetti; 2-story storefront buildings with concrete awning ledges and rooftop water tanks; 5 streetlight poles; detailed green & yellow auto-rickshaw (sloped windshield, canopy, headlight, 3 wheels); dual red/blue canopy fruit carts with fruit heaps; resting street dogs | [`ArenaStage.ts`](../src/stages/ArenaStage.ts) |

## 3. Camera, Postprocessing & UI Alignment

- **Camera Framing ([`FightCamera.ts`](../src/rendering/FightCamera.ts))**: Calibrated combat perspective FOV to `42°` (`40°` on Title/Select), combat tracking distance `clamp(3.4 + sep * 0.85, 4.4, 8.5)` with aspect compensation, and gentle orbital Title camera (`sin(clock * 0.25) * 0.32`).
- **Renderer ([`ThreeScene.ts`](../src/rendering/ThreeScene.ts))**: ACES Filmic tone mapping (`toneMappingExposure = 1.12`), stage fog synchronization (`scene.fog = this.arena.fog`), hardware `UnrealBloomPass` (`0.4, 0.4, 1.12`), and automatic software-WebGL detection for reliable cross-environment frame rates.
- **Visual Regression Check**: Desktop (`1280×720`) and mobile landscape (`844×390`) screenshots across Legal, Title, Select (all 3 stages + Boss preview), Active HUD Combat, Super Cinematic, Pause, Result Newspaper, Two-Browser Multiplayer, plus individual BEFORE (`scratch/before_chars/`) and AFTER (`scratch/after_chars/`, including zoomed close-ups and combat views) comparisons of all 7 upgraded fighters were captured via Playwright Chrome and verified cleanly with zero UI/stage/lighting regressions.
