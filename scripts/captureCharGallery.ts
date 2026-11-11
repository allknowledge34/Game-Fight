import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createRoomServer } from '../server/roomServer';

const PHASE = process.argv.includes('--phase=after') ? 'after' : 'before';
const OUT_DIR = `/Users/sachinkumar/.gemini/antigravity/brain/14139982-5845-42e1-9e44-92742122c620/scratch/${PHASE}_chars`;

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const srv = await createRoomServer({ port: 0, staticDir: path.resolve(process.cwd(), 'dist') });
  const url = `http://127.0.0.1:${srv.port}`;
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.click('#legal-ok');
  await page.waitForSelector('#title:not(.hidden)', { timeout: 10000 });
  await page.click('#title-start-btn');
  await page.waitForSelector('#select:not(.hidden)', { timeout: 8000 });

  // Preview each character on P1 (and Steve/Kratos on P2)
  const chars = ['kratos', 'wukong', 'michael', 'spiderman', 'ironman', 'thor', 'steve'];
  for (const id of chars) {
    await page.evaluate((fid) => {
      const app = (window as unknown as { __GAME_APP__?: { select: { p1: string; p2: string; bapuUnlocked: boolean; refresh(): void }; syncPreviewSimulation(): void } }).__GAME_APP__;
      if (app) {
        app.select.bapuUnlocked = true;
        app.select.p1 = fid;
        app.select.p2 = fid === 'steve' ? 'kratos' : 'steve';
        app.select.refresh();
        app.syncPreviewSimulation();
      }
    }, id);
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(OUT_DIR, `${PHASE}_${id}.png`) });
    console.log(`Captured ${PHASE} screenshot for`, id);
  }

  // Also capture zoomed-in studio inspection + active combat check when phase=after
  if (PHASE === 'after') {
    await page.evaluate(() => {
      const app = (window as unknown as { __GAME_APP__?: { scene: { cameraCtrl: { update: unknown } } } }).__GAME_APP__;
      (window as unknown as { __ORIG_CAM_UPDATE__?: unknown }).__ORIG_CAM_UPDATE__ = app?.scene.cameraCtrl.update;
    });

    for (const id of chars) {
      await page.evaluate((fid) => {
        const app = (window as unknown as {
          __GAME_APP__?: {
            select: { p1: string; p2: string; bapuUnlocked: boolean; refresh(): void };
            syncPreviewSimulation(): void;
            scene: {
              cameraCtrl: {
                update: (...args: unknown[]) => void;
                camera: { position: { set(x: number, y: number, z: number): void }; lookAt(x: number, y: number, z: number): void };
              };
            };
          };
        }).__GAME_APP__;
        if (app) {
          app.select.p1 = fid;
          app.select.p2 = fid === 'steve' ? 'kratos' : 'steve';
          app.select.refresh();
          app.syncPreviewSimulation();
          app.scene.cameraCtrl.update = () => {};
          app.scene.cameraCtrl.camera.position.set(-0.32, 1.38, 2.05);
          app.scene.cameraCtrl.camera.lookAt(-1.22, 1.18, 0);
        }
      }, id);
      await page.waitForTimeout(260);
      await page.screenshot({ path: path.join(OUT_DIR, `closeup_${id}.png`) });
    }

    await page.evaluate(() => {
      const app = (window as unknown as { __GAME_APP__?: { scene: { cameraCtrl: { update: unknown } } } }).__GAME_APP__;
      const orig = (window as unknown as { __ORIG_CAM_UPDATE__?: unknown }).__ORIG_CAM_UPDATE__;
      if (app && orig) app.scene.cameraCtrl.update = orig;
    });

    // Active Combat checks: verify models animate cleanly during active fights with HUD & camera preserved
    for (const [p1, p2] of [
      ['kratos', 'wukong'],
      ['ironman', 'thor'],
      ['spiderman', 'michael'],
    ] as const) {
      await page.evaluate(
        ([a, b]) => {
          const app = (window as unknown as {
            __GAME_APP__?: {
              select: { p1: string; p2: string; refresh(): void };
              syncPreviewSimulation(): void;
            };
          }).__GAME_APP__;
          if (app) {
            app.select.p1 = a;
            app.select.p2 = b;
            app.select.refresh();
            app.syncPreviewSimulation();
          }
        },
        [p1, p2],
      );
      await page.click('#fight-btn');
      await page.waitForSelector('#hud:not(.hidden)', { timeout: 6000 });
      await page.waitForTimeout(1600);
      await page.keyboard.press('KeyJ');
      await page.waitForTimeout(180);
      await page.screenshot({ path: path.join(OUT_DIR, `combat_${p1}_vs_${p2}.png`) });
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#title:not(.hidden)', { timeout: 8000 });
      await page.click('#title-start-btn');
      await page.waitForSelector('#select:not(.hidden)', { timeout: 6000 });
    }
  }
  await browser.close();
  await srv.close();
}

void main();
