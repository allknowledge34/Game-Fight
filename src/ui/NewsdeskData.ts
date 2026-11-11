import type { FighterId } from '../core/types';
import { FIGHTER_ROSTER } from '../characters/roster';

export interface AnchorInfo {
  name: string;
  channel: string;
}

export const ANCHORS: Record<'godi' | 'troll', AnchorInfo> = {
  godi: { name: 'SHOR SHARMA', channel: 'BREAKING BAKWAS' },
  troll: { name: 'TWEETY TROLLWALA', channel: 'TROLL ARMY' },
};

export const FILLER_TICKER: readonly string[] = [
  'SATIRE LIVE: Sansad Showdown — the fight nobody demanded',
  'MARKETS ALERT: Kursi Index opens 400 points higher ahead of Round 1',
  'CHAI REPORT: Cutting chai prices unchanged despite heavy ring-side demand',
  'POLLSTER UPDATE: 100% of spectators agree someone will win or draw',
  'TRAFFIC ADVISORY: Stray cow reported near Jantar Mantar sundial court',
  'WEATHER DESK: Chances of flying chappals and dramatic dialogues remain high',
];

const HYPE_LINES = {
  godi: [
    'MASTERSTROKE! {M} — nation is proud!',
    'Historic! Unprecedented! {A} ka {M}!',
    'Experts say: best {M} of the century!',
    'Opposition is SPEECHLESS!',
    'Doston, josh is HIGH! Full power!',
  ],
  troll: [
    '#{M} trending No. 1 worldwide!',
    'Screenshot le lo, history ban rahi hai!',
    '{A} ne fatafat maar diya!',
    "{D} got ratio'd in real time!",
    'Bro just dropped a viral {M} fr fr!',
  ],
};

const SPIN_LINES = {
  godi: [
    'Strategic retreat! 4D chess hai!',
    '{D} is only TESTING the opposition!',
    'Poori timeline samajhiye... this was planned!',
  ],
  troll: [
    'That was a JUMLA punch, didn’t even hurt!',
    'Fact-check pending on that hit!',
    'Fake news! Scripted lag raha hai!',
  ],
};

export const LOSER_EXCUSES: Record<FighterId, readonly string[]> = {
  modi: [
    '"Yeh sab pichhle 70 saal ki galti hai." — MitraMan camp',
    '"Opposition ki saazish thi." — MitraMan camp',
    '"Hum aatmanirbhar haar se seekhenge." — MitraMan camp',
  ],
  rahul: [
    '"Scoreboard hack ho gaya tha." — Yatra Boy camp',
    '"Introspection committee banayi jayegi." — Yatra Boy camp',
    '"Main yatra se aur strong waapas aaunga." — Yatra Boy camp',
  ],
  didi: [
    '"Sab referee ki chaal hai!" — Deedee camp',
    '"Kal se dharna shuru. Ladai abhi baaki hai!" — Deedee camp',
  ],
  trump: [
    '"The fight was rigged. Very unfair!" — Taau camp',
    '"Tariffs on the referee, effective immediately." — Taau camp',
  ],
  yogi: [
    '"Bulldozer ka diesel khatam ho gaya tha." — Dozer Dada camp',
    '"Yeh haar nahi, lunch break tha." — Dozer Dada camp',
  ],
  nitin: [
    '"Road under construction tha, isliye haare." — Toll Man camp',
    '"Agli baar 6-lane expressway pe ladenge." — Toll Man camp',
  ],
  ravi: [
    '"Main late nahi, bas thoda jaldi haar gaya." — Babu camp',
    '"Interval hua hai, climax abhi aayega." — Babu camp',
  ],
  lalu: [
    '"Signal laal tha, isliye ruk gaye." — Raja camp',
    '"Gaadi late thi, haar nahi." — Raja camp',
  ],
  amit: [
    '"Yeh haar nahi, agli chaal ki taiyaari hai." — Ghar Mantri camp',
    '"Booth-wise review ke baad baat karenge." — Ghar Mantri camp',
  ],
  dhruv: [
    '"Part 2 mein poora sach aayega." — Fact Bhai camp',
    '"Algorithm ne reach kam kar di." — Fact Bhai camp',
  ],
  mbapu: [
    '"Shanti kamzori nahi, strategy hai." — Mbapu camp',
    '"Main sirf aapka sabar dekh raha tha." — Mbapu camp',
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

  const favGodi = attackerId === 'modi' || attackerId === 'amit' || attackerId === 'yogi';
  const godi = sub(pick(favGodi ? HYPE_LINES.godi : SPIN_LINES.godi));
  const troll = sub(pick(favGodi ? SPIN_LINES.troll : HYPE_LINES.troll));
  return {
    godi,
    troll,
    ticker: `BREAKING: ${atk}'s ${moveLabel} rocks ${def}! Panelists lose chill.`,
  };
}

export function buildNewspaperResult(
  winnerId: FighterId,
  loserId: FighterId,
  wins: [number, number],
  draw: boolean,
): { masthead: string; headline: string; sub: string; excuse: string; caption: string } {
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)];
  const w = FIGHTER_ROSTER[winnerId];
  const l = FIGHTER_ROSTER[loserId];
  const hi = Math.max(wins[0], wins[1]);
  const lo = Math.min(wins[0], wins[1]);
  const sweep = hi - lo >= 2;

  return {
    masthead: pick(MASTHEADS),
    headline: draw
      ? 'DEADLOCK IN SANSAD! NOBODY BUDGES!'
      : sweep
        ? `${w.name} SWEEPS ${l.name} IN LANDSLIDE!`
        : `${w.name} EDGES PAST ${l.name} IN THRILLER!`,
    sub: draw
      ? 'HUNG PARLIAMENT · Recount ordered immediately'
      : sweep
        ? `LANDSLIDE ${hi}–${lo} · Opposition demands committee`
        : `NAIL-BITER ${hi}–${lo} · Final second drama`,
    excuse: pick(LOSER_EXCUSES[loserId]),
    caption: `${w.fullName} celebrates after closing arguments at Sansad Arena.`,
  };
}
