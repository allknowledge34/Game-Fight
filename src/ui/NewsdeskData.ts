import type { FighterId } from '../core/types';
import { FIGHTER_ROSTER } from '../characters/roster';
import { ROSTER_DISPLAY_CONFIG } from '../characters/characterConfigs';

export interface AnchorInfo {
  name: string;
  channel: string;
}

export const ANCHORS: Record<'godi' | 'troll', AnchorInfo> = {
  godi: { name: 'SHOR SHARMA', channel: 'BREAKING BAKWAS' },
  troll: { name: 'TWEETY TROLLWALA', channel: 'TROLL ARMY' },
};

export const FILLER_TICKER: readonly string[] = [
  'SATIRE LIVE: Sansad Showdown — multiverse brawlers hijack Delhi ringside',
  'MARKETS ALERT: Vibranium & Mithril futures surge 400 points ahead of Round 1',
  'CHAI REPORT: Cutting chai prices steady despite Spartan yells & thunderbolts',
  'POLLSTER UPDATE: 100% of spectators agree Overworld TNT violates municipal bylaws',
  'TRAFFIC ADVISORY: Stray cow reported dodging web lines near Jantar Mantar sundial',
  'WEATHER DESK: Chances of Bifrost lightning & flying pixels remain high',
];

const HYPE_LINES = {
  godi: [
    'MASTERSTROKE! {M} — arena is SHOCKED!',
    'Historic! Unprecedented! {A} ka {M}!',
    'Panelists say: best {M} of the multiverse!',
    'The opponent is SPEECHLESS!',
    'Doston, josh is HIGH! Full power!',
  ],
  troll: [
    '#{M} trending No. 1 worldwide!',
    'Clip that NOW — multiverse history!',
    '{A} just dropped a nasty {M}!',
    "{D} got ratio'd in real time!",
    'Chat going crazy over that {M}!!',
  ],
};

const SPIN_LINES = {
  godi: [
    'Tactical spacing! 4D chess hai!',
    '{D} is only charging the comeback meter!',
    'Poori timeline samajhiye... calculated block!',
  ],
  troll: [
    'Bro that hit barely dented the hitbox!',
    'Clip check pending on that exchange!',
    'No way — look at the crowd going wild!',
  ],
};

const MASTHEADS = ['THE DAILY JUMLA', 'SANSAD TIMES', 'BREAKING BAKWAS', 'THE KURSI EXPRESS'];

export function buildNewsReaction(
  attackerId: FighterId,
  defenderId: FighterId,
  moveLabel: string,
): { godi: string; troll: string; ticker: string } {
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)];
  const atk = FIGHTER_ROSTER[attackerId].name;
  const def = FIGHTER_ROSTER[defenderId].name;
  const sub = (tpl: string) => tpl.replace(/\{A\}/g, atk).replace(/\{D\}/g, def).replace(/\{M\}/g, moveLabel);

  const favGodi = attackerId === 'kratos' || attackerId === 'ironman' || attackerId === 'thor';
  const godi = sub(pick(favGodi ? HYPE_LINES.godi : SPIN_LINES.godi));
  const troll = sub(pick(favGodi ? SPIN_LINES.troll : HYPE_LINES.troll));
  return {
    godi,
    troll,
    ticker: `BREAKING: ${atk}'s ${moveLabel} rocks ${def}! Ringside crowds lose chill.`,
  };
}

export function buildNewspaperResult(
  winnerId: FighterId,
  loserId: FighterId,
  wins: [number, number],
  draw: boolean,
): { masthead: string; headline: string; sub: string; excuse: string; caption: string; dateline: string } {
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)];
  const w = FIGHTER_ROSTER[winnerId];
  const l = FIGHTER_ROSTER[loserId];
  const hi = Math.max(wins[0], wins[1]);
  const lo = Math.min(wins[0], wins[1]);
  const sweep = hi - lo >= 2;
  const excuses = ROSTER_DISPLAY_CONFIG[loserId].loserExcuses;
  const dtStr = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).toUpperCase();

  return {
    masthead: pick(MASTHEADS),
    dateline: `NEW DELHI · ${dtStr} · SPECIAL EDITION · PRICE: 1 CHAI`,
    headline: draw
      ? 'DEADLOCK IN SANSAD! NOBODY BUDGES!'
      : sweep
        ? `${w.name} SWEEPS ${l.name} IN LANDSLIDE!`
        : `${w.name} EDGES PAST ${l.name} IN THRILLER!`,
    sub: draw
      ? 'HUNG ARENA · Instant rematch demanded'
      : sweep
        ? `DOMINANT ${hi}–${lo} VICTORY · Arena still shaking`
        : `NAIL-BITER ${hi}–${lo} · Final-second fireworks`,
    excuse: pick(excuses),
    caption: `${w.fullName} stands victorious on the rangoli mat at Sansad Showdown.`,
  };
}
