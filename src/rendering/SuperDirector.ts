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

  private buildForCinematic(cin: ActiveCinematic, snap: BattleStateSnapshot): void {
    this.clear();
    const caster = snap.fighters[cin.casterSide];
    const target = snap.fighters[cin.casterSide === 0 ? 1 : 0];
    const dir = caster.facing;

    if (cin.kind === 'budget') {
      // Red Bahi-Khata ledger slab + coins
      const book = new THREE.Mesh(
        new THREE.BoxGeometry(0.95, 1.25, 0.28),
        new THREE.MeshStandardMaterial({ color: 0xb91c1c, emissive: 0x550000, roughness: 0.45 }),
      );
      book.position.set(target.x, 2.8, 0.2);
      book.userData.role = 'drop';
      this.group.add(book);
      this.meshes.push(book);
      return;
    }

    if (cin.kind === 'grapple') {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.85, 0.05, 8, 32),
        new THREE.MeshBasicMaterial({ color: caster.facing > 0 ? 0xff9933 : 0x2e9bff }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set((caster.x + target.x) * 0.5, 0.15, 0);
      ring.userData.role = 'spin';
      this.group.add(ring);
      this.meshes.push(ring);
      return;
    }

    // Distinct signature props for all 11 fighter supers
    switch (cin.fighterId) {
      case 'modi': {
        const chakra = new THREE.Group();
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.7, 0.08, 12, 36),
          new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xff6a00, emissiveIntensity: 1.1 }),
        );
        chakra.add(ring);
        for (let i = 0; i < 8; i++) {
          const ray = new THREE.Mesh(
            new THREE.BoxGeometry(0.08, 1.35, 0.06),
            new THREE.MeshBasicMaterial({ color: 0xffe28a }),
          );
          ray.rotation.z = (i / 8) * Math.PI;
          chakra.add(ray);
        }
        chakra.position.set(caster.x + dir * 0.5, 1.6, 0.1);
        chakra.userData.role = 'projectile';
        this.group.add(chakra);
        this.meshes.push(chakra);
        break;
      }

      case 'rahul': {
        const machine = new THREE.Group();
        const body = new THREE.Mesh(
          new THREE.CylinderGeometry(0.55, 0.65, 1.25, 14),
          new THREE.MeshStandardMaterial({ color: 0x2e9bff, metalness: 0.6, roughness: 0.3 }),
        );
        body.rotation.z = Math.PI / 2;
        const hopper = new THREE.Mesh(
          new THREE.CylinderGeometry(0.42, 0.2, 0.5, 10),
          new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.5 }),
        );
        hopper.position.set(0, 0.72, 0);
        machine.add(body, hopper);
        machine.position.set((caster.x + target.x) * 0.5, 0.75, -0.4);
        machine.userData.role = 'spin';
        this.group.add(machine);
        this.meshes.push(machine);
        break;
      }

      case 'didi': {
        const pot = new THREE.Mesh(
          new THREE.SphereGeometry(0.58, 16, 12, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.7),
          new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.5, side: THREE.DoubleSide }),
        );
        pot.position.set(caster.x + dir * 0.65, 0.6, 0.1);
        const brew = new THREE.Mesh(
          new THREE.CircleGeometry(0.5, 20),
          new THREE.MeshBasicMaterial({ color: 0x3dff7a }),
        );
        brew.rotation.x = -Math.PI / 2;
        brew.position.set(caster.x + dir * 0.65, 0.68, 0.1);
        this.group.add(pot, brew);
        this.meshes.push(pot, brew);
        break;
      }

      case 'trump': {
        const stamp = new THREE.Group();
        const block = new THREE.Mesh(
          new THREE.BoxGeometry(1.3, 0.45, 0.8),
          new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.4 }),
        );
        const handle = new THREE.Mesh(
          new THREE.CylinderGeometry(0.22, 0.28, 0.9, 12),
          new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.7 }),
        );
        handle.position.y = 0.65;
        stamp.add(block, handle);
        stamp.position.set(target.x, 3.2, 0);
        stamp.userData.role = 'drop';
        this.group.add(stamp);
        this.meshes.push(stamp);
        break;
      }

      case 'yogi': {
        const dozer = new THREE.Group();
        const cab = new THREE.Mesh(
          new THREE.BoxGeometry(1.4, 1.2, 1.2),
          new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.45 }),
        );
        cab.position.set(-dir * 0.4, 1.0, 0);
        const bucket = new THREE.Mesh(
          new THREE.BoxGeometry(0.45, 0.85, 1.45),
          new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7 }),
        );
        bucket.position.set(dir * 0.8, 0.55, 0);
        dozer.add(cab, bucket);
        dozer.position.set(caster.x - dir * 2.4, 0, 0);
        dozer.userData.role = 'charge';
        this.group.add(dozer);
        this.meshes.push(dozer);
        break;
      }

      case 'nitin': {
        const hole = new THREE.Mesh(
          new THREE.CircleGeometry(0.9, 24),
          new THREE.MeshBasicMaterial({ color: 0x050507 }),
        );
        hole.rotation.x = -Math.PI / 2;
        hole.position.set(target.x, 0.03, 0);
        this.group.add(hole);
        this.meshes.push(hole);
        break;
      }

      case 'ravi': {
        const clockDial = new THREE.Mesh(
          new THREE.RingGeometry(1.1, 1.45, 36),
          new THREE.MeshBasicMaterial({ color: 0xffd75f, side: THREE.DoubleSide }),
        );
        clockDial.position.set(target.x, 1.65, -0.5);
        clockDial.userData.role = 'spin';
        this.group.add(clockDial);
        this.meshes.push(clockDial);
        break;
      }

      case 'lalu': {
        const train = new THREE.Group();
        const engine = new THREE.Mesh(
          new THREE.BoxGeometry(2.2, 1.25, 1.25),
          new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.5 }),
        );
        engine.position.y = 0.85;
        const lamp = new THREE.Mesh(
          new THREE.SphereGeometry(0.24, 10, 10),
          new THREE.MeshBasicMaterial({ color: 0xfff3a0 }),
        );
        lamp.position.set(dir * 1.15, 0.95, 0);
        train.add(engine, lamp);
        train.position.set(caster.x - dir * 3.8, 0, 0);
        train.userData.role = 'charge';
        this.group.add(train);
        this.meshes.push(train);
        break;
      }

      case 'amit': {
        const knight = new THREE.Mesh(
          new THREE.ConeGeometry(0.65, 1.8, 8),
          new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.85, roughness: 0.25 }),
        );
        knight.position.set(target.x, 3.0, 0);
        knight.userData.role = 'drop';
        this.group.add(knight);
        this.meshes.push(knight);
        break;
      }

      case 'dhruv': {
        const phone = new THREE.Mesh(
          new THREE.BoxGeometry(1.15, 2.1, 0.18),
          new THREE.MeshStandardMaterial({ color: 0x0f172a, emissive: 0x22d3ee, emissiveIntensity: 0.8 }),
        );
        phone.position.set(target.x, 2.8, 0);
        phone.userData.role = 'drop';
        this.group.add(phone);
        this.meshes.push(phone);
        break;
      }

      case 'mbapu': {
        const charkha = new THREE.Mesh(
          new THREE.TorusGeometry(1.25, 0.08, 12, 40),
          new THREE.MeshStandardMaterial({ color: 0xffd75f, emissive: 0xffb700, emissiveIntensity: 1.0 }),
        );
        charkha.position.set(caster.x, 1.65, -0.3);
        charkha.userData.role = 'spin';
        this.group.add(charkha);
        this.meshes.push(charkha);
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

    arena.setMood(cin.kind === 'grapple' ? 0.25 : 0.72);

    for (const m of this.meshes) {
      if (m.userData.role === 'spin') {
        m.rotation.z += dt * 7;
        m.rotation.y += dt * 4;
      } else if (m.userData.role === 'projectile') {
        const startX = caster.x + dir * 0.5;
        m.position.x = startX + (target.x - startX) * Math.min(1, k * 1.3);
        m.rotation.z += dt * 16;
      } else if (m.userData.role === 'drop') {
        const dropK = Math.min(1, Math.max(0, (k - 0.35) / 0.38));
        m.position.y = 3.2 - dropK * 2.45;
      } else if (m.userData.role === 'charge') {
        const startX = caster.x - dir * 3.8;
        m.position.x = startX + (target.x - startX) * Math.min(1, k * 1.32);
      }
    }

    if (cin.damageApplied && !this.impactTriggered) {
      this.impactTriggered = true;
      particles.hitSpark(target.x, 1.35, true, dir);
      particles.shockwave(target.x, 1.1, 0.2, 0xffd23f, 0.35, 3.8, 0.55);
      camera.shake(0.45, 0.5);
    }

    // Dramatic angled camera during supers
    if (cin.kind !== 'grapple') {
      const midX = (caster.x + target.x) * 0.5;
      camera.setCinema(
        new THREE.Vector3(midX - dir * 1.4, 2.0 + Math.sin(k * Math.PI) * 0.4, 4.9),
        new THREE.Vector3(target.x, 1.25, 0),
        4.8,
        40,
        0.08,
      );
    }
  }
}
