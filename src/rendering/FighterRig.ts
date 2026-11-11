import * as THREE from 'three';
import type { FighterProfile, FighterSnapshot } from '../core/types';
import { solveFighterPose } from '../animation/PoseSolver';

export class FighterRig {
  readonly profile: FighterProfile;
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly hips = new THREE.Group();
  readonly torso = new THREE.Group();
  readonly chest = new THREE.Group();
  readonly head = new THREE.Group();

  readonly lShoulder = new THREE.Group();
  readonly lElbow = new THREE.Group();
  readonly rShoulder = new THREE.Group();
  readonly rElbow = new THREE.Group();

  readonly lThigh = new THREE.Group();
  readonly lKnee = new THREE.Group();
  readonly lAnkle = new THREE.Group();
  readonly rThigh = new THREE.Group();
  readonly rKnee = new THREE.Group();
  readonly rAnkle = new THREE.Group();

  readonly shadowDisc: THREE.Mesh;
  private auraRing: THREE.Mesh;

  constructor(profile: FighterProfile) {
    this.profile = profile;
    const look = profile.look;

    const skinMat = new THREE.MeshStandardMaterial({ color: look.skin, roughness: 0.65 });
    const topMat = new THREE.MeshStandardMaterial({ color: look.top, roughness: 0.72 });
    const jacketMat = new THREE.MeshStandardMaterial({ color: look.jacket, roughness: 0.68 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: look.pants, roughness: 0.78 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: look.shoes, roughness: 0.55 });
    const hairMat = new THREE.MeshStandardMaterial({ color: look.hair, roughness: 0.8 });
    const beardMat = new THREE.MeshStandardMaterial({ color: look.beard, roughness: 0.85 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x16161a, roughness: 0.35 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    const accentMat = new THREE.MeshStandardMaterial({
      color: profile.accent,
      emissive: profile.accent,
      emissiveIntensity: 0.25,
      roughness: 0.5,
    });

    const scale = profile.modelHeight || look.scale || 1;
    this.body.scale.setScalar(scale);
    this.root.add(this.body);

    // Ground contact shadow + super ready ring
    this.shadowDisc = new THREE.Mesh(
      new THREE.CircleGeometry(0.46, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.36, depthWrite: false }),
    );
    this.shadowDisc.rotation.x = -Math.PI / 2;
    this.shadowDisc.position.y = 0.015;
    this.root.add(this.shadowDisc);

    this.auraRing = new THREE.Mesh(
      new THREE.RingGeometry(0.46, 0.58, 32),
      new THREE.MeshBasicMaterial({
        color: profile.accent,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.auraRing.rotation.x = -Math.PI / 2;
    this.auraRing.position.y = 0.02;
    this.root.add(this.auraRing);

    // Hips at ~0.92m
    this.hips.position.y = 0.92;
    this.body.add(this.hips);

    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.32 * look.belly, 0.16, 0.22), pantsMat);
    pelvis.castShadow = true;
    this.hips.add(pelvis);

    // Lower Kurta flap if traditional attire
    if (look.topStyle === 'kurta-jacket' || look.topStyle === 'sari') {
      const kurtaSkirt = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * look.belly, 0.21 * look.belly, 0.28, 14), topMat);
      kurtaSkirt.position.y = -0.1;
      kurtaSkirt.castShadow = true;
      this.hips.add(kurtaSkirt);
    }

    // Torso
    this.torso.position.y = 0.08;
    this.hips.add(this.torso);

    const abdomen = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * look.belly, 0.17 * look.belly, 0.24, 14), topMat);
    abdomen.position.y = 0.12;
    abdomen.castShadow = true;
    this.torso.add(abdomen);

    this.chest.position.y = 0.24;
    this.torso.add(this.chest);

    const chestMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.19 * look.shoulders, 0.16 * look.belly, 0.3, 14),
      look.topStyle === 'kurta-jacket' ? jacketMat : topMat,
    );
    chestMesh.position.y = 0.14;
    chestMesh.castShadow = true;
    this.chest.add(chestMesh);

    if (look.topStyle === 'sari') {
      const sash = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.34, 0.23), jacketMat);
      sash.position.set(-0.02, 0.14, 0.01);
      sash.rotation.z = 0.35;
      this.chest.add(sash);
    } else if (look.topStyle === 'kurta-jacket') {
      const collar = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.18), topMat);
      collar.position.set(0, 0.29, 0.02);
      this.chest.add(collar);
    }

    // Small party badge / accent pocket square
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.02), accentMat);
    badge.position.set(0.08, 0.18, 0.14);
    this.chest.add(badge);

    // Head (stylized large caricature proportion matching FightKaro silhouette)
    this.head.position.y = 0.34;
    this.chest.add(this.head);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.09, 10), skinMat);
    neck.position.y = 0.02;
    this.head.add(neck);

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.19, 20, 16), skinMat);
    skull.position.y = 0.19;
    skull.scale.set(0.95, 1.08, 1.02);
    skull.castShadow = true;
    this.head.add(skull);

    // Eyes + brows
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8), whiteMat);
      eye.position.set(sx * 0.068, 0.21, 0.168);
      this.head.add(eye);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 8), darkMat);
      pupil.position.set(sx * 0.068, 0.21, 0.186);
      this.head.add(pupil);
      const brow = new THREE.Mesh(
        new THREE.BoxGeometry(0.055, 0.016, 0.02),
        new THREE.MeshStandardMaterial({ color: look.brows, roughness: 0.7 }),
      );
      brow.position.set(sx * 0.068, 0.245, 0.174);
      brow.rotation.z = sx * -0.14;
      this.head.add(brow);
    }

    // Hair styles
    if (look.hairStyle === 'side-part') {
      const topHair = new THREE.Mesh(
        new THREE.SphereGeometry(0.195, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.52),
        hairMat,
      );
      topHair.position.set(0.01, 0.21, -0.01);
      this.head.add(topHair);
    } else if (look.hairStyle === 'bun') {
      const hair = new THREE.Mesh(
        new THREE.SphereGeometry(0.194, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.56),
        hairMat,
      );
      hair.position.set(0, 0.2, -0.01);
      this.head.add(hair);
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), hairMat);
      bun.position.set(0, 0.22, -0.2);
      this.head.add(bun);
    } else {
      // Receding side/back fringe
      const ringHair = new THREE.Mesh(
        new THREE.TorusGeometry(0.16, 0.036, 8, 18, Math.PI * 1.25),
        hairMat,
      );
      ringHair.rotation.x = Math.PI / 2;
      ringHair.rotation.z = -Math.PI * 1.12;
      ringHair.position.set(0, 0.23, -0.02);
      this.head.add(ringHair);
    }

    // Beards
    if (look.beardStyle === 'full-white') {
      const beard = new THREE.Mesh(new THREE.ConeGeometry(0.175, 0.2, 14), beardMat);
      beard.rotation.x = Math.PI;
      beard.position.set(0, 0.07, 0.045);
      this.head.add(beard);
    } else if (look.beardStyle === 'stubble-grey') {
      const jaw = new THREE.Mesh(
        new THREE.SphereGeometry(0.185, 14, 10, 0, Math.PI * 2, Math.PI * 0.52, Math.PI * 0.48),
        beardMat,
      );
      jaw.position.set(0, 0.18, 0.02);
      this.head.add(jaw);
    }

    // Spectacles
    if (look.glasses) {
      const frameMat = new THREE.MeshStandardMaterial({ color: 0x2a2a30, metalness: 0.7, roughness: 0.25 });
      for (const sx of [-1, 1]) {
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.007, 8, 18), frameMat);
        rim.position.set(sx * 0.068, 0.21, 0.19);
        this.head.add(rim);
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.008, 0.01), frameMat);
      bridge.position.set(0, 0.21, 0.19);
      this.head.add(bridge);
    }

    // Arms
    const sleeveMat = look.topStyle === 'kurta-jacket' ? topMat : topMat;
    const buildArm = (shoulder: THREE.Group, elbow: THREE.Group, sideSign: number) => {
      shoulder.position.set(sideSign * 0.22 * look.shoulders, 0.24, 0);
      this.chest.add(shoulder);
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.048, 0.26, 10), sleeveMat);
      upper.position.y = -0.13;
      upper.castShadow = true;
      shoulder.add(upper);

      elbow.position.set(0, -0.26, 0);
      shoulder.add(elbow);
      const forearm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.046, 0.038, 0.24, 10),
        look.topStyle === 'tshirt' ? skinMat : sleeveMat,
      );
      forearm.position.y = -0.12;
      forearm.castShadow = true;
      elbow.add(forearm);

      const fist = new THREE.Mesh(new THREE.SphereGeometry(0.052, 10, 8), skinMat);
      fist.position.y = -0.26;
      elbow.add(fist);
    };
    buildArm(this.lShoulder, this.lElbow, 1);
    buildArm(this.rShoulder, this.rElbow, -1);

    // Legs
    const buildLeg = (thigh: THREE.Group, knee: THREE.Group, ankle: THREE.Group, sideSign: number) => {
      thigh.position.set(sideSign * 0.11, -0.05, 0);
      this.hips.add(thigh);
      const thighMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.06, 0.4, 10), pantsMat);
      thighMesh.position.y = -0.2;
      thighMesh.castShadow = true;
      thigh.add(thighMesh);

      knee.position.set(0, -0.4, 0);
      thigh.add(knee);
      const shinMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.045, 0.4, 10), pantsMat);
      shinMesh.position.y = -0.2;
      shinMesh.castShadow = true;
      knee.add(shinMesh);

      ankle.position.set(0, -0.4, 0);
      knee.add(ankle);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.06, 0.19), shoeMat);
      shoe.position.set(0, -0.025, 0.045);
      shoe.castShadow = true;
      ankle.add(shoe);
    };
    buildLeg(this.lThigh, this.lKnee, this.lAnkle, 1);
    buildLeg(this.rThigh, this.rKnee, this.rAnkle, -1);
  }

  update(snapshot: FighterSnapshot, clock: number): void {
    this.root.position.set(snapshot.x, snapshot.y, 0);
    // Fighters stand along X axis facing +X (yaw +PI/2) or -X (yaw -PI/2)
    this.body.rotation.y = snapshot.facing > 0 ? Math.PI / 2 : -Math.PI / 2;

    const shadowScale = Math.max(0.35, 1 - snapshot.y * 0.28);
    this.shadowDisc.position.y = -snapshot.y + 0.015;
    this.shadowDisc.scale.setScalar(shadowScale);

    // Super aura glow on floor when meter >= 100
    const auraMat = this.auraRing.material as THREE.MeshBasicMaterial;
    if (snapshot.meter >= 100) {
      auraMat.opacity = 0.45 + Math.sin(clock * 8) * 0.25;
      this.auraRing.scale.setScalar(1 + Math.sin(clock * 8) * 0.08);
      this.auraRing.position.y = -snapshot.y + 0.02;
    } else {
      auraMat.opacity = 0;
    }

    const p = solveFighterPose(snapshot, clock);
    this.hips.position.y = 0.92 + p.rootY;
    this.hips.rotation.set(p.hipsF, p.hipsT, 0);
    this.torso.rotation.set(p.spineF, p.spineT, p.spineS);
    this.head.rotation.set(p.headF, p.headT, 0);

    this.lShoulder.rotation.set(-p.lShF, 0, p.lShO);
    this.lElbow.rotation.set(-p.lEl, 0, 0);
    this.rShoulder.rotation.set(-p.rShF, 0, -p.rShO);
    this.rElbow.rotation.set(-p.rEl, 0, 0);

    this.lThigh.rotation.set(p.lThF, 0, p.lThO);
    this.lKnee.rotation.set(p.lKn, 0, 0);
    this.lAnkle.rotation.set(p.lAnk, 0, 0);
    this.rThigh.rotation.set(p.rThF, 0, -p.rThO);
    this.rKnee.rotation.set(p.rKn, 0, 0);
    this.rAnkle.rotation.set(p.rAnk, 0, 0);
  }
}
