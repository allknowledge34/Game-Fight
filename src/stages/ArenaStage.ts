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
  { text: 'K.O.!', bg: '#2563eb', fg: '#ffffff' },
];

interface FireworkRocket {
  group: THREE.Group;
  particles: THREE.Mesh[];
  dirs: THREE.Vector3[];
  phase: number;
  origin: THREE.Vector3;
  color: number;
}

export class ArenaStage {
  readonly group = new THREE.Group();
  readonly stageRoot = new THREE.Group();
  readonly sunLight: THREE.DirectionalLight;
  readonly hemiLight: THREE.HemisphereLight;
  fog: THREE.Fog | null = null;

  private stage: StageId = 'sansad';
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
  private lanterns: { group: THREE.Group; baseY: number; phase: number }[] = [];
  private fireworks: FireworkRocket[] = [];
  private stringBulbs: THREE.Mesh[] = [];

  private chaiwala = new THREE.Group();
  private cow = new THREE.Group();
  private mithai = new THREE.Group();
  private bomb = new THREE.Group();

  private excitement = 0.25;
  private boredom = 0;
  private mood = 0;

  constructor() {
    this.hemiLight = new THREE.HemisphereLight(0xffde80, 0x623b2a, 1.25);
    this.group.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xffd2a0, 2.6);
    this.sunLight.position.set(-6, 12, 9);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(1024, 1024);
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
          vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.08, h));
          col = mix(col, uTop, smoothstep(0.08, 0.22, h));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.skyDome = new THREE.Mesh(new THREE.SphereGeometry(140, 28, 18), this.skyMat);
    this.group.add(this.skyDome);

    this.group.add(this.stageRoot);
    this.buildDynamicProps();
    this.buildCrowd();
    this.setStage('sansad');
  }

  private buildDynamicProps(): void {
    // Chaiwala strolling behind stage
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
      new THREE.BoxGeometry(0.34, 0.14, 0.26),
      new THREE.MeshStandardMaterial({ color: 0x7c4a26, roughness: 0.85 }),
    );
    crate.position.set(0.24, 0.95, 0.14);
    this.chaiwala.add(body, head, turban, crate);
    this.chaiwala.position.set(-4.5, 0, -2.6);
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

    // Primed Sutli / TNT hazard
    const cone = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.34, 0.34),
      new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.55 }),
    );
    cone.position.y = 0.17;
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.11, 0.36),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.45 }),
    );
    stripe.position.y = 0.17;
    const spark = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff9f1c }),
    );
    spark.position.y = 0.4;
    this.bomb.add(cone, stripe, spark);
    this.bomb.visible = false;
    this.group.add(this.bomb);
  }

  private buildCrowd(): void {
    // 420 spectator fans arranged on 5 tiered bleachers left & right (matching FightKaro's 420 crowd instancing)
    const count = 420;
    const palette = [0xff9933, 0x2e9bff, 0x22b35e, 0xe11d48, 0xf59e0b, 0xa855f7, 0xffffff];
    const bodyGeo = new THREE.CylinderGeometry(0.15, 0.19, 0.54, 8);
    const headGeo = new THREE.SphereGeometry(0.125, 8, 8);

    this.crowdInst = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ roughness: 0.85 }), count);
    this.headInst = new THREE.InstancedMesh(
      headGeo,
      new THREE.MeshStandardMaterial({ color: 0xb98258, roughness: 0.75 }),
      count,
    );

    const cColor = new THREE.Color();
    const perSide = count / 2;
    const tiers = 5;
    const perTier = perSide / tiers;
    for (let i = 0; i < count; i++) {
      const side = i < perSide ? -1 : 1;
      const local = i % perSide;
      const tier = Math.floor(local / perTier);
      const slot = local % perTier;
      const x = side * (8.2 + tier * 0.72 + ((i * 7) % 10) * 0.015);
      const y = tier * 0.34 - 0.15;
      const z = -5.6 + slot * 0.34 + ((i * 13) % 7) * 0.02;
      this.crowdBase.push({ x, y, z, rot: side > 0 ? -Math.PI / 2 : Math.PI / 2, phase: (i * 0.73) % (Math.PI * 2) });
      cColor.setHex(palette[i % palette.length]);
      this.crowdInst.setColorAt(i, cColor);
    }
    this.crowdInst.instanceColor!.needsUpdate = true;
    this.group.add(this.crowdInst, this.headInst);

    const planeGeo = new THREE.PlaneGeometry(0.84, 0.46);
    planeGeo.translate(0, 0.88, 0);
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
        36,
      );
      inst.frustumCulled = false;
      this.group.add(inst);
      this.placards.push(inst);
    }

    this.phonesInst = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.08, 0.14, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x38bdf8, emissiveIntensity: 0.75 }),
      48,
    );
    this.phonesInst.frustumCulled = false;
    this.group.add(this.phonesInst);
  }

  private disposeStageGroup(): void {
    const disposeObj = (obj: THREE.Object3D) => {
      for (const ch of obj.children) disposeObj(ch);
      if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) {
        obj.geometry.dispose();
        const m = obj.material;
        if (Array.isArray(m)) m.forEach((mt) => mt.dispose());
        else m?.dispose();
      }
    };
    while (this.stageRoot.children.length > 0) {
      const ch = this.stageRoot.children.pop()!;
      disposeObj(ch);
      this.stageRoot.remove(ch);
    }
    this.flags = [];
    this.diyas = [];
    this.lanterns = [];
    this.fireworks = [];
    this.stringBulbs = [];
  }

  setStage(stage: StageId): void {
    this.stage = stage;
    const theme = STAGE_THEMES[stage];
    this.disposeStageGroup();

    this.skyMat.uniforms.uTop.value.setHex(theme.skyTop);
    this.skyMat.uniforms.uMid.value.setHex(theme.skyMid);
    this.skyMat.uniforms.uHorizon.value.setHex(theme.skyHorizon);
    this.fog = new THREE.Fog(theme.fog, theme.fogNear, theme.fogFar);

    this.sunLight.color.setHex(theme.sunColor);
    this.sunLight.intensity = theme.sunIntensity;
    this.sunLight.position.set(...theme.sunPos);
    this.hemiLight.color.setHex(theme.hemiTop);
    this.hemiLight.groundColor.setHex(theme.hemiBottom);
    this.hemiLight.intensity = theme.hemiIntensity;

    // Outer ground horizon plane (r=130 @ y=-0.31) + Bleacher benches
    const outerColor = stage === 'jantar' ? 0x2d7a2d : stage === 'road' ? 0x3f3d39 : 0x5c3726;
    const outerGround = new THREE.Mesh(
      new THREE.CircleGeometry(130, 48),
      new THREE.MeshStandardMaterial({ color: outerColor, roughness: 0.95 }),
    );
    outerGround.rotation.x = -Math.PI / 2;
    outerGround.position.y = -0.31;
    outerGround.receiveShadow = true;
    this.stageRoot.add(outerGround);

    // Tiered bench geometry left & right for bleachers
    const benchMat = new THREE.MeshStandardMaterial({ color: 0x3b2c26, roughness: 0.88 });
    for (const sx of [-1, 1]) {
      for (let t = 0; t < 5; t++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.28, 12.2), benchMat);
        b.position.set(sx * (8.2 + t * 0.72), t * 0.34 - 0.16, 0);
        this.stageRoot.add(b);
      }
    }

    // Raised FightKaro Fighting Deck (15.5 x 0.3 x 8, top surface at y = 0)
    const floorTex = this.buildStageFloorTexture(stage, theme.floorPrimary, theme.floorSecondary);
    const topMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: stage === 'road' ? 0.9 : 0.75 });
    const sideMat = new THREE.MeshStandardMaterial({ color: stage === 'road' ? 0x2c2b28 : 0x702d20, roughness: 0.85 });
    const court = new THREE.Mesh(
      new THREE.BoxGeometry(15.5, 0.3, 8),
      [sideMat, sideMat, topMat, sideMat, sideMat, sideMat],
    );
    court.position.set(0, -0.15, 0);
    court.receiveShadow = true;
    this.stageRoot.add(court);

    if (stage === 'sansad') this.buildSansadBackdrop();
    else if (stage === 'jantar') this.buildJantarBackdrop();
    else this.buildRoadBackdrop();
  }

  private buildStageFloorTexture(stage: StageId, primary: string, secondary: string): THREE.CanvasTexture {
    const tex = makeCanvasTex(1024, 512, (ctx) => {
      ctx.fillStyle = primary;
      ctx.fillRect(0, 0, 1024, 512);

      if (stage === 'road') {
        for (let i = 0; i < 2200; i++) {
          ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.09)';
          ctx.fillRect((i * 79) % 1024, (i * 193) % 512, 5, 4);
        }
        // Subtle dark oil puddles & cracks
        ctx.fillStyle = 'rgba(24,24,27,0.35)';
        for (const [px, py, rw, rh] of [[210, 160, 110, 42], [740, 320, 140, 50], [490, 390, 95, 32]]) {
          ctx.beginPath();
          ctx.ellipse(px, py, rw, rh, 0.2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#f8fafc';
        for (let x = 20; x < 1024; x += 96) {
          ctx.fillRect(x, 250, 54, 12);
        }
        const confetti = ['#ff9933', '#2e9bff', '#ef4444', '#facc15', '#22c55e'];
        for (let c = 0; c < 140; c++) {
          ctx.fillStyle = confetti[c % confetti.length];
          ctx.fillRect((c * 137) % 1024, (c * 227) % 512, 8, 5);
        }
      } else {
        // Checkerboard marble court
        const sz = 64;
        for (let y = 0; y < 512; y += sz) {
          for (let x = 0; x < 1024; x += sz) {
            if (((x / sz + y / sz) | 0) % 2 === 0) {
              ctx.fillStyle = secondary;
              ctx.fillRect(x, y, sz, sz);
            }
          }
        }
        if (stage === 'sansad') {
          // 6-Layer Marathi/Delhi Diwali Rangoli centerpiece matching FightKaro Xt()
          ctx.save();
          ctx.translate(512, 256);
          const layers: [number, string, number][] = [
            [205, '#2563eb', 16],
            [170, '#ec4899', 16],
            [132, '#16a34a', 12],
            [95, '#f97316', 12],
            [58, '#facc15', 10],
            [24, '#dc2626', 8],
          ];
          for (const [rad, col, petals] of layers) {
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
        } else if (stage === 'jantar') {
          // Engraved Concentric Brass Sundial Clock matching FightKaro Zt()
          ctx.save();
          ctx.translate(512, 256);
          ctx.strokeStyle = '#facc15';
          for (const [r, lw] of [[185, 8], [142, 4], [95, 5], [45, 4]]) {
            ctx.lineWidth = lw;
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.lineWidth = 3;
          for (let s = 0; s < 12; s++) {
            const a = (s / 12) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * 45, Math.sin(a) * 45);
            ctx.lineTo(Math.cos(a) * 185, Math.sin(a) * 185);
            ctx.stroke();
          }
          ctx.restore();
        }
      }
    });
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }

  private addTricolorFlag(x: number, z: number): void {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.06, 7.2, 8),
      new THREE.MeshStandardMaterial({ color: 0xd4d4d8, metalness: 0.65, roughness: 0.25 }),
    );
    pole.position.set(x, 3.4, z);
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
      new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.72 }),
    );
    mesh.position.set(x, 6.2, z);
    this.stageRoot.add(mesh);
    this.flags.push({ mesh, baseX, phase: Math.random() * Math.PI * 2 });
  }

  private buildSansadBackdrop(): void {
    const stone = new THREE.MeshStandardMaterial({ color: 0xa4583c, roughness: 0.85 });
    const trim = new THREE.MeshStandardMaterial({ color: 0xc98b63, roughness: 0.8 });

    // Glowing Sun Disc low over Sansad horizon
    const sunDisc = new THREE.Mesh(
      new THREE.CircleGeometry(7.2, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd28a, transparent: true, opacity: 0.82 }),
    );
    sunDisc.position.set(-30, 9, -85);
    this.stageRoot.add(sunDisc);

    // Majestic Sansad Bhavan Rotunda at z = -34 with 144 fluted columns
    const rotZ = -34;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(15.8, 16.4, 1.1, 64), trim);
    base.position.set(0, 0.25, rotZ);
    this.stageRoot.add(base);

    const drum = new THREE.Mesh(new THREE.CylinderGeometry(13.8, 13.8, 7.5, 64), stone);
    drum.position.set(0, 4.2, rotZ);
    this.stageRoot.add(drum);

    const colGeo = new THREE.CylinderGeometry(0.21, 0.23, 6.4, 8);
    const cols = new THREE.InstancedMesh(colGeo, trim, 144);
    const d = new THREE.Object3D();
    for (let i = 0; i < 144; i++) {
      const a = (i / 144) * Math.PI * 2;
      d.position.set(Math.cos(a) * 15.0, 3.6, rotZ + Math.sin(a) * 15.0);
      d.updateMatrix();
      cols.setMatrixAt(i, d.matrix);
    }
    this.stageRoot.add(cols);

    const cornice = new THREE.Mesh(new THREE.CylinderGeometry(15.6, 15.9, 0.8, 64), trim);
    cornice.position.set(0, 7.1, rotZ);
    this.stageRoot.add(cornice);

    const upperDrum = new THREE.Mesh(new THREE.CylinderGeometry(11.6, 12.2, 1.8, 48), stone);
    upperDrum.position.set(0, 8.2, rotZ);
    this.stageRoot.add(upperDrum);

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(9.2, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.48),
      stone,
    );
    dome.scale.y = 0.45;
    dome.position.set(0, 9.0, rotZ);
    this.stageRoot.add(dome);

    // India Gate distant landmark at (24, -0.3, -46)
    const gate = new THREE.Group();
    const legGeo = new THREE.BoxGeometry(2.1, 9.2, 2.2);
    const lLeg = new THREE.Mesh(legGeo, stone);
    lLeg.position.set(-2.3, 4.6, 0);
    const rLeg = new THREE.Mesh(legGeo, stone);
    rLeg.position.set(2.3, 4.6, 0);
    const span = new THREE.Mesh(new THREE.BoxGeometry(6.8, 2.2, 2.3), trim);
    span.position.set(0, 9.4, 0);
    const topCap = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.9, 2.6), stone);
    topCap.position.set(0, 10.9, 0);
    gate.add(lLeg, rLeg, span, topCap);
    gate.position.set(22, -0.3, -46);
    gate.rotation.y = -0.32;
    this.stageRoot.add(gate);

    // Diwali Warm Fairy Light Garlands on Sansad eaves + raised court rims (240 bulbs!)
    const bulbGeo = new THREE.SphereGeometry(0.085, 6, 6);
    const bulbColors = [0xffcf56, 0xff7b2e, 0xf472b6, 0x38bdf8, 0x4ade80];
    const addBulb = (x: number, y: number, z: number, col: number) => {
      const m = new THREE.Mesh(bulbGeo, new THREE.MeshBasicMaterial({ color: col }));
      m.position.set(x, y, z);
      this.stageRoot.add(m);
      this.stringBulbs.push(m);
    };
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 1.15 - Math.PI * 0.08;
      addBulb(Math.cos(a) * 15.65, 6.75, rotZ + Math.sin(a) * 15.65, bulbColors[i % 2]);
      if (i % 2 === 0) addBulb(Math.cos(a) * 12.1, 8.95, rotZ + Math.sin(a) * 12.1, bulbColors[1]);
    }
    for (let x = -7.6; x <= 7.6; x += 0.35) {
      addBulb(x, -0.05, 4.02, bulbColors[Math.abs(Math.round(x * 3)) % bulbColors.length]);
      addBulb(x, -0.05, -4.02, bulbColors[Math.abs(Math.round(x * 5)) % bulbColors.length]);
    }

    // 32 Clay Diyas along court front & rear apron
    const diyaBase = new THREE.MeshStandardMaterial({ color: 0x7c361a, roughness: 0.85 });
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffd066 });
    for (let i = 0; i < 16; i++) {
      const x = -7.2 + (i / 15) * 14.4;
      for (const z of [-3.75, 3.75]) {
        const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.06, 0.07, 8), diyaBase);
        bowl.position.set(x, 0.035, z);
        const flame = new THREE.Mesh(new THREE.SphereGeometry(0.065, 6, 6), flameMat);
        flame.position.set(x, 0.11, z);
        this.stageRoot.add(bowl, flame);
        this.diyas.push(flame);
      }
    }

    // Hanging Diamond Diwali Akasha Kandil Lanterns
    const lanternSpecs: [number, number, number, number][] = [
      [-6.5, 4.3, -4.5, 0xfbbf24],
      [-3.2, 4.7, -5.8, 0xf472b6],
      [0.2, 4.9, -6.2, 0xe879f9],
      [3.4, 4.6, -5.7, 0x38bdf8],
      [6.5, 4.3, -4.5, 0x4ade80],
    ];
    for (const [lx, ly, lz, lcol] of lanternSpecs) {
      const lg = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.38, 0),
        new THREE.MeshBasicMaterial({ color: lcol }),
      );
      body.scale.y = 1.45;
      lg.add(body);
      lg.position.set(lx, ly, lz);
      this.stageRoot.add(lg);
      this.lanterns.push({ group: lg, baseY: ly, phase: lx });
    }

    // 4 Fireworks Rocket Bursts over Sansad Dome
    const fwColors = [0xffcf40, 0xf472b6, 0x38bdf8, 0x4ade80];
    for (let f = 0; f < 4; f++) {
      const grp = new THREE.Group();
      const pts: THREE.Mesh[] = [];
      const dirs: THREE.Vector3[] = [];
      const col = fwColors[f];
      const fMat = new THREE.MeshBasicMaterial({ color: col });
      for (let p = 0; p < 14; p++) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 6), fMat);
        grp.add(m);
        pts.push(m);
        const phi = (p / 14) * Math.PI * 2;
        const th = ((p % 3) - 1) * 0.55;
        dirs.push(new THREE.Vector3(Math.cos(phi) * Math.cos(th), Math.sin(th) + 0.2, Math.sin(phi) * Math.cos(th)));
      }
      grp.position.set(-12 + f * 8, 12.5 + (f % 2) * 2.5, -24 - (f % 2) * 6);
      this.stageRoot.add(grp);
      this.fireworks.push({ group: grp, particles: pts, dirs, phase: f * 0.9, origin: grp.position.clone(), color: col });
    }

    // 6 Tricolor Flags
    for (const [fx, fz] of [[-7.6, -4.4], [7.6, -4.4], [-4.8, -7.8], [4.8, -7.8], [-10.2, 2.2], [10.2, 2.2]]) {
      this.addTricolorFlag(fx, fz);
    }
  }

  private buildJantarBackdrop(): void {
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xc2483b, roughness: 0.85 });
    const creamMat = new THREE.MeshStandardMaterial({ color: 0xefe7d6, roughness: 0.65 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x266d26, roughness: 0.8 });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c361c, roughness: 0.9 });

    // Samrat Yantra Gnomon Staircase Wedge
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(15, 0);
    shape.lineTo(15, 9.2);
    shape.closePath();
    const gnomonGeo = new THREE.ExtrudeGeometry(shape, { depth: 2.3, bevelEnabled: false });
    gnomonGeo.translate(0, 0, -1.15);
    const gnomon = new THREE.Mesh(gnomonGeo, wallMat);
    gnomon.position.set(0, -0.3, -17);
    gnomon.rotation.y = Math.PI / 2;
    this.stageRoot.add(gnomon);

    // Curved Marble Quadrant Dial Arcs & Red Sandstone Observatory Drums
    for (const s of [-1, 1]) {
      const q = new THREE.Mesh(new THREE.TorusGeometry(4.8, 0.38, 10, 32, Math.PI * 0.56), creamMat);
      q.position.set(s * 4.2, 0.45, -16.4);
      q.rotation.y = s * 0.25;
      q.rotation.z = s > 0 ? Math.PI * 0.44 : 0;
      this.stageRoot.add(q);

      const drum = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.5, 3.6, 20, 1, true), wallMat);
      drum.position.set(s * 12.6, 1.4, -14.5);
      (drum.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      this.stageRoot.add(drum);

      // Garden Trees
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.35, 2.2, 8), trunkMat);
      trunk.position.set(s * 11.5, 0.8, -8.5);
      const crown = new THREE.Mesh(new THREE.SphereGeometry(1.55, 14, 10), leafMat);
      crown.position.set(s * 11.5, 2.7, -8.5);
      this.stageRoot.add(trunk, crown);
    }

    // Authentic Jantar Mantar Heritage Signboard centered in back
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
    const sign = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.7, 0.2), [
      wallMat,
      wallMat,
      wallMat,
      wallMat,
      new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.65 }),
      wallMat,
    ]);
    sign.position.set(0, 2.1, -12.6);
    this.stageRoot.add(sign);

    this.addTricolorFlag(-4.6, -5.2);
    this.addTricolorFlag(4.6, -5.2);
  }

  private buildRoadBackdrop(): void {
    const facadeColors = [0xd97706, 0x0284c7, 0xc97b63, 0xe7c888, 0x86efac, 0xc084fc];
    const darkWin = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.35 });
    const concreteMat = new THREE.MeshStandardMaterial({ color: 0xd6d3d1, roughness: 0.85 });

    // Multi-story buildings + concrete awnings + rooftop water tanks across x = -22..+22
    for (let i = 0; i < 8; i++) {
      const bx = -18.5 + i * 5.3;
      const bh = 4.9 + (i % 3) * 1.25;
      const b = new THREE.Mesh(
        new THREE.BoxGeometry(4.8, bh, 3.6),
        new THREE.MeshStandardMaterial({ color: facadeColors[i % facadeColors.length], roughness: 0.85 }),
      );
      b.position.set(bx, bh / 2 - 0.3, -10.8);
      this.stageRoot.add(b);

      const ledge = new THREE.Mesh(new THREE.BoxGeometry(5.05, 0.22, 0.65), concreteMat);
      ledge.position.set(bx, bh - 0.9, -8.85);
      this.stageRoot.add(ledge);

      if (i % 2 === 0) {
        const tank = new THREE.Mesh(
          new THREE.CylinderGeometry(0.45, 0.45, 0.85, 10),
          new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6 }),
        );
        tank.position.set(bx - 0.8, bh + 0.12, -10.5);
        this.stageRoot.add(tank);
      }

      for (const wy of [1.4, 3.0]) {
        if (wy + 0.6 > bh) continue;
        for (const wx of [-1.15, 0, 1.15]) {
          const w = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.9, 0.12), darkWin);
          w.position.set(bx + wx, wy, -8.98);
          this.stageRoot.add(w);
        }
      }
    }

    // 5 Streetlight Poles & Sagged Catenary Overhead Wires
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x3f3f46, metalness: 0.5 });
    for (let p = 0; p < 5; p++) {
      const px = -12 + p * 6;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 6.2, 8), poleMat);
      pole.position.set(px, 2.8, -7.2);
      this.stageRoot.add(pole);
    }

    // Parked Green & Yellow Auto-Rickshaw with sloped windshield, canopy & headlight
    const auto = new THREE.Group();
    const aShadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.15, 18),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.48 }),
    );
    aShadow.rotation.x = -Math.PI / 2;
    aShadow.position.y = 0.02;
    const aBody = new THREE.Mesh(
      new THREE.BoxGeometry(1.55, 0.72, 0.94),
      new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.42 }),
    );
    aBody.position.set(0.05, 0.56, 0);
    const nose = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.42, 0.65, 8),
      new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.45 }),
    );
    nose.position.set(-0.72, 0.54, 0);
    const aCanopy = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 0.85, 0.72, 8),
      new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.5 }),
    );
    aCanopy.position.set(0.05, 1.26, 0);
    const windScreen = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.48, 0.74),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2, metalness: 0.3 }),
    );
    windScreen.position.set(-0.52, 1.12, 0);
    windScreen.rotation.z = -0.35;
    const headlight = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xfef08a }),
    );
    headlight.position.set(-0.96, 0.66, 0);
    const wheelGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.14, 12);
    wheelGeo.rotateX(Math.PI / 2);
    const wMat = new THREE.MeshStandardMaterial({ color: 0x18181b });
    for (const [wx, wz] of [[-0.68, 0.0], [0.58, 0.46], [0.58, -0.46]]) {
      const wh = new THREE.Mesh(wheelGeo, wMat);
      wh.position.set(wx, 0.22, wz);
      auto.add(wh);
    }
    auto.add(aShadow, aBody, nose, aCanopy, windScreen, headlight);
    auto.position.set(-1.3, 0, -5.7);
    this.stageRoot.add(auto);

    // Sabzi Fruit Carts with fruit heaps
    const fruitColors = [0xf97316, 0x22c55e, 0xeab308, 0xef4444];
    for (const sx of [-5.8, 5.8]) {
      const cart = new THREE.Group();
      const deck = new THREE.Mesh(
        new THREE.BoxGeometry(1.7, 0.22, 0.95),
        new THREE.MeshStandardMaterial({ color: 0x7c4a26, roughness: 0.85 }),
      );
      deck.position.y = 0.72;
      const canopy = new THREE.Mesh(
        new THREE.ConeGeometry(1.15, 0.45, 4),
        new THREE.MeshStandardMaterial({ color: sx < 0 ? 0xdc2626 : 0x2563eb, roughness: 0.7 }),
      );
      canopy.position.y = 2.08;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6), poleMat);
      pole.position.y = 1.35;
      cart.add(deck, pole, canopy);
      const fMat = new THREE.MeshStandardMaterial({ color: sx < 0 ? fruitColors[0] : fruitColors[1], roughness: 0.55 });
      for (let f = 0; f < 12; f++) {
        const fr = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), fMat);
        fr.position.set(-0.55 + (f % 6) * 0.22, 0.9, -0.2 + Math.floor(f / 6) * 0.35);
        cart.add(fr);
      }
      cart.position.set(sx, 0, -5.2);
      this.stageRoot.add(cart);
    }

    // Two Sleeping Tan Street Dogs
    const dogMat = new THREE.MeshStandardMaterial({ color: 0xc2935b, roughness: 0.8 });
    for (const [dx, dz] of [[-5.2, -3.5], [4.4, -3.8]]) {
      const dog = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.42, 4, 8), dogMat);
      dog.rotation.z = Math.PI / 2;
      dog.position.set(dx, 0.14, dz);
      this.stageRoot.add(dog);
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
    this.chaiwala.position.x = Math.sin(clock * 0.28) * 5.4;
    this.chaiwala.rotation.y = Math.cos(clock * 0.28) > 0 ? Math.PI / 2 : -Math.PI / 2;

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
      this.bomb.scale.setScalar(1 + Math.sin(clock * 24) * 0.14);
    }

    for (let i = 0; i < this.diyas.length; i++) {
      this.diyas[i].scale.setScalar(0.85 + Math.sin(clock * 11 + i * 1.7) * 0.25);
    }

    for (const ln of this.lanterns) {
      ln.group.position.y = ln.baseY + Math.sin(clock * 1.6 + ln.phase) * 0.12;
      ln.group.rotation.y = clock * 0.6 + ln.phase;
    }

    for (const fw of this.fireworks) {
      const cycle = ((clock * 0.55 + fw.phase) % 2.4) / 2.4;
      const spread = cycle < 0.7 ? cycle * 3.8 : 0.1;
      const visible = cycle < 0.72;
      fw.group.visible = visible;
      if (visible) {
        for (let p = 0; p < fw.particles.length; p++) {
          fw.particles[p].position.copy(fw.dirs[p]).multiplyScalar(spread);
          fw.particles[p].scale.setScalar(Math.max(0.05, 1.15 - cycle * 1.3));
        }
      }
    }

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

      this.dummy.position.y = y + 0.44;
      this.dummy.updateMatrix();
      this.headInst.setMatrixAt(i, this.dummy.matrix);
    }
    this.crowdInst.instanceMatrix.needsUpdate = true;
    this.headInst.instanceMatrix.needsUpdate = true;

    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let slot = 0; slot < 36; slot++) {
      const ci = (slot * 11) % this.crowdBase.length;
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

    for (let i = 0; i < 48; i++) {
      if (this.boredom < 0.08) {
        this.phonesInst.setMatrixAt(i, zero);
      } else {
        const c = this.crowdBase[(i * 8) % this.crowdBase.length];
        this.dummy.position.set(c.x + (c.x < 0 ? 0.35 : -0.35), c.y + 0.72, c.z);
        this.dummy.rotation.set(0.25, c.rot, Math.sin(clock * 2 + i) * 0.1);
        this.dummy.scale.setScalar(this.boredom);
        this.dummy.updateMatrix();
        this.phonesInst.setMatrixAt(i, this.dummy.matrix);
      }
    }
    this.phonesInst.instanceMatrix.needsUpdate = true;

    if (this.mood > 0) {
      this.setMood(Math.max(0, this.mood - 0.01));
    }
  }
}
