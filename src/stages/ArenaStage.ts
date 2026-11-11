import * as THREE from 'three';
import type { StageId } from '../core/types';
import { STAGE_THEMES } from './stageThemes';
import type { HazardSnapshot } from '../core/types';

function makeCanvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  draw(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const PLACARDS = [
  { text: 'VOTE!', bg: '#ffffff', fg: '#b31b1b' },
  { text: 'BADLAV', bg: '#16a34a', fg: '#ffffff' },
  { text: 'SUNO!', bg: '#f59e0b', fg: '#1a1106' },
  { text: 'JAI HIND', bg: '#ff9933', fg: '#141418' },
  { text: 'JUMLA!', bg: '#2563eb', fg: '#ffffff' },
];

export class ArenaStage {
  readonly group = new THREE.Group();
  readonly stageRoot = new THREE.Group();
  readonly sunLight: THREE.DirectionalLight;
  readonly hemiLight: THREE.HemisphereLight;

  private stage: StageId = 'sansad';
  private floorMesh!: THREE.Mesh;
  private skyDome!: THREE.Mesh;
  private skyMat!: THREE.ShaderMaterial;

  private flags: { mesh: THREE.Mesh; baseX: Float32Array; phase: number }[] = [];
  private crowdInst!: THREE.InstancedMesh;
  private headInst!: THREE.InstancedMesh;
  private crowdBase: { x: number; y: number; z: number; rot: number; phase: number }[] = [];
  private placards: THREE.InstancedMesh[] = [];
  private phonesInst!: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();

  private diyas: THREE.Mesh[] = [];
  private chaiwala = new THREE.Group();
  private cow = new THREE.Group();
  private mithai = new THREE.Group();
  private bomb = new THREE.Group();

  private excitement = 0.2;
  private boredom = 0;
  private mood = 0;

  constructor() {
    this.hemiLight = new THREE.HemisphereLight(0xffc09a, 0x452822, 0.9);
    this.group.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xffb36b, 1.9);
    this.sunLight.position.set(8, 16, 10);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(512, 512);
    this.sunLight.shadow.camera.near = 2;
    this.sunLight.shadow.camera.far = 45;
    this.sunLight.shadow.camera.left = -12;
    this.sunLight.shadow.camera.right = 12;
    this.sunLight.shadow.camera.top = 12;
    this.sunLight.shadow.camera.bottom = -4;
    this.group.add(this.sunLight);

    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: new THREE.Color(STAGE_THEMES.sansad.skyTop) },
        uMid: { value: new THREE.Color(STAGE_THEMES.sansad.skyMid) },
        uHorizon: { value: new THREE.Color(STAGE_THEMES.sansad.skyHorizon) },
      },
      vertexShader: `
        varying vec3 vWorld;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 uTop;
        uniform vec3 uMid;
        uniform vec3 uHorizon;
        varying vec3 vWorld;
        void main() {
          float h = clamp(normalize(vWorld).y, 0.0, 1.0);
          vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.28, h));
          col = mix(col, uTop, smoothstep(0.28, 0.85, h));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.skyDome = new THREE.Mesh(new THREE.SphereGeometry(95, 24, 16), this.skyMat);
    this.group.add(this.skyDome);

    this.group.add(this.stageRoot);
    this.buildDynamicProps();
    this.buildCrowd();
    this.setStage('sansad');
  }

  private buildDynamicProps(): void {
    // Chaiwala strolling in background
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.2, 0.9, 10),
      new THREE.MeshStandardMaterial({ color: 0xa61c24, roughness: 0.8 }),
    );
    body.position.y = 0.75;
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xb0754d, roughness: 0.7 }),
    );
    head.position.y = 1.35;
    const turban = new THREE.Mesh(
      new THREE.TorusGeometry(0.15, 0.055, 8, 14),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.7 }),
    );
    turban.rotation.x = Math.PI / 2;
    turban.position.y = 1.44;
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.14, 0.24),
      new THREE.MeshStandardMaterial({ color: 0x7c4a26, roughness: 0.85 }),
    );
    crate.position.set(0.24, 0.95, 0.14);
    this.chaiwala.add(body, head, turban, crate);
    this.chaiwala.position.set(-4.5, 0, -2.5);
    this.group.add(this.chaiwala);

    // Stray Cow hazard
    const cowBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 0.56, 0.44),
      new THREE.MeshStandardMaterial({ color: 0xf5efe2, roughness: 0.75 }),
    );
    cowBody.position.y = 0.62;
    const patch = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.34, 0.46),
      new THREE.MeshStandardMaterial({ color: 0x422a1b, roughness: 0.8 }),
    );
    patch.position.set(-0.08, 0.68, 0);
    const cowHead = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.32, 0.28),
      new THREE.MeshStandardMaterial({ color: 0xf5efe2, roughness: 0.7 }),
    );
    cowHead.position.set(0.56, 0.76, 0);
    const bell = new THREE.Mesh(
      new THREE.ConeGeometry(0.06, 0.1, 8),
      new THREE.MeshStandardMaterial({ color: 0xffc13b, metalness: 0.8, roughness: 0.25 }),
    );
    bell.position.set(0.45, 0.52, 0);
    this.cow.add(cowBody, patch, cowHead, bell);
    this.cow.visible = false;
    this.group.add(this.cow);

    // Soan Papdi mithai heal box
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.44, 0.2, 0.34),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4, emissive: 0x6b3a00 }),
    );
    box.position.y = 0.14;
    const ribbon = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.06, 0.08),
      new THREE.MeshStandardMaterial({ color: 0xdc2626 }),
    );
    ribbon.position.y = 0.24;
    this.mithai.add(box, ribbon);
    this.mithai.visible = false;
    this.group.add(this.mithai);

    // Sutli bomb hazard
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.36, 8),
      new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.6 }),
    );
    cone.position.y = 0.18;
    const spark = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff5a1f }),
    );
    spark.position.y = 0.39;
    this.bomb.add(cone, spark);
    this.bomb.visible = false;
    this.group.add(this.bomb);
  }

  private buildCrowd(): void {
    const count = 180;
    const palette = [0xff9933, 0x2e9bff, 0x22b35e, 0xe11d48, 0xf59e0b, 0xa855f7, 0xffffff];
    const bodyGeo = new THREE.CylinderGeometry(0.16, 0.2, 0.56, 8);
    const headGeo = new THREE.SphereGeometry(0.13, 8, 8);

    this.crowdInst = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ roughness: 0.85 }), count);
    this.headInst = new THREE.InstancedMesh(
      headGeo,
      new THREE.MeshStandardMaterial({ color: 0xb98258, roughness: 0.75 }),
      count,
    );

    const cColor = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const side = i < count / 2 ? -1 : 1;
      const local = i % (count / 2);
      const tier = Math.floor(local / 15);
      const slot = local % 15;
      const x = side * (6.9 + tier * 0.78 + (Math.random() - 0.5) * 0.2);
      const y = tier * 0.32;
      const z = -6.2 + slot * 0.82 + (Math.random() - 0.5) * 0.25;
      this.crowdBase.push({ x, y, z, rot: side > 0 ? -Math.PI / 2 : Math.PI / 2, phase: Math.random() * Math.PI * 2 });
      cColor.setHex(palette[i % palette.length]);
      this.crowdInst.setColorAt(i, cColor);
    }
    this.crowdInst.instanceColor!.needsUpdate = true;
    this.group.add(this.crowdInst, this.headInst);

    // Placards & Boredom phones
    const planeGeo = new THREE.PlaneGeometry(0.8, 0.45);
    planeGeo.translate(0, 0.85, 0);
    for (const pl of PLACARDS) {
      const tex = makeCanvasTex(192, 96, (ctx) => {
        ctx.fillStyle = pl.bg;
        ctx.fillRect(0, 0, 192, 96);
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 6;
        ctx.strokeRect(4, 4, 184, 88);
        ctx.fillStyle = pl.fg;
        ctx.font = 'bold 40px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(pl.text, 96, 50);
      });
      const inst = new THREE.InstancedMesh(
        planeGeo,
        new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 }),
        30,
      );
      inst.frustumCulled = false;
      this.group.add(inst);
      this.placards.push(inst);
    }

    this.phonesInst = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.08, 0.14, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x38bdf8, emissiveIntensity: 0.65 }),
      36,
    );
    this.phonesInst.frustumCulled = false;
    this.group.add(this.phonesInst);
  }

  setStage(stage: StageId): void {
    this.stage = stage;
    const theme = STAGE_THEMES[stage];

    // Clear previous stage geometry & dispose safely
    while (this.stageRoot.children.length > 0) {
      const child = this.stageRoot.children.pop()!;
      this.stageRoot.remove(child);
    }
    this.flags = [];
    this.diyas = [];

    this.skyMat.uniforms.uTop.value.setHex(theme.skyTop);
    this.skyMat.uniforms.uMid.value.setHex(theme.skyMid);
    this.skyMat.uniforms.uHorizon.value.setHex(theme.skyHorizon);

    this.sunLight.color.setHex(theme.sunColor);
    this.sunLight.intensity = theme.sunIntensity;
    this.hemiLight.color.setHex(theme.hemiTop);
    this.hemiLight.groundColor.setHex(theme.hemiBottom);
    this.hemiLight.intensity = theme.hemiIntensity;

    // Ground plane with stage-specific pattern
    const floorTex = makeCanvasTex(1024, 512, (ctx) => {
      ctx.fillStyle = theme.floorPrimary;
      ctx.fillRect(0, 0, 1024, 512);
      if (stage === 'road') {
        for (let i = 0; i < 1600; i++) {
          ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.08)';
          ctx.fillRect(Math.random() * 1024, Math.random() * 512, 6, 4);
        }
        ctx.fillStyle = '#f8fafc';
        for (let x = 20; x < 1024; x += 96) {
          ctx.fillRect(x, 250, 52, 12);
        }
        const confetti = ['#ff9933', '#2e9bff', '#ef4444', '#facc15', '#22c55e'];
        for (let c = 0; c < 120; c++) {
          ctx.fillStyle = confetti[c % confetti.length];
          ctx.fillRect(Math.random() * 1024, Math.random() * 512, 8, 5);
        }
      } else {
        const size = 64;
        for (let y = 0; y < 512; y += size) {
          for (let x = 0; x < 1024; x += size) {
            if (((x / size + y / size) | 0) % 2 === 0) {
              ctx.fillStyle = theme.floorSecondary;
              ctx.fillRect(x, y, size, size);
            }
          }
        }
        if (stage === 'sansad') {
          // Diwali Festive Rangoli in arena center
          ctx.save();
          ctx.translate(512, 256);
          const rings: [number, string, number][] = [
            [180, '#1e40af', 16],
            [150, '#be185d', 16],
            [115, '#15803d', 12],
            [82, '#d97706', 12],
            [45, '#facc15', 8],
          ];
          for (const [rad, col, petals] of rings) {
            ctx.fillStyle = col;
            ctx.beginPath();
            for (let p = 0; p < petals * 2; p++) {
              const a = (p / (petals * 2)) * Math.PI * 2;
              const r = p % 2 === 0 ? rad : rad * 0.78;
              if (p === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
              else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
            }
            ctx.closePath();
            ctx.fill();
          }
          ctx.restore();
        }
      }
    });
    floorTex.wrapS = THREE.ClampToEdgeWrapping;
    floorTex.wrapT = THREE.ClampToEdgeWrapping;

    this.floorMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 14),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.86 }),
    );
    this.floorMesh.rotation.x = -Math.PI / 2;
    this.floorMesh.receiveShadow = true;
    this.stageRoot.add(this.floorMesh);

    if (stage === 'sansad') this.buildSansadBackdrop();
    else if (stage === 'jantar') this.buildJantarBackdrop();
    else this.buildRoadBackdrop();
  }

  private addTricolorFlag(x: number, z: number): void {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.06, 7.6, 8),
      new THREE.MeshStandardMaterial({ color: 0xd4d4d8, metalness: 0.6, roughness: 0.3 }),
    );
    pole.position.set(x, 3.8, z);
    this.stageRoot.add(pole);

    const flagTex = makeCanvasTex(256, 160, (ctx) => {
      ctx.fillStyle = '#ff9933';
      ctx.fillRect(0, 0, 256, 53);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 53, 256, 54);
      ctx.fillStyle = '#138808';
      ctx.fillRect(0, 107, 256, 53);
      ctx.strokeStyle = '#000080';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(128, 80, 20, 0, Math.PI * 2);
      ctx.stroke();
    });
    const geo = new THREE.PlaneGeometry(2.1, 1.35, 10, 4);
    geo.translate(1.05, 0, 0);
    const baseX = new Float32Array(geo.attributes.position.array as Float32Array);
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.75 }),
    );
    mesh.position.set(x, 6.8, z);
    this.stageRoot.add(mesh);
    this.flags.push({ mesh, baseX, phase: Math.random() * Math.PI * 2 });
  }

  private buildSansadBackdrop(): void {
    const stone = new THREE.MeshStandardMaterial({ color: 0xa0583c, roughness: 0.85 });
    const trim = new THREE.MeshStandardMaterial({ color: 0xc98b63, roughness: 0.8 });

    // Circular Sansad Bhavan Rotunda + Fluted Pillars
    const base = new THREE.Mesh(new THREE.CylinderGeometry(11.5, 12.2, 0.9, 48), trim);
    base.position.set(0, 0.45, -16.5);
    this.stageRoot.add(base);

    const drum = new THREE.Mesh(new THREE.CylinderGeometry(9.6, 9.6, 5.2, 48), stone);
    drum.position.set(0, 3.2, -16.5);
    this.stageRoot.add(drum);

    const roof = new THREE.Mesh(new THREE.CylinderGeometry(11.2, 11.4, 0.7, 48), trim);
    roof.position.set(0, 6.1, -16.5);
    this.stageRoot.add(roof);

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(5.5, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.45),
      stone,
    );
    dome.position.set(0, 6.4, -16.5);
    this.stageRoot.add(dome);

    const colGeo = new THREE.CylinderGeometry(0.24, 0.28, 5.1, 10);
    const cols = new THREE.InstancedMesh(colGeo, trim, 36);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      dummy.position.set(Math.cos(a) * 10.7, 3.25, -16.5 + Math.sin(a) * 10.7);
      dummy.updateMatrix();
      cols.setMatrixAt(i, dummy.matrix);
    }
    this.stageRoot.add(cols);

    // Diwali Diyas along front apron
    const diyaMat = new THREE.MeshBasicMaterial({ color: 0xffd066 });
    for (let x = -6; x <= 6; x += 1.2) {
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), diyaMat);
      flame.position.set(x, 0.14, -4.4);
      this.stageRoot.add(flame);
      this.diyas.push(flame);
    }

    this.addTricolorFlag(-4.6, -5.2);
    this.addTricolorFlag(4.6, -5.2);
  }

  private buildJantarBackdrop(): void {
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xc2483b, roughness: 0.85 });
    const creamMat = new THREE.MeshStandardMaterial({ color: 0xefe7d6, roughness: 0.7 });

    // Samrat Yantra Gnomon staircase wedge
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(14, 0);
    shape.lineTo(14, 8.2);
    shape.closePath();
    const gnomonGeo = new THREE.ExtrudeGeometry(shape, { depth: 2.2, bevelEnabled: false });
    gnomonGeo.translate(0, 0, -1.1);
    const gnomon = new THREE.Mesh(gnomonGeo, wallMat);
    gnomon.position.set(-1.1, -0.2, -16);
    gnomon.rotation.y = Math.PI / 2;
    this.stageRoot.add(gnomon);

    // Curved Marble Quadrants flanking Samrat Yantra
    for (const s of [-1, 1]) {
      const q = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.36, 10, 28, Math.PI * 0.55), creamMat);
      q.position.set(s * 4.1, 0.6, -15.6);
      q.rotation.y = s * 0.28;
      q.rotation.z = s > 0 ? Math.PI * 0.45 : Math.PI * 0.0;
      this.stageRoot.add(q);

      // Circular Misra / Rama Yantra Observatory Rings
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.2, 3.2, 18, 1, true), wallMat);
      drum.position.set(s * 12.2, 1.4, -14);
      (drum.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      this.stageRoot.add(drum);
    }

    // Heritage Nameboard Plaque
    const signTex = makeCanvasTex(512, 160, (ctx) => {
      ctx.fillStyle = '#7a2a1e';
      ctx.fillRect(0, 0, 512, 160);
      ctx.strokeStyle = '#f1ebe0';
      ctx.lineWidth = 8;
      ctx.strokeRect(8, 8, 496, 144);
      ctx.fillStyle = '#f7efe0';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 54px Georgia, serif';
      ctx.fillText('JANTAR MANTAR', 256, 62);
      ctx.font = '32px sans-serif';
      ctx.fillText('जंतर मंतर · NEW DELHI', 256, 118);
    });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.6, 0.2), [
      wallMat,
      wallMat,
      wallMat,
      wallMat,
      new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.7 }),
      wallMat,
    ]);
    sign.position.set(0, 2.3, -13.2);
    this.stageRoot.add(sign);

    this.addTricolorFlag(-4.6, -5.2);
    this.addTricolorFlag(4.6, -5.2);
  }

  private buildRoadBackdrop(): void {
    const facadeColors = [0xd97706, 0x0ea5e9, 0xe11d48, 0x16a34a, 0xca8a04, 0x9333ea];
    const darkWin = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.4 });
    for (let i = 0; i < 6; i++) {
      const bx = -13 + i * 5.2;
      const bh = 4.6 + (i % 3) * 1.4;
      const b = new THREE.Mesh(
        new THREE.BoxGeometry(4.6, bh, 3.2),
        new THREE.MeshStandardMaterial({ color: facadeColors[i], roughness: 0.85 }),
      );
      b.position.set(bx, bh / 2, -10.5);
      this.stageRoot.add(b);

      for (const wy of [1.8, 3.3]) {
        if (wy + 0.6 > bh) continue;
        for (const wx of [-1.1, 1.1]) {
          const w = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.9, 0.1), darkWin);
          w.position.set(bx + wx, wy, -8.85);
          this.stageRoot.add(w);
        }
      }
    }

    // Parked Auto-Rickshaw (Green & Yellow)
    const auto = new THREE.Group();
    const aBody = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 0.9, 0.95),
      new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.5 }),
    );
    aBody.position.y = 0.6;
    const aCanopy = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.65, 0.92),
      new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.55 }),
    );
    aCanopy.position.y = 1.32;
    const wheelGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.14, 12);
    wheelGeo.rotateX(Math.PI / 2);
    const wMat = new THREE.MeshStandardMaterial({ color: 0x18181b });
    for (const wx of [-0.62, 0.62]) {
      const wh = new THREE.Mesh(wheelGeo, wMat);
      wh.position.set(wx, 0.24, 0.48);
      auto.add(wh);
    }
    auto.add(aBody, aCanopy);
    auto.position.set(-1.4, 0, -5.8);
    this.stageRoot.add(auto);

    // Sabzi fruit carts
    for (const sx of [-5.8, 5.8]) {
      const cart = new THREE.Group();
      const deck = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.2, 0.9),
        new THREE.MeshStandardMaterial({ color: 0x7c4a26, roughness: 0.85 }),
      );
      deck.position.y = 0.72;
      const canopy = new THREE.Mesh(
        new THREE.ConeGeometry(1.1, 0.45, 4),
        new THREE.MeshStandardMaterial({ color: sx < 0 ? 0xdc2626 : 0x2563eb, roughness: 0.7 }),
      );
      canopy.position.y = 2.05;
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6),
        new THREE.MeshStandardMaterial({ color: 0x334155 }),
      );
      pole.position.y = 1.35;
      cart.add(deck, pole, canopy);
      cart.position.set(sx, 0, -5.2);
      this.stageRoot.add(cart);
    }

    this.addTricolorFlag(-4.6, -5.2);
    this.addTricolorFlag(4.6, -5.2);
  }

  setMood(value: number): void {
    this.mood = value;
    const t = STAGE_THEMES[this.stage];
    this.sunLight.intensity = t.sunIntensity * (1 - value * 0.72);
    this.hemiLight.intensity = t.hemiIntensity * (1 - value * 0.68);
  }

  setCrowdEnergy(excitement: number, boredom: number): void {
    this.excitement = excitement;
    this.boredom = boredom;
  }

  update(clock: number, hazards: HazardSnapshot): void {
    // Chaiwala strolling behind stage
    this.chaiwala.position.x = Math.sin(clock * 0.28) * 5.2;
    this.chaiwala.rotation.y = Math.cos(clock * 0.28) > 0 ? Math.PI / 2 : -Math.PI / 2;

    // Hazards
    this.cow.visible = hazards.cowActive;
    if (hazards.cowActive) {
      this.cow.position.set(hazards.cowX, Math.abs(Math.sin(clock * 14)) * 0.08, 0);
      this.cow.rotation.y = hazards.cowDir > 0 ? 0 : Math.PI;
    }

    this.mithai.visible = hazards.mithaiActive;
    if (hazards.mithaiActive) {
      this.mithai.position.set(hazards.mithaiX, Math.sin(clock * 4) * 0.08, 0);
      this.mithai.rotation.y = clock * 1.4;
    }

    this.bomb.visible = hazards.bombActive;
    if (hazards.bombActive) {
      this.bomb.position.set(hazards.bombX, 0, 0);
      const pulse = 1 + Math.sin(clock * 24) * 0.14;
      this.bomb.scale.setScalar(pulse);
    }

    // Diyas flicker
    for (let i = 0; i < this.diyas.length; i++) {
      this.diyas[i].scale.setScalar(0.85 + Math.sin(clock * 11 + i * 1.7) * 0.25);
    }

    // Flags wave
    for (const f of this.flags) {
      const pos = f.mesh.geometry.attributes.position;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) {
        const x = f.baseX[i];
        arr[i + 2] = Math.sin(x * 3 - clock * 5 + f.phase) * 0.12 * x;
        arr[i + 1] = f.baseX[i + 1] - x * 0.04;
      }
      pos.needsUpdate = true;
      f.mesh.geometry.computeVertexNormals();
    }

    // Crowd bounce, placards & boredom phones
    const jumpFactor = (0.04 + this.excitement * 0.18) * (1 - this.boredom * 0.85);
    for (let i = 0; i < this.crowdBase.length; i++) {
      const c = this.crowdBase[i];
      const hop = Math.max(0, Math.sin(clock * (6 + this.excitement * 5) + c.phase)) * jumpFactor;
      const y = c.y + 0.28 + hop;
      this.dummy.position.set(c.x, y, c.z);
      this.dummy.rotation.set(0, c.rot, Math.sin(clock * 2.5 + c.phase) * 0.08);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      this.crowdInst.setMatrixAt(i, this.dummy.matrix);

      this.dummy.position.y = y + 0.45;
      this.dummy.updateMatrix();
      this.headInst.setMatrixAt(i, this.dummy.matrix);
    }
    this.crowdInst.instanceMatrix.needsUpdate = true;
    this.headInst.instanceMatrix.needsUpdate = true;

    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let slot = 0; slot < 30; slot++) {
      const ci = slot * 6;
      const c = this.crowdBase[ci];
      this.dummy.position.set(c.x, c.y + 0.35 + Math.max(0, Math.sin(clock * 6 + c.phase)) * 0.1, c.z);
      this.dummy.rotation.set(0, c.x < 0 ? 0.85 : -0.85, Math.sin(clock * 3.5 + c.phase) * 0.2);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      const targetGroup = slot % this.placards.length;
      for (let p = 0; p < this.placards.length; p++) {
        this.placards[p].setMatrixAt(slot, p === targetGroup ? this.dummy.matrix : zero);
      }
    }
    for (const pl of this.placards) pl.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < 36; i++) {
      if (this.boredom < 0.08) {
        this.phonesInst.setMatrixAt(i, zero);
      } else {
        const c = this.crowdBase[i * 5];
        this.dummy.position.set(c.x + (c.x < 0 ? 0.35 : -0.35), c.y + 0.72, c.z);
        this.dummy.rotation.set(0.25, c.rot, Math.sin(clock * 2 + i) * 0.1);
        this.dummy.scale.setScalar(this.boredom);
        this.dummy.updateMatrix();
        this.phonesInst.setMatrixAt(i, this.dummy.matrix);
      }
    }
    this.phonesInst.instanceMatrix.needsUpdate = true;

    if (this.mood > 0) {
      // Gently decay mood back toward 0 when no super holds it
      this.setMood(Math.max(0, this.mood - 0.01));
    }
  }
}
