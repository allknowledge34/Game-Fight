import * as THREE from 'three';

const MAX_PARTICLES = 2400;

interface ParticleSlot {
  active: boolean;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  gravity: number;
  drag: number;
}

interface ShockwaveRing {
  mesh: THREE.Mesh;
  age: number;
  duration: number;
  startScale: number;
  endScale: number;
}

export class ParticleSystem {
  readonly group = new THREE.Group();
  private readonly points: THREE.Points;
  private readonly positions = new Float32Array(MAX_PARTICLES * 3);
  private readonly colors = new Float32Array(MAX_PARTICLES * 3);
  private readonly sizes = new Float32Array(MAX_PARTICLES);
  private readonly alphas = new Float32Array(MAX_PARTICLES);
  private readonly slots: ParticleSlot[] = [];
  private cursor = 0;
  private readonly rings: ShockwaveRing[] = [];
  private readonly tmpColor = new THREE.Color();

  constructor() {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.slots.push({ active: false, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, gravity: 0, drag: 1 });
      this.alphas[i] = 0;
      this.sizes[i] = 0;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 300 } },
      vertexShader: `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aAlpha;
        varying vec3 vColor;
        varying float vAlpha;
        uniform float uScale;
        void main() {
          vColor = aColor;
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(aSize * (uScale / max(0.5, -mv.z)), 1.0, 96.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          if (vAlpha <= 0.005) discard;
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          float soft = pow(max(0.0, 1.0 - d * 2.0), 1.6);
          gl_FragColor = vec4(vColor, soft * vAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.group.add(this.points);
  }

  emit(
    origin: THREE.Vector3,
    opts: {
      count?: number;
      speed?: number;
      color?: number | string;
      life?: number;
      size?: number;
      gravity?: number;
      drag?: number;
      dirX?: number;
      spread?: number;
    } = {},
  ): void {
    const count = opts.count ?? 20;
    const speed = opts.speed ?? 4;
    const life = opts.life ?? 0.55;
    const size = opts.size ?? 0.25;
    const gravity = opts.gravity ?? 8;
    const drag = opts.drag ?? 1.5;
    const spread = opts.spread ?? 1.0;

    this.tmpColor.set(opts.color ?? 0xffcc44);

    for (let i = 0; i < count; i++) {
      const idx = this.cursor;
      this.cursor = (this.cursor + 1) % MAX_PARTICLES;

      const s = this.slots[idx];
      s.active = true;
      s.maxLife = life * (0.7 + Math.random() * 0.6);
      s.life = s.maxLife;
      s.gravity = gravity;
      s.drag = drag;

      const theta = Math.random() * Math.PI * 2;
      const spd = speed * (0.4 + Math.random() * 0.8);
      s.vx = (opts.dirX ?? 0) * speed * 0.6 + Math.cos(theta) * spd * spread;
      s.vy = (Math.random() - 0.15) * spd;
      s.vz = Math.sin(theta) * spd * 0.45 * spread;

      const p3 = idx * 3;
      this.positions[p3] = origin.x;
      this.positions[p3 + 1] = origin.y;
      this.positions[p3 + 2] = origin.z;

      this.colors[p3] = this.tmpColor.r;
      this.colors[p3 + 1] = this.tmpColor.g;
      this.colors[p3 + 2] = this.tmpColor.b;

      this.sizes[idx] = size * (0.7 + Math.random() * 0.6);
      this.alphas[idx] = 1;
    }
  }

  hitSpark(x: number, y: number, heavy = false, dir = 1): void {
    this.emit(new THREE.Vector3(x, y, 0.15), {
      count: heavy ? 42 : 22,
      speed: heavy ? 6.5 : 4.2,
      color: heavy ? 0xffb830 : 0xfff0b0,
      life: heavy ? 0.48 : 0.32,
      size: heavy ? 0.32 : 0.22,
      gravity: 6,
      dirX: dir,
      spread: 0.9,
    });
    if (heavy) {
      this.shockwave(x, y, 0.15, 0xff9f38, 0.25, 1.5);
    }
  }

  blockSpark(x: number, y: number): void {
    this.emit(new THREE.Vector3(x, y, 0.15), {
      count: 14,
      speed: 3.5,
      color: 0x7ab8ff,
      life: 0.28,
      size: 0.22,
      gravity: 2,
    });
  }

  shockwave(x: number, y: number, z: number, color: number | string, startScale = 0.2, endScale = 2.4, duration = 0.42): void {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.56, 32), mat);
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(startScale);
    this.group.add(mesh);
    this.rings.push({ mesh, age: 0, duration, startScale, endScale });
  }

  update(dt: number): void {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const s = this.slots[i];
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.active = false;
        this.alphas[i] = 0;
        continue;
      }
      const damp = Math.max(0, 1 - s.drag * dt);
      s.vx *= damp;
      s.vz *= damp;
      s.vy = (s.vy - s.gravity * dt) * damp;
      const p3 = i * 3;
      this.positions[p3] += s.vx * dt;
      this.positions[p3 + 1] = Math.max(0.02, this.positions[p3 + 1] + s.vy * dt);
      this.positions[p3 + 2] += s.vz * dt;
      this.alphas[i] = Math.max(0, s.life / s.maxLife);
    }

    const g = this.points.geometry;
    (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.age += dt;
      const t = Math.min(1, r.age / r.duration);
      const scale = r.startScale + (r.endScale - r.startScale) * (1 - (1 - t) * (1 - t));
      r.mesh.scale.setScalar(scale);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - t);
      if (t >= 1) {
        this.group.remove(r.mesh);
        r.mesh.geometry.dispose();
        (r.mesh.material as THREE.Material).dispose();
        this.rings.splice(i, 1);
      }
    }
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
    for (const r of this.rings) {
      r.mesh.geometry.dispose();
      (r.mesh.material as THREE.Material).dispose();
    }
    this.rings.length = 0;
  }
}
