import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { FighterId, FighterProfile, FighterSnapshot } from '../core/types';
import { ROSTER_ORDER } from '../characters/roster';

interface CachedGltfAsset {
  scene: THREE.Object3D;
  clips: Map<string, THREE.AnimationClip>;
}

const GLTF_CACHE = new Map<FighterId, CachedGltfAsset>();
const GLTF_PROMISES = new Map<FighterId, Promise<CachedGltfAsset>>();
const LOADER = new GLTFLoader();

export function loadFighterModel(id: FighterId, url: string): Promise<CachedGltfAsset> {
  const cached = GLTF_CACHE.get(id);
  if (cached) return Promise.resolve(cached);

  const pending = GLTF_PROMISES.get(id);
  if (pending) return pending;

  const p = new Promise<CachedGltfAsset>((resolve, reject) => {
    LOADER.load(
      url,
      (gltf: GLTF) => {
        const clips = new Map<string, THREE.AnimationClip>();
        for (const clip of gltf.animations) {
          clips.set(clip.name, clip);
        }
        gltf.scene.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
          }
        });
        const asset = { scene: gltf.scene, clips };
        GLTF_CACHE.set(id, asset);
        resolve(asset);
      },
      undefined,
      (err) => reject(err),
    );
  });

  GLTF_PROMISES.set(id, p);
  return p;
}

export async function preloadFighterModels(
  roster: Record<FighterId, FighterProfile>,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  let done = 0;
  const total = ROSTER_ORDER.length;
  await Promise.all(
    ROSTER_ORDER.map(async (id) => {
      try {
        await loadFighterModel(id, roster[id].modelUrl);
      } catch (err) {
        console.warn(`Failed to preload model for ${id}:`, err);
      } finally {
        done += 1;
        onProgress?.(done / total);
      }
    }),
  );
}

export function getCachedFighterAsset(id: FighterId): CachedGltfAsset | undefined {
  return GLTF_CACHE.get(id);
}

export class FighterRig {
  readonly profile: FighterProfile;
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly shadowDisc: THREE.Mesh;
  private auraRing: THREE.Mesh;
  private bossHalo: THREE.Mesh | null = null;
  private thrusterFlames: THREE.Mesh[] = [];
  private staffOrWeaponBone: THREE.Object3D | null = null;

  private modelInstance: THREE.Object3D | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private clips = new Map<string, THREE.AnimationClip>();
  private actions = new Map<string, THREE.AnimationAction>();
  private currentClipName = '';
  private currentAction: THREE.AnimationAction | null = null;
  private disposed = false;

  constructor(profile: FighterProfile) {
    this.profile = profile;
    this.root.add(this.body);

    // Ground contact shadow + super ready ring
    this.shadowDisc = new THREE.Mesh(
      new THREE.CircleGeometry(0.46, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false }),
    );
    this.shadowDisc.rotation.x = -Math.PI / 2;
    this.shadowDisc.position.y = 0.015;
    this.root.add(this.shadowDisc);

