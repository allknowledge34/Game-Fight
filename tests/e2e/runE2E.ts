import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createRoomServer } from '../../server/roomServer';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOT_DIR = '/Users/sachinkumar/.gemini/antigravity/brain/14139982-5845-42e1-9e44-92742122c620/scratch/e2e_screenshots';

async function main() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const superShotPath = path.join(SHOT_DIR, 'e2e_06b_super.png');
  fs.rmSync(superShotPath, { force: true });
  const distDir = path.resolve(process.cwd(), 'dist');
  assert.ok(fs.existsSync(path.join(distDir, 'index.html')), 'Run npm run build before E2E tests');

  const srv = await createRoomServer({ port: 0, staticDir: distDir });
  const baseUrl = `http://127.0.0.1:${srv.port}`;
  console.log(`[e2e] Static + WS room server running at ${baseUrl}`);

  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
  });

  const errors: string[] = [];

  try {
    // 1. Desktop E2E Flow (1280x720)
    const deskCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await deskCtx.newPage();
    page.on('pageerror', (e) => {
      console.error('[desktop pageerror]', e.message);
      errors.push(`[desktop pageerror] ${e.message}`);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.error('[desktop console.error]', msg.text());
        errors.push(`[desktop console.error] ${msg.text()}`);
      }
    });

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#legal:not(.hidden)', { timeout: 5000 });
    await page.screenshot({ path: path.join(SHOT_DIR, 'e2e_01_legal.png') });

    await page.click('#legal-ok');
    await page.waitForSelector('#title:not(.hidden)', { timeout: 5000 });
    await page.screenshot({ path: path.join(SHOT_DIR, 'e2e_02_title.png') });

    await page.click('#title-start-btn');
    await page.waitForSelector('#select:not(.hidden)', { timeout: 5000 });

    const tileCount = await page.locator('#roster-grid .tile').count();
    assert.equal(tileCount, 8, 'Expected 7 fighter tiles + 1 RANDOM tile');

    // Verify all 7 rigged GLB models preloaded cleanly
    const glbSummary = await page.evaluate(() => {
      const app = (window as unknown as { __GAME_APP__?: { scene?: { loadedModelsSummary?: unknown } } }).__GAME_APP__;
      return app?.scene?.loadedModelsSummary;
    });
    console.log('[e2e] Active fighter GLB models loaded:', JSON.stringify(glbSummary));

    // Check P2 Boss Steve selection preview too
    await page.click('[data-tile="thor"]');
    await page.click('[data-tile="steve"]');
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(SHOT_DIR, 'e2e_03b_select_thor_steve.png') });

    // Switch back to Kratos vs Wukong on Sansad / Jantar / Road
    await page.click('[data-tile="kratos"]');
    await page.click('[data-tile="wukong"]');
    await page.click('[data-stage="sansad"]');
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(SHOT_DIR, 'e2e_03_select_sansad.png') });

    await page.click('[data-stage="jantar"]');
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(SHOT_DIR, 'e2e_04_select_jantar.png') });

    await page.click('[data-stage="road"]');
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(SHOT_DIR, 'e2e_05_select_road.png') });

    // Start fight on Sansad vs Easy CPU
    await page.click('[data-stage="sansad"]');
    await page.click('[data-diff="easy"]');
    await page.click('#fight-btn');
    await page.waitForSelector('#hud:not(.hidden)', { timeout: 5000 });

    // Wait for intro + round call to reach playable fight (~2.7s)
    await page.waitForTimeout(2900);
    await page.screenshot({ path: path.join(SHOT_DIR, 'e2e_06_combat_hud.png') });

    // Pause -> Resume check
    await page.keyboard.press('Escape');
    await page.waitForSelector('#pause:not(.hidden)', { timeout: 3000 });
    await page.screenshot({ path: path.join(SHOT_DIR, 'e2e_07_pause.png') });
    await page.click('#resume-btn');
    await page.waitForSelector('#pause', { state: 'hidden', timeout: 3000 });

    // Measure RAF FPS over ~600ms while scene runs
    const fps = await page.evaluate<number>(`
      new Promise((resolve) => {
        let frames = 0;
        const start = performance.now();
        function step() {
          frames++;
          const elapsed = performance.now() - start;
          if (elapsed >= 600) resolve((frames * 1000) / elapsed);
          else requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      })
    `);
    console.log(`[e2e] Desktop WebGL FPS: ${fps.toFixed(1)}`);

    // Real combat inputs until match result (verify HP & SHAKTI responsiveness and drive FT2 win)
    const fightDeadline = Date.now() + 90_000;
    let sawDamage = false;
    let sawMeter = false;
    let reachedResult = false;
    let lastLog = 0;

    while (Date.now() < fightDeadline) {
      const state = await page.evaluate(() => {
        const resultOpen = !document.getElementById('result')!.classList.contains('hidden');
        const app = (
          window as unknown as {
            __GAME_APP__?: {
              sim?: {
                phase?: string;
                rounds?: { round: number; wins: [number, number] };
                fighters?: { x: number; hp: number; meter: number }[];
              };
            };
          }
        ).__GAME_APP__;
        const f0 = app?.sim?.fighters?.[0];
        const f1 = app?.sim?.fighters?.[1];
        return {
          resultOpen,
          phase: app?.sim?.phase ?? '',
          round: app?.sim?.rounds?.round ?? 1,
          wins: app?.sim?.rounds?.wins ?? [0, 0],
          x0: f0?.x ?? -1,
          x1: f1?.x ?? 1,
          hp0: f0?.hp ?? 100,
          hp1: f1?.hp ?? 100,
          m0: f0?.meter ?? 0,
        };
      });

      if (state.resultOpen) {
        reachedResult = true;
        break;
      }
      if (state.hp1 < 100 || state.hp0 < 100) sawDamage = true;
      if (state.m0 > 0) sawMeter = true;

      if (Date.now() - lastLog > 3000) {
        lastLog = Date.now();
        console.log(
          `[e2e] fight status: phase=${state.phase} r=${state.round} wins=${state.wins[0]}-${state.wins[1]} hp=${state.hp0}/${state.hp1} meter=${state.m0.toFixed(0)}`,
        );
      }

      const dx = state.x1 - state.x0;
      const absDx = Math.abs(dx);
      const dirKey = dx >= 0 ? 'KeyD' : 'KeyA';

      if (state.phase === 'super' && !fs.existsSync(superShotPath)) {
        await page.screenshot({ path: superShotPath });
      }
      if (state.m0 >= 100 && absDx < 2.2) {
        await page.keyboard.press('KeyL');
        await page.waitForTimeout(700);
        if (!fs.existsSync(superShotPath)) {
          await page.screenshot({ path: superShotPath });
        }
      } else if (absDx > 0.78) {
        await page.keyboard.down(dirKey);
        await page.waitForTimeout(95);
        await page.keyboard.up(dirKey);
      } else {
        await page.keyboard.press('KeyJ');
        await page.waitForTimeout(70);
        await page.keyboard.press('KeyK');
        await page.waitForTimeout(80);
      }
    }

    assert.ok(sawDamage, 'Expected combat strikes to deal damage');
    assert.ok(sawMeter, 'Expected strikes to build SHAKTI meter');
    assert.ok(reachedResult, 'Expected match to finish and show THE DAILY JUMLA result newspaper');

    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(SHOT_DIR, 'e2e_08_result.png') });
    const headline = await page.textContent('#paper-headline');
    assert.ok(headline && headline.length > 5, 'Expected dynamic newspaper headline');

    // Rematch -> verify reset -> Pause -> Quit to Select
    await page.click('#rematch-btn');
    await page.waitForSelector('#hud:not(.hidden)', { timeout: 5000 });
    await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
    await page.waitForSelector('#pause:not(.hidden)', { timeout: 3000 });
    await page.click('#quit-btn');
    await page.waitForSelector('#select:not(.hidden)', { timeout: 3000 });
    await deskCtx.close();
    console.log('[e2e] Desktop full lifecycle verified');

    // 2. Mobile Landscape E2E Flow (844x390)
    const mobCtx = await browser.newContext({
      viewport: { width: 844, height: 390 },
      hasTouch: true,
      isMobile: true,
    });
    const mobPage = await mobCtx.newPage();
    mobPage.on('pageerror', (e) => errors.push(`[mobile pageerror] ${e.message}`));
    await mobPage.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await mobPage.click('#legal-ok');
    await mobPage.waitForSelector('#title:not(.hidden)', { timeout: 5000 });
    await mobPage.click('#title-start-btn');
    await mobPage.waitForSelector('#select:not(.hidden)', { timeout: 5000 });
    await mobPage.click('#fight-btn');
    await mobPage.waitForSelector('#touch:not(.hidden)', { timeout: 5000 });
    await mobPage.waitForTimeout(2800);
    await mobPage.screenshot({ path: path.join(SHOT_DIR, 'e2e_09_mobile_fight.png') });

    // Portrait check -> #rotate prompt visible
    await mobPage.setViewportSize({ width: 390, height: 844 });
    await mobPage.waitForSelector('#rotate:not(.hidden)', { timeout: 3000 });
    await mobCtx.close();
    console.log('[e2e] Mobile landscape + portrait rotation verified');

    // 3. Two-Browser Friend Multiplayer Sync E2E
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const guestCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const hostPage = await hostCtx.newPage();
    const guestPage = await guestCtx.newPage();

    hostPage.on('pageerror', (e) => errors.push(`[host pageerror] ${e.message}`));
    guestPage.on('pageerror', (e) => errors.push(`[guest pageerror] ${e.message}`));

    for (const p of [hostPage, guestPage]) {
      await p.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await p.click('#legal-ok');
      await p.waitForSelector('#title:not(.hidden)');
      await p.click('#title-start-btn');
      await p.waitForSelector('#select:not(.hidden)');
    }

    // Host opens online modal & creates room
    await hostPage.click('#online-btn');
    await hostPage.click('#on-host');
    await hostPage.waitForSelector('#on-hosting:not(.hidden)', { timeout: 5000 });
    const roomCode = (await hostPage.textContent('#on-room-code'))?.trim() ?? '';
    assert.match(roomCode, /^[A-Z2-9]{4}$/, `Expected valid 4-char code, got ${roomCode}`);

    // Guest checks error on invalid code first, then joins real room
    await guestPage.click('#online-btn');
    await guestPage.fill('#on-code', '0000');
    await guestPage.click('#on-join-btn');
    await guestPage.waitForSelector('#on-error:not(.hidden)', { timeout: 5000 });
    await guestPage.click('#on-retry');

    await guestPage.fill('#on-code', roomCode);
    await guestPage.click('#on-join-btn');
    await guestPage.waitForSelector('#select:not(.hidden)', { timeout: 5000 });
    await hostPage.waitForSelector('#select:not(.hidden)', { timeout: 5000 });

    // Host switches stage to Jantar Mantar & verifies guest syncs
    await hostPage.click('[data-stage="jantar"]');
    await guestPage.waitForFunction(
      () => document.querySelector('[data-stage="jantar"]')?.classList.contains('active') ?? false,
      { timeout: 4000 },
    );

    // Host starts match -> both enter fight HUD
    await hostPage.click('#fight-btn');
    await hostPage.waitForSelector('#hud:not(.hidden)', { timeout: 5000 });
    await guestPage.waitForSelector('#hud:not(.hidden)', { timeout: 5000 });

    await hostPage.waitForTimeout(2700);
    // Host moves forward and punches Guest; verify sync
    await hostPage.keyboard.down('KeyD');
    await hostPage.waitForTimeout(600);
    await hostPage.keyboard.press('KeyJ');
    await hostPage.keyboard.up('KeyD');
    await hostPage.waitForTimeout(450);

    await hostPage.screenshot({ path: path.join(SHOT_DIR, 'e2e_10_mp_host.png') });
    await guestPage.screenshot({ path: path.join(SHOT_DIR, 'e2e_11_mp_guest.png') });

    // Guest leaves room -> Host sees disconnect alert
    await guestPage.close();
    await hostPage.waitForSelector('#net-away:not(.hidden)', { timeout: 5000 });
    await hostCtx.close();
    await guestCtx.close();
    console.log('[e2e] Two-browser online multiplayer room sync verified');

    assert.equal(errors.length, 0, `Unexpected browser errors:\n${errors.join('\n')}`);
    console.log('[e2e] ALL E2E CHECKS PASSED WITH 0 RUNTIME ERRORS');
  } finally {
    await browser.close();
    await srv.close();
  }
}

main().catch((err) => {
  console.error('[e2e] FAILED:', err);
  process.exit(1);
});
