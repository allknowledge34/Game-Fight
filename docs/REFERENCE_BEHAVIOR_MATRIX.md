# Reference Behavior Matrix

Side-by-side comparison of every observable reference behavior (`https://fightkaro.com/`) and our clean-room reconstruction implementation target.

| Feature / Subsystem | Reference Observed Behavior | Target Implementation Module | Status / Verification Plan |
| :--- | :--- | :--- | :--- |
| **Satire Notice (`#legal`)** | Modal dialog on first load (`localStorage sansad-showdown:legal-v1`); blocks input until accepted | `src/ui/ScreenManager.ts`, `index.html` | E2E desktop & mobile boot test |
| **Pre-warm Loading (`#loading`)** | Progress bar over live Sansad 3D scene while assets/shaders initialize | `src/game/GameApp.ts`, `src/ui/ScreenManager.ts` | Automated boot transition check |
| **Title Screen (`#title`)** | Logo `SANSAD SHOWDOWN`, tagline, Enter/Click/Tap start, footer notice | `src/ui/ScreenManager.ts` | E2E title -> select transition |
| **Character Select (`#select`)** | 11 netas + Boss lock/unlock + Random; P1/P2 plates, 3D VS preview, Stage (`sansad`/`jantar`/`road`), CPU (`easy`/`normal`/`hard`), keyboard & click shortcuts | `src/ui/SelectController.ts`, `src/characters/roster.ts` | Unit + E2E stage/fighter/diff test |
| **Friend Multiplayer (`#online`)** | 4-char unambiguous code (`ABCDEFGHJKMNPQRSTUVWXYZ23456789`), Create/Join/Error/Away states, synced picks/options/inputs/timer | `server/index.ts`, `src/multiplayer/NetClient.ts` | Integration + 2-client E2E room sync test |
| **Fixed 60 Hz Physics & Collision** | `1/60s` tick, gravity `24`, wall bounds `±6.5`, min separation `0.72`, standing `1.85` / crouch `0.62`, hurtbox/hitbox checks | `src/physics/FighterController.ts`, `src/collision/CombatCollision.ts` | Comprehensive Vitest unit specs |
| **Strike Chains, Blocks & Grabs** | `jab/cross/kick/uppercut/roundhouse/finisher/lowJab/sweep/special1/special2/airPunch/airKick/grab`, chip damage `0.15x`, counter `1.2x`, combo scaling | `src/combat/moves.ts`, `src/combat/CombatResolver.ts` | Unit tests for damage, scaling, stun, cancel, grab |
| **SHAKTI Super Moves (All 11)** | `100` meter unlocks unstoppable signature 3D cinematic (`30%` damage) for all 11 fighters | `src/combat/supers/*.ts` | Unit + integration trigger + visual check |
| **Nirmala Budget vs Boss** | `B` / Budget button when meter full against `mbapu` Boss (`15s` recharge, `25%` damage assist slam) | `src/combat/supers/BudgetAssist.ts`, `src/game/BattleCoordinator.ts` | Unit + Boss fight verification |
| **Stage Hazards & Crowd** | Cow stampede (`cow`), Mithai heal (`mithai`), Sutli bomb (`bomb`), Chaiwala walk-by, Boredom phones/samosas & reactive crowd placards | `src/stages/StageManager.ts`, `src/game/HazardsController.ts` | Integration hazard lifecycle test |
| **3D Stages & Diwali Mode** | `sansad` (+ Diwali diyas/rangoli/lanterns/fireworks), `jantar` (observatory monuments), `road` (Desi Sadak street market) | `src/stages/SansadStage.ts`, `JantarStage.ts`, `RoadStage.ts` | Visual screenshot check on all 3 stages |
| **LIVE Newsdesk & Ticker** | Dual anchor portraits (`Shor Sharma`, `Tweety Trollwala`) reacting to KOs/hits/supers/boredom + scrolling breaking ticker | `src/ui/NewsdeskController.ts` | Runtime DOM update check |
| **Pause Menu (`#pause`)** | `Esc` / `[II]` opens `CHAI BREAK`, freezes simulation/audio, offers `RESUME`, `SOUND: ON/OFF`, `QUIT TO SELECT` | `src/game/BattleCoordinator.ts`, `src/ui/ScreenManager.ts` | E2E pause/resume/quit check |
| **Newspaper Result (`#result`)** | `THE DAILY JUMLA` front page, headline, winner stamp, excuse, canvas photo snapshot, `REMATCH` & `CHARACTER SELECT` | `src/ui/ResultController.ts` | E2E KO -> result -> rematch & select checks |
| **Mobile Touch HUD (`#touch`)** | Virtual left joystick + right diamond combat buttons (`PUNCH`, `KICK`, `GRAB`, `SUPER`, `BUDGET`) + portrait rotate overlay | `src/input/InputManager.ts`, `src/styles/game.css` | E2E `844x390` touch input check |
| **Web Audio Synthesis & Mix** | Unlocked on user gesture, compressor limiter, SFX polyphony cap, battle/menu procedural music loops, mute persistence | `src/audio/AudioEngine.ts` | Unit mixer/state test + browser audio verification |