    this.auraRing = new THREE.Mesh(
      new THREE.RingGeometry(0.46, 0.59, 32),
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

    if (profile.isBoss) {
      this.bossHalo = new THREE.Mesh(
        new THREE.TorusGeometry(0.54, 0.03, 10, 28),
        new THREE.MeshBasicMaterial({ color: 0xa855f7, transparent: true, opacity: 0.55 }),
      );
      this.bossHalo.rotation.x = Math.PI / 2;
      this.bossHalo.position.y = 0.06;
      this.root.add(this.bossHalo);
    }

    if (profile.id === 'ironman') {
      const fGeo = new THREE.ConeGeometry(0.055, 0.24, 10);
      const fMat = new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.8 });
      for (const sx of [-0.11, 0.11]) {
        const cone = new THREE.Mesh(fGeo, fMat);
        cone.rotation.x = Math.PI;
        cone.position.set(sx, 0.05, -0.05);
        cone.visible = false;
        this.body.add(cone);
        this.thrusterFlames.push(cone);
      }
    }

    const cached = GLTF_CACHE.get(profile.id);
    if (cached) {
      this.attachAsset(cached);
    } else {
      void loadFighterModel(profile.id, profile.modelUrl)
        .then((asset) => {
          if (!this.disposed) this.attachAsset(asset);
        })
        .catch((err) => {
          console.error(`Model load failed for ${profile.id}:`, err);
        });
    }
  }

  private attachAsset(asset: CachedGltfAsset): void {
    if (this.modelInstance) {
      this.body.remove(this.modelInstance);
    }
    const clone = SkeletonUtils.clone(asset.scene);
    clone.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
      if (obj.name === 'WeaponR') {
        this.staffOrWeaponBone = obj;
      }
    });
    this.modelInstance = clone;
    this.body.add(clone);

    this.clips = asset.clips;
    this.mixer = new THREE.AnimationMixer(clone);
    this.actions.clear();
    for (const [name, clip] of this.clips) {
      this.actions.set(name, this.mixer.clipAction(clip));
    }
    this.playClip('idle', true, 0);
  }

  private resolveClipName(snapshot: FighterSnapshot): string {
    if (snapshot.state === 'attack' || (snapshot.state === 'jump' && snapshot.attack)) {
      if (snapshot.attack && this.clips.has(snapshot.attack.moveId)) {
        return snapshot.attack.moveId;
      }
    }
    if (this.clips.has(snapshot.state)) return snapshot.state;
    return 'idle';
  }

  private playClip(clipName: string, loop: boolean, exactTimeSec?: number): void {
    if (!this.mixer) return;
    const action = this.actions.get(clipName) ?? this.actions.get('idle');
    if (!action) return;

    const changed = this.currentClipName !== clipName;
    if (changed) {
      const prev = this.currentAction;
      this.currentClipName = clipName;
      this.currentAction = action;
      action.reset();
      action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
      action.clampWhenFinished = !loop;
      action.enabled = true;
      action.play();
      if (prev && prev !== action) {
        prev.crossFadeTo(action, loop ? 0.1 : 0.05, false);
      }
    }

    if (exactTimeSec !== undefined) {
      action.time = Math.min(action.getClip().duration - 0.001, Math.max(0, exactTimeSec));
      this.mixer.update(0);
    }
  }

  get hasLoadedModel(): boolean {
    return this.modelInstance !== null;
  }

  get loadedClipCount(): number {
    return this.clips.size;
  }

  update(snapshot: FighterSnapshot, clock: number, dt = 1 / 60): void {
    this.root.position.set(snapshot.x, snapshot.y, 0);
    this.body.rotation.y = snapshot.facing > 0 ? Math.PI / 2 : -Math.PI / 2;

    const shadowScale = Math.max(0.35, 1 - snapshot.y * 0.28);
    this.shadowDisc.position.y = -snapshot.y + 0.015;
    this.shadowDisc.scale.setScalar(shadowScale);

    const auraMat = this.auraRing.material as THREE.MeshBasicMaterial;
    if (snapshot.meter >= 100) {
      auraMat.opacity = 0.55 + Math.sin(clock * 8) * 0.25;
      this.auraRing.scale.setScalar(1.02 + Math.sin(clock * 8) * 0.09);
      this.auraRing.position.y = -snapshot.y + 0.02;
    } else {
      auraMat.opacity = 0;
    }

    if (this.bossHalo) {
      this.bossHalo.rotation.z = clock * 1.4;
      this.bossHalo.position.y = -snapshot.y + 0.04;
      this.bossHalo.scale.setScalar(0.96 + Math.sin(clock * 5) * 0.05);
    }

    if (this.thrusterFlames.length > 0) {
      const flying = !snapshot.grounded || snapshot.state === 'super' || snapshot.state === 'victory';
      for (const f of this.thrusterFlames) {
        f.visible = flying;
        if (flying) {
          f.scale.setScalar(0.85 + Math.sin(clock * 32) * 0.25);
        }
      }
    }

    // Wukong Ruyi Jingu Bang extends during specials & super!
    if (this.staffOrWeaponBone && snapshot.id === 'wukong') {
      const extending =
        snapshot.state === 'super' ||
        snapshot.attack?.moveId === 'special1' ||
        snapshot.attack?.moveId === 'finisher';
      const targetScale = extending ? 1.85 : 1.0;
      this.staffOrWeaponBone.scale.lerp(new THREE.Vector3(1, 1, targetScale), 0.28);
    }

    if (!this.mixer) return;

    const clipName = this.resolveClipName(snapshot);
    const isLoop =
      clipName === 'idle' ||
      clipName === 'walkFwd' ||
      clipName === 'walkBack' ||
      clipName === 'crouch' ||
      clipName === 'intro' ||
      clipName === 'victory' ||
      clipName === 'frozen';

    if (snapshot.attack && clipName === snapshot.attack.moveId) {
      this.playClip(clipName, false, snapshot.attack.frame / 60);
    } else {
      this.playClip(clipName, isLoop);
      if (isLoop || clipName === 'knockdown' || clipName === 'ko' || clipName === 'getup' || clipName === 'super') {
        this.mixer.update(dt);
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    this.mixer?.stopAllAction();
  }
}
