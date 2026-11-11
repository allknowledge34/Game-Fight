import * as THREE from 'three';
import type { ActiveCinematic, BattleStateSnapshot } from '../simulation/BattleSimulation';
import type { FightCamera } from './FightCamera';
import type { ParticleSystem } from './ParticleSystem';
import type { ArenaStage } from '../stages/ArenaStage';

export class SuperDirector {
  readonly group = new THREE.Group();
  private activeKey = '';
  private meshes: THREE.Object3D[] = [];
  private impactTriggered = false;

  clear(): void {
    for (const m of this.meshes) {
      this.group.remove(m);
      m.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const mat = obj.material;
          if (Array.isArray(mat)) mat.forEach((mt) => mt.dispose());
          else mat?.dispose();
        }
      });
    }
    this.meshes.length = 0;
    this.activeKey = '';
    this.impactTriggered = false;
  }

  private addProp(obj: THREE.Object3D, role?: string): void {
    if (role) obj.userData.role = role;
    this.group.add(obj);
    this.meshes.push(obj);
  }

  private buildForCinematic(cin: ActiveCinematic, snap: BattleStateSnapshot): void {
    this.clear();
    const caster = snap.fighters[cin.casterSide];
    const target = snap.fighters[cin.casterSide === 0 ? 1 : 0];
    const dir = caster.facing;

    if (cin.kind === 'budget') {
      // Tactical Supply Counter Drop Crate (Anvil & Supply Crate slamming onto Boss)
      const crate = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 1.1, 1.1),
        new THREE.MeshStandardMaterial({ color: 0xb91c1c, emissive: 0x7f1d1d, roughness: 0.4 }),
      );
      const trim = new THREE.Mesh(
        new THREE.BoxGeometry(1.18, 0.2, 1.18),
        new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.8 }),
      );
      crate.add(body, trim);
      crate.position.set(target.x, 3.6, 0);
      this.addProp(crate, 'drop');
      return;
    }

    if (cin.kind === 'grapple') {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.85, 0.05, 8, 32),
        new THREE.MeshBasicMaterial({ color: caster.facing > 0 ? 0xf59e0b : 0x38bdf8 }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set((caster.x + target.x) * 0.5, 0.15, 0);
      this.addProp(ring, 'spin');
      return;
    }

    switch (cin.fighterId) {
      case 'kratos': {
        // Spartan Rage: fiery ground aura + orbiting Blades of Chaos + colossal falling Leviathan Axe
        const rageRing = new THREE.Mesh(
          new THREE.RingGeometry(0.7, 1.25, 32),
          new THREE.MeshBasicMaterial({ color: 0xff4500, side: THREE.DoubleSide }),
        );
        rageRing.rotation.x = -Math.PI / 2;
        rageRing.position.set(caster.x, 0.04, 0);
        this.addProp(rageRing, 'spin');

        const bladesOrbit = new THREE.Group();
        const bladeMat = new THREE.MeshBasicMaterial({ color: 0xff7b2e });
        for (const bx of [-0.95, 0.95]) {
          const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.72, 0.05), bladeMat);
          blade.position.set(bx, 0, 0);
          bladesOrbit.add(blade);
        }
        bladesOrbit.position.set(target.x, 1.25, 0);
        this.addProp(bladesOrbit, 'spin');

        const megaAxe = new THREE.Group();
        const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 10), new THREE.MeshStandardMaterial({ color: 0x5c361e }));
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.85, 0.7), new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.9 }));
        head.position.set(0, -0.8, 0.25);
        megaAxe.add(haft, head);
        megaAxe.position.set(target.x, 3.8, 0);
        this.addProp(megaAxe, 'drop');
        break;
      }

      case 'wukong': {
        // Great Sage: twin golden shadow clones + skyscraper Ruyi Jingu Bang pillar drop
        const cloneMat = new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.65 });
        for (const off of [-0.9, 0.9]) {
          const clone = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.95, 6, 10), cloneMat);
          clone.position.set(target.x + off, 0.95, -0.35);
          this.addProp(clone, 'pulse');
        }
        const giantStaff = new THREE.Group();
        const shaft = new THREE.Mesh(
          new THREE.CylinderGeometry(0.18, 0.18, 3.4, 16),
          new THREE.MeshStandardMaterial({ color: 0xb91c1c, emissive: 0x7f1d1d }),
        );
        const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.5, 16), new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0xf59e0b, emissiveIntensity: 1.1 }));
        capTop.position.y = 1.6;
        const capBot = capTop.clone();
        capBot.position.y = -1.6;
        giantStaff.add(shaft, capTop, capBot);
        giantStaff.position.set(target.x, 4.2, 0);
        this.addProp(giantStaff, 'drop');
        break;
      }

      case 'michael': {
        // Bullet-Time Focus: golden sniper reticle + rapid gold bullet tracer beams
        const reticle = new THREE.Group();
        const ring1 = new THREE.Mesh(new THREE.RingGeometry(0.8, 0.95, 32), new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide }));
        const ring2 = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.42, 24), new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide }));
        const ch = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.05, 0.02), new THREE.MeshBasicMaterial({ color: 0xfef08a }));
        const cv = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.1, 0.02), new THREE.MeshBasicMaterial({ color: 0xfef08a }));
        reticle.add(ring1, ring2, ch, cv);
        reticle.position.set(target.x, 1.32, 0.35);
        this.addProp(reticle, 'spin');

        for (let b = 0; b < 4; b++) {
          const tracer = new THREE.Mesh(
            new THREE.CylinderGeometry(0.03, 0.03, 1.1, 8),
            new THREE.MeshBasicMaterial({ color: 0xfde047 }),
          );
          tracer.rotation.z = Math.PI / 2;
          tracer.position.set(caster.x + dir * (0.6 + b * 0.25), 1.2 + (b - 1.5) * 0.14, 0);
          this.addProp(tracer, 'projectile');
        }
        break;
      }

      case 'spiderman': {
        // Maximum Spider: crisscrossing luminous web beams & cocoon tether sphere
        const webSphere = new THREE.Mesh(
          new THREE.IcosahedronGeometry(0.95, 1),
          new THREE.MeshBasicMaterial({ color: 0xf8fafc, wireframe: true }),
        );
        webSphere.position.set(target.x, 1.25, 0);
        this.addProp(webSphere, 'spin');

        for (let w = 0; w < 6; w++) {
          const strand = new THREE.Mesh(
            new THREE.CylinderGeometry(0.025, 0.025, 3.6, 6),
            new THREE.MeshBasicMaterial({ color: 0xe2e8f0 }),
          );
          strand.rotation.z = (w / 6) * Math.PI;
          strand.position.set(target.x, 1.3, 0.1);
          this.addProp(strand, 'pulse');
        }
        break;
      }

      case 'ironman': {
        // Maximum Pulse Unibeam: expanding chest reactor sphere + blinding cyan plasma cannon cylinder
        const core = new THREE.Mesh(
          new THREE.SphereGeometry(0.36, 16, 16),
          new THREE.MeshBasicMaterial({ color: 0x67e8f9 }),
        );
        core.position.set(caster.x + dir * 0.35, 1.38, 0);
        this.addProp(core, 'pulse');

        const beamLen = Math.max(2.5, Math.abs(target.x - caster.x) + 1.8);
        const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(0.34, 0.44, beamLen, 18),
          new THREE.MeshBasicMaterial({ color: 0x38f2ff, transparent: true, opacity: 0.88 }),
        );
        beam.rotation.z = Math.PI / 2;
        beam.position.set((caster.x + target.x) * 0.5 + dir * 0.3, 1.35, 0);
        this.addProp(beam, 'pulse');
        break;
      }

      case 'thor': {
        // Bifrost Thunderstrike: rainbow Bifrost cylinder column + jagged lightning + Mjolnir sky crash
        const rainbow = [0x38bdf8, 0xa855f7, 0xfacc15];
        rainbow.forEach((col, i) => {
          const cyl = new THREE.Mesh(
            new THREE.CylinderGeometry(0.55 + i * 0.25, 0.65 + i * 0.25, 6.2, 20, 1, true),
            new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
          );
          cyl.position.set(target.x, 3.0, 0);
          this.addProp(cyl, 'spin');
        });
        const mjolnirSky = new THREE.Mesh(
          new THREE.BoxGeometry(0.65, 0.55, 0.95),
          new THREE.MeshStandardMaterial({ color: 0x94a3b8, emissive: 0x60e5ff, emissiveIntensity: 1.4 }),
        );
        mjolnirSky.position.set(target.x, 4.0, 0);
        this.addProp(mjolnirSky, 'drop');
        break;
      }

      case 'steve': {
        // Boss Overworld Apocalypse: obsidian confinement pillars + falling anvil + TNT blocks
        const obsMat = new THREE.MeshStandardMaterial({ color: 0x1e1b2e, emissive: 0x581c87, emissiveIntensity: 0.6 });
        for (const off of [-1.05, 1.05]) {
          const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.45, 2.2, 0.45), obsMat);
          pillar.position.set(target.x + off, 1.1, 0);
          this.addProp(pillar, 'pulse');
        }
        const anvil = new THREE.Group();
        const anvilTop = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.52, 0.8), new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.75 }));
        anvilTop.position.y = 0.25;
        const anvilBase = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.45, 0.65), new THREE.MeshStandardMaterial({ color: 0x1e293b }));
        anvilBase.position.y = -0.25;
        anvil.add(anvilTop, anvilBase);
        anvil.position.set(target.x, 4.1, 0);
        this.addProp(anvil, 'drop');
        break;
      }
    }
  }

  update(
    snap: BattleStateSnapshot,
    camera: FightCamera,
    particles: ParticleSystem,
    arena: ArenaStage,
    dt: number,
  ): void {
    const cin = snap.cinematic;
    if (!cin) {
      if (this.meshes.length > 0) this.clear();
      return;
    }

    const key = `${cin.kind}:${cin.fighterId}:${cin.casterSide}:${snap.round}`;
    if (key !== this.activeKey) {
      this.activeKey = key;
      this.buildForCinematic(cin, snap);
    }

    const k = Math.min(1, cin.elapsed / Math.max(0.01, cin.duration));
    const caster = snap.fighters[cin.casterSide];
    const target = snap.fighters[cin.casterSide === 0 ? 1 : 0];
    const dir = caster.facing;

    arena.setMood(cin.kind === 'grapple' ? 0.25 : 0.75);

    for (const m of this.meshes) {
      if (m.userData.role === 'spin') {
        m.rotation.z += dt * 7;
        m.rotation.y += dt * 5;
      } else if (m.userData.role === 'projectile') {
        const startX = caster.x + dir * 0.5;
        m.position.x = startX + (target.x - startX) * Math.min(1, k * 1.4);
      } else if (m.userData.role === 'drop') {
        const dropK = Math.min(1, Math.max(0, (k - 0.35) / 0.38));
        m.position.y = 3.8 - dropK * 2.85;
      } else if (m.userData.role === 'pulse') {
        const s = 0.92 + Math.sin(cin.elapsed * 20) * 0.12;
        m.scale.setScalar(s);
      }
    }

    if (cin.damageApplied && !this.impactTriggered) {
      this.impactTriggered = true;
      const fxColor = cin.fighterId === 'thor' ? 0x60e5ff : cin.fighterId === 'ironman' ? 0x38f2ff : cin.fighterId === 'steve' ? 0xa855f7 : 0xffd23f;
      particles.hitSpark(target.x, 1.35, true, dir);
      particles.shockwave(target.x, 1.1, 0.2, fxColor, 0.35, 4.2, 0.6);
      camera.shake(0.5, 0.55);
    }

    if (cin.kind !== 'grapple') {
      const midX = (caster.x + target.x) * 0.5;
      camera.setCinema(
        new THREE.Vector3(midX - dir * 1.35, 1.9 + Math.sin(k * Math.PI) * 0.45, 4.6),
        new THREE.Vector3(target.x, 1.2, 0),
        5.0,
        38,
        0.08,
      );
    }
  }
}
