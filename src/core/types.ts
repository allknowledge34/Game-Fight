export type FighterId =
  | 'kratos'
  | 'wukong'
  | 'michael'
  | 'spiderman'
  | 'ironman'
  | 'thor'
  | 'steve';

export type StageId = 'sansad' | 'jantar' | 'road';

export type Difficulty = 'easy' | 'normal' | 'hard';

export type MoveId =
  | 'jab'
  | 'cross'
  | 'kick'
  | 'uppercut'
  | 'roundhouse'
  | 'finisher'
  | 'lowJab'
  | 'sweep'
  | 'special1'
  | 'special2'
  | 'airPunch'
  | 'airKick'
  | 'grab'
  | 'landing';

export type FighterState =
  | 'idle'
  | 'walkFwd'
  | 'walkBack'
  | 'crouch'
  | 'jump'
  | 'attack'
  | 'hitstun'
  | 'blockstun'
  | 'knockdown'
  | 'getup'
  | 'ko'
  | 'victory'
  | 'intro'
  | 'frozen'
  | 'super';

export type BattlePhase =
  | 'intro'
  | 'roundCall'
  | 'fight'
  | 'grapple'
  | 'super'
  | 'ko'
  | 'matchEnd';

export interface PlayerInput {
  moveX: number; // -1 | 0 | 1
  up: boolean;
  down: boolean;
  punch: boolean;
  kick: boolean;
  grab: boolean;
  super: boolean;
  budget?: boolean;
}

export interface FighterLookSpec {
  skin: number;
  skinShade: number;
  hair: number;
  hairStyle: 'bald' | 'monkey-crown' | 'slick-short' | 'masked' | 'helmet' | 'long-flowing' | 'blocky';
  beard: number;
  beardStyle: 'spartan-thick' | 'monkey-sideburns' | 'stubble' | 'none' | 'norse-full' | 'pixel-goatee';
  brows: number;
  topStyle: 'spartan-armor' | 'wukong-armor' | 'pinstripe-suit' | 'web-suit' | 'iron-armor' | 'asgard-armor' | 'voxel-shirt';
  top: number;
  jacket: number;
  pants: number;
  shoes: number;
  accentMetal: number;
  emissiveGlow: number;
  glasses: boolean;
  capeColor?: number;
  weaponType: 'axe-blades' | 'staff' | 'pistol' | 'webshooters' | 'repulsors' | 'hammer' | 'diamond-sword';
  shoulders: number;
  chestBuild: number;
  belly: number;
  scale: number;
}

export interface FighterProfile {
  id: FighterId;
  name: string;
  fullName: string;
  party: string;
  titleTag: string;
  accent: string;
  isBoss?: boolean;
  modelUrl: string;
  portraitUrl: string;
  voiceLines: {
    intro: string;
    super: string;
    win: string;
    introAudio: string;
    superAudio: string;
    winAudio: string;
  };
  look: FighterLookSpec;
  walkFwd: number;
  walkBack: number;
  jumpV: number;
  jumpVx: number;
  damageMul: number;
  reachMul: number;
  modelHeight: number;
  danceIntro?: boolean;
  moveNames: Partial<Record<MoveId, string>>;
  superName: string;
  superDesc: string;
  introLine: string;
  winLine: string;
  dance: {
    label: string;
    colors: [number, number, number];
  };
}

export interface MoveDefinition {
  id: MoveId;
  startup: number;
  active: number;
  recovery: number;
  damage: number;
  hitstun: number;
  blockstun: number;
  reach: number;
  hitY: number;
  hitHeight: number;
  guardHeight: 'high' | 'mid' | 'low';
  pushback: number;
  launchY: number;
  knockdown: boolean;
  crouching: boolean;
  airborne: boolean;
  lungeX: number;
  chains?: {
    punch?: MoveId;
    kick?: MoveId;
  };
}

export interface AttackInstance {
  moveId: MoveId;
  frame: number;
  hasHit: boolean;
  isCounter?: boolean;
}

export interface FighterSnapshot {
  side: 0 | 1;
  id: FighterId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  grounded: boolean;
  hp: number;
  maxHp: number;
  meter: number;
  state: FighterState;
  stateFrames: number;
  hitstunFrames: number;
  blockstunFrames: number;
  downFrames: number;
  comboCount: number;
  isBlocking: boolean;
  invincibleFrames: number;
  isBoss: boolean;
  attack: AttackInstance | null;
}

export interface HazardSnapshot {
  cowActive: boolean;
  cowX: number;
  cowDir: 1 | -1;
  mithaiActive: boolean;
  mithaiX: number;
  bombActive: boolean;
  bombX: number;
  bombFuse: number;
}

export type CombatEventKind =
  | 'hit'
  | 'block'
  | 'whiff'
  | 'ko'
  | 'grappleStart'
  | 'grappleBreak'
  | 'superStart'
  | 'budgetStart'
  | 'roundStart'
  | 'roundEnd'
  | 'matchEnd'
  | 'cowSpawn'
  | 'cowHit'
  | 'cowDodged'
  | 'mithaiSpawn'
  | 'mithaiPickup'
  | 'bombSpawn'
  | 'bombExplode'
  | 'land'
  | 'popup';

export interface CombatEvent {
  kind: CombatEventKind;
  side?: 0 | 1;
  targetSide?: 0 | 1;
  moveId?: MoveId;
  damage?: number;
  combo?: number;
  counter?: boolean;
  text?: string;
  x?: number;
  y?: number;
  color?: string;
}

export interface MatchOptions {
  p1: FighterId;
  p2: FighterId;
  stage: StageId;
  difficulty: Difficulty;
  mode: 'cpu' | 'online';
  isHost?: boolean;
  roomCode?: string;
  seed?: number;
}

export interface BapuProgress {
  streak: number;
  unlocked: boolean;
  bestSeconds: number;
  bestDamage: number;
  peaceWins: number;
  portalSeen: boolean;
}
